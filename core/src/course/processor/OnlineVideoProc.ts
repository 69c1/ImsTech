import { Page } from 'playwright';
import cliProgress from 'cli-progress';
import { CourseType, Processor } from '../processor.js';
import { waitForStable } from '../../utils.js';
import Config from '../../config.js';

export default class OnlineVideoProc implements Processor {
  name: CourseType = 'online_video';

  async exec(page: Page) {
    await waitForStable(page);

    const rightScreen = page.locator('div.full-screen-mode-content');
    await rightScreen.evaluate((element) => {
      element.scrollTo({
        left: 0,
        top: element.scrollHeight,
        behavior: 'smooth',
      });
      return element.scrollHeight;
    });

    // 等待视频/音频元素加载（可能需要时间加载）
    const mediaType = await this.detectMediaType(page);
    if (!mediaType) {
      console.warn('❌ 未检测到音视频元素，跳过');
      return;
    }

    console.log('✅ 检测到媒体类型:', mediaType);

    await this.setPlaybackRate(page, mediaType);
    const [start, end] = await this.getMediaTime(page, mediaType);

    if (start === end && end !== '00:00') return;

    await this.preparePlayback(page, mediaType);
    const totalSeconds = this.timeStringToNumber(end);
    const progress = this.createProgress(
      this.timeStringToNumber(start),
      totalSeconds,
    );

    // 启动视频状态监控与进度条更新
    const cleanupFns = [
      this.monitorPlayback(page),
      this.trackProgress(page, progress, mediaType, end),
    ];

    // 等待播放结束
    await this.waitForPlaybackEnd(page, mediaType);

    // 清理
    cleanupFns.forEach((fn) => fn());
    console.log('✅ 播放完毕');
  }

  // -------------------------------
  // 🧩 工具方法区域
  // -------------------------------

  private async detectMediaType(page: Page): Promise<'video' | 'audio' | ''> {
    // 先尝试立即检测
    if (await page.locator('video').count()) {
      await this.showVideoControls(page);
      return 'video';
    }
    if (await page.locator('audio').count()) {
      return 'audio';
    }

    // 如果未检测到，等待最多5秒钟让页面加载
    console.log('⏳ 等待媒体元素加载...');
    try {
      await page.waitForSelector('video', { timeout: 5000 }).catch(() => {});
      if (await page.locator('video').count()) {
        await this.showVideoControls(page);
        return 'video';
      }
    } catch {
      // 继续检查音频
    }

    try {
      await page.waitForSelector('audio', { timeout: 5000 }).catch(() => {});
      if (await page.locator('audio').count()) {
        return 'audio';
      }
    } catch {
      // 都未找到
    }

    return '';
  }

  private async showVideoControls(page: Page) {
    await page
      .locator('div.mvp-replay-player-all-controls')
      .evaluate((el) => el.classList.remove('mvp-replay-player-hidden-control'))
      .catch(() => {});
  }

  private async setPlaybackRate(page: Page, mediaType: 'video' | 'audio') {
    await page.evaluate(
      ({ type, rate }) => {
        const media = document.querySelector(type) as HTMLMediaElement;
        if (media) media.playbackRate = rate;
      },
      { type: mediaType, rate: Config.playRate },
    );
  }

  private async getMediaTime(
    page: Page,
    mediaType: 'video' | 'audio',
  ): Promise<[string, string]> {
    const [start, end] =
      mediaType === 'video'
        ? (await page.locator('div.mvp-time-display').textContent())!.split('/')
        : [
            (await page.locator('.current-time').textContent())!,
            (await page.locator('.duration').textContent())!,
          ];
    return [start.trim(), end.trim()];
  }

  private async preparePlayback(page: Page, mediaType: 'video' | 'audio') {
    if (mediaType === 'video') {
      await this.showVideoControls(page);
      await this.trySetVideoQuality(page);
      await this.click(page, '.mvp-toggle-play.mvp-first-btn-margin');
    } else {
      await this.click(page, '.play');
      await this.click(page, '.volume');
    }
  }

  private async trySetVideoQuality(page: Page) {
    try {
      await page.locator('.mvp-player-quality-menu').hover({ timeout: 500 });
      await page.getByText('480p').click({ timeout: 500 });
      console.log('🎞️ 切换视频画质为 480p');
    } catch {
      console.warn('⚠️ 无法切换画质，跳过');
    }
  }

  private async click(page: Page, selector: string) {
    const el = page.locator(selector);
    try {
      await el.scrollIntoViewIfNeeded({ timeout: 1000 });
      await el.waitFor({ state: 'visible', timeout: 1000 });
      await el.click();
    } catch {
      console.warn(`⚠️ 元素 ${selector} 不可点击，尝试使用 JavaScript 点击`);
      // 如果正常点击失败，尝试用 JavaScript 直接点击
      try {
        await el.evaluate((node) => {
          (node as HTMLElement).click();
        });
      } catch {
        console.warn(`⚠️ 元素 ${selector} 点击失败`);
      }
    }
  }

  private monitorPlayback(page: Page) {
    let lastCur = 0;
    let lastRestart = 0;
    let running = false;

    const interval = setInterval(async () => {
      if (running) return; // 防重入
      running = true;

      try {
        const state = await page.evaluate(() => {
          const el =
            document.querySelector('video') || document.querySelector('audio');

          if (!el) return null;

          const media = el as HTMLMediaElement;
          return {
            currentTime: media.currentTime,
            paused: media.paused,
            ended: media.ended,
          };
        });

        if (!state) return;

        const { currentTime, ended } = state;

        // 忽略结束状态
        if (ended) {
          lastCur = currentTime;
          return;
        }

        // 插值判断
        if (Math.abs(currentTime - lastCur) < 0.5) {
          if (Date.now() - lastRestart > 5000) {
            console.log('⚠️ 检测到播放可能卡住，尝试重启播放');
            lastRestart = Date.now();
            await this.restartPlayback(page);
          }
        }
        lastCur = currentTime;
      } catch {
        /* ignore */
      } finally {
        running = false;
      }
    }, 5000);

    return () => clearInterval(interval);
  }

  private async restartPlayback(page: Page) {
    try {
      await this.click(page, '.mvp-toggle-play.mvp-first-btn-margin');
      await page.waitForTimeout(500);
    } catch (e) {
      console.warn('⚠️ 重启播放失败，尝试刷新');
      try {
        await page.reload({ timeout: 10000 });
        await page.waitForLoadState('domcontentloaded');
      } catch {
        console.error('❌ 页面刷新失败');
      }
    }
  }

  private trackProgress(
    page: Page,
    progress: cliProgress.SingleBar,
    mediaType: 'video' | 'audio',
    end: string,
  ) {
    let prev = 0;

    const interval = setInterval(async () => {
      const [curStr] = await this.getMediaTime(page, mediaType);
      const cur = this.timeStringToNumber(curStr);

      if (cur !== prev) {
        progress.update(cur, {
          tcur: curStr,
          tend: end,
        });
        prev = cur;
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      progress.stop(); // 👈 记得结束
    };
  }

  private async waitForPlaybackEnd(page: Page, mediaType: 'video' | 'audio') {
    await page.waitForFunction(
      ({ start, mediaType }) => {
        let cur = '';
        let end = '';
        if (mediaType === 'video') {
          const display = document.querySelector(
            'div.mvp-time-display',
          ) as HTMLElement;
          [cur, end] = display?.textContent?.split('/') ?? ['', ''];
        } else {
          cur =
            (document.querySelector('.current-time') as HTMLElement)
              ?.textContent ?? '';
          end =
            (document.querySelector('.duration') as HTMLElement)?.textContent ??
            '';
        }
        return cur.trim() === end.trim() && cur.trim() !== '';
      },
      { start: Date.now(), mediaType },
      { timeout: 0, polling: 1000 },
    );
  }

  // -------------------------------
  // ⏱️ 时间处理 + 进度条
  // -------------------------------
  private createProgress(cur: number, end: number) {
    const bar = new cliProgress.SingleBar(
      {
        format: '🎬 正在播放 [{bar}] {percentage}% | {tcur}/{tend}',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic,
    );

    bar.start(end, cur, {
      tcur: this.timeNumberToString(cur),
      tend: this.timeNumberToString(end),
    });

    return bar;
  }

  private timeNumberToString(sec: number): string {
    const h = Math.floor(sec / 3600)
      .toString()
      .padStart(2, '0');
    const m = Math.floor((sec % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  private timeStringToNumber(time: string): number {
    const parts = time.split(':').map(Number);
    if (parts.some((n) => isNaN(n) || n < 0)) return 0;
    const [h, m, s] = [0, 0, 0, ...parts].slice(-3);
    return h * 3600 + m * 60 + s;
  }
}
