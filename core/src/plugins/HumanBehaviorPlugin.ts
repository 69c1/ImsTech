import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import type { Browser, Page, Locator } from 'playwright';

export interface HumanBehaviorOptions {
  /** 最小延迟时间(毫秒) */
  delayMin?: number;
  /** 最大延迟时间(毫秒) */
  delayMax?: number;
  /** 点击位置随机抖动范围(像素) */
  jitter?: number;
  /** 鼠标移动最小步数 */
  moveStepsMin?: number;
  /** 鼠标移动最大步数 */
  moveStepsMax?: number;
  /** 双击间隔时间(毫秒) */
  doubleClickInterval?: number;
  /** 右键点击概率(0-1) */
  rightClickProbability?: number;
}

/**
 * 人类行为模拟器
 * 模拟真实用户的鼠标移动、点击、拖拽等交互行为
 */
class HumanBehaviorPlugin extends PuppeteerExtraPlugin {
  private mousePositions: WeakMap<Page, { x: number; y: number }> =
    new WeakMap();

  constructor(opts?: HumanBehaviorOptions) {
    super(opts);
  }

  get name() {
    return 'human-behavior';
  }

  get defaults(): Required<HumanBehaviorOptions> {
    return {
      delayMin: 100,
      delayMax: 800,
      jitter: 5,
      moveStepsMin: 8,
      moveStepsMax: 15,
      doubleClickInterval: 150,
      rightClickProbability: 0.05, // 5%的概率使用右键点击
    };
  }

  /**
   * 生成更符合人类行为的延迟时间
   */
  private generateHumanDelay(min: number, max: number): number {
    // 70%的概率使用短延迟，30%的概率使用长延迟
    const useShortDelay = Math.random() < 0.7;

    if (useShortDelay) {
      // 短延迟：偏向更小的值
      const base = Math.pow(Math.random(), 1.8);
      return min + base * (max * 0.5 - min);
    } else {
      // 长延迟：偏向中等值
      const base = 0.6 + Math.random() * 0.4;
      return max * 0.5 + base * (max - max * 0.5);
    }
  }

  /**
   * 计算随机交互位置
   */
  private calculateInteractionPosition(
    box: { x: number; y: number; width: number; height: number },
    jitter: number,
  ): { x: number; y: number } {
    // 避免点击在边界上，向内收缩15%
    const paddingX = box.width * 0.15;
    const paddingY = box.height * 0.15;

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    const effectiveWidth = box.width - paddingX * 2;
    const effectiveHeight = box.height - paddingY * 2;

    // 在有效区域内随机偏移，更偏向中心区域
    const offsetX = (Math.random() - 0.5) * effectiveWidth * 0.4;
    const offsetY = (Math.random() - 0.5) * effectiveHeight * 0.4;

    // 添加微小抖动
    const jitterX = (Math.random() - 0.5) * jitter;
    const jitterY = (Math.random() - 0.5) * jitter;

    return {
      x: Math.max(
        box.x + paddingX,
        Math.min(box.x + box.width - paddingX, centerX + offsetX + jitterX),
      ),
      y: Math.max(
        box.y + paddingY,
        Math.min(box.y + box.height - paddingY, centerY + offsetY + jitterY),
      ),
    };
  }

  /**
   * 模拟人类鼠标移动（使用内部状态管理）
   */
  private async simulateHumanMouseMove(
    page: Page,
    targetX: number,
    targetY: number,
    opts: Required<HumanBehaviorOptions>,
  ): Promise<void> {
    const moveSteps =
      opts.moveStepsMin +
      Math.floor(Math.random() * (opts.moveStepsMax - opts.moveStepsMin));

    // 从内部状态获取当前鼠标位置
    let currentPos = this.mousePositions.get(page) || { x: 0, y: 0 };
    const currentX = currentPos.x;
    const currentY = currentPos.y;

    // 执行鼠标移动
    await page.mouse.move(targetX, targetY, { steps: moveSteps });

    // 更新内部状态
    this.mousePositions.set(page, { x: targetX, y: targetY });
  }

  /**
   * 初始化页面鼠标位置
   */
  private initializePageMousePosition(page: Page): void {
    if (!this.mousePositions.has(page)) {
      this.mousePositions.set(page, { x: 0, y: 0 });

      // 监听页面关闭，清理状态（可选）
      page.on('close', () => {
        this.mousePositions.delete(page);
      });
    }
  }

  /**
   * 执行人类化的左键点击
   */
  private async performHumanLeftClick(
    page: Page,
    box: { x: number; y: number; width: number; height: number },
    opts: Required<HumanBehaviorOptions>,
  ): Promise<void> {
    const targetPos = this.calculateInteractionPosition(box, opts.jitter);

    // 移动鼠标到目标位置
    await this.simulateHumanMouseMove(page, targetPos.x, targetPos.y, opts);

    // 点击前的短暂停顿（人类会稍微确认位置）
    const hoverDelay = 60 + Math.random() * 180;
    await page.waitForTimeout(hoverDelay);

    await page.mouse.down({ button: 'left' });

    // 按压时间模拟（人类点击会保持按压一段时间）
    const pressDuration = 90 + Math.random() * 140;
    await page.waitForTimeout(pressDuration);

    await page.mouse.up({ button: 'left' });

    // 点击后的短暂停留
    const postClickDelay = 40 + Math.random() * 80;
    await page.waitForTimeout(postClickDelay);
  }

  /**
   * 执行人类化的右键点击
   */
  private async performHumanRightClick(
    page: Page,
    box: { x: number; y: number; width: number; height: number },
    opts: Required<HumanBehaviorOptions>,
  ): Promise<void> {
    const targetPos = this.calculateInteractionPosition(box, opts.jitter);

    // 移动鼠标到目标位置
    await this.simulateHumanMouseMove(page, targetPos.x, targetPos.y, opts);

    // 右键点击前会有更长的确认时间
    const hoverDelay = 100 + Math.random() * 200;
    await page.waitForTimeout(hoverDelay);

    await page.mouse.down({ button: 'right' });

    // 右键按压时间通常更长
    const pressDuration = 120 + Math.random() * 180;
    await page.waitForTimeout(pressDuration);

    await page.mouse.up({ button: 'right' });

    // 右键点击后停留时间更长
    const postClickDelay = 80 + Math.random() * 120;
    await page.waitForTimeout(postClickDelay);
  }

  /**
   * 执行人类化的双击
   */
  private async performHumanDoubleClick(
    page: Page,
    box: { x: number; y: number; width: number; height: number },
    opts: Required<HumanBehaviorOptions>,
  ): Promise<void> {
    const targetPos = this.calculateInteractionPosition(box, opts.jitter);

    // 移动鼠标到目标位置
    await this.simulateHumanMouseMove(page, targetPos.x, targetPos.y, opts);

    const hoverDelay = 50 + Math.random() * 100;
    await page.waitForTimeout(hoverDelay);

    // 第一次点击
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(30 + Math.random() * 50);
    await page.mouse.up({ button: 'left' });

    // 双击间隔
    await page.waitForTimeout(opts.doubleClickInterval);

    // 第二次点击
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(20 + Math.random() * 40);
    await page.mouse.up({ button: 'left' });
  }

  /**
   * 执行人类化的拖拽操作
   */
  private async performHumanDrag(
    page: Page,
    startBox: { x: number; y: number; width: number; height: number },
    endBox: { x: number; y: number; width: number; height: number },
    opts: Required<HumanBehaviorOptions>,
  ): Promise<void> {
    const startPos = this.calculateInteractionPosition(startBox, opts.jitter);
    const endPos = this.calculateInteractionPosition(endBox, opts.jitter);

    // 移动到起始位置
    await this.simulateHumanMouseMove(page, startPos.x, startPos.y, opts);

    const hoverDelay = 80 + Math.random() * 120;
    await page.waitForTimeout(hoverDelay);

    // 按下鼠标开始拖拽

    await page.mouse.down({ button: 'left' });

    // 拖拽过程中的移动（模拟人类的不稳定移动）
    const dragSteps = 10 + Math.floor(Math.random() * 10);
    await page.mouse.move(endPos.x, endPos.y, { steps: dragSteps });

    // 拖拽结束前的短暂停顿
    const dragPause = 50 + Math.random() * 100;
    await page.waitForTimeout(dragPause);

    // 释放鼠标完成拖拽

    await page.mouse.up({ button: 'left' });

    const postDragDelay = 60 + Math.random() * 90;
    await page.waitForTimeout(postDragDelay);
  }

  /**
   * 执行人类化的悬停操作
   */
  private async performHumanHover(
    page: Page,
    box: { x: number; y: number; width: number; height: number },
    opts: Required<HumanBehaviorOptions>,
  ): Promise<void> {
    const targetPos = this.calculateInteractionPosition(box, opts.jitter);

    // 移动鼠标到目标位置
    await this.simulateHumanMouseMove(page, targetPos.x, targetPos.y, opts);

    // 悬停时间模拟人类观察
    const hoverDuration = 500 + Math.random() * 1500;

    await page.waitForTimeout(hoverDuration);
  }

  /**
   * 修补页面的所有交互方法
   */
  private patchAllInteractionMethods(
    page: Page,
    opts: Required<HumanBehaviorOptions>,
  ): void {
    this.initializePageMousePosition(page);
    this.patchClickMethods(page, opts);
    this.patchDoubleClickMethods(page, opts);
    this.patchRightClickMethods(page, opts);
    this.patchHoverMethods(page, opts);
    this.patchDragMethods(page, opts);
    this.patchTapMethods(page, opts);
    this.patchFillMethods(page, opts);
    this.patchSelectMethods(page, opts);
    this.patchCheckboxMethods(page, opts);
  }

  /**
   * 修补点击相关方法
   */
  private patchClickMethods(
    page: Page,
    opts: Required<HumanBehaviorOptions>,
  ): void {
    const originalPageClick = page.click.bind(page);

    page.click = async (selector: string, options: any = {}): Promise<void> => {
      const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);

      await page.waitForTimeout(delay);

      const locator = page.locator(selector);
      const box = await locator.boundingBox();

      if (box) {
        // 小概率使用右键点击
        if (Math.random() < opts.rightClickProbability) {
          await this.performHumanRightClick(page, box, opts);
        } else {
          await this.performHumanLeftClick(page, box, opts);
        }
        return;
      }

      return originalPageClick(selector, options);
    };

    // 修补 locator.click
    this.patchLocatorMethod(
      page,
      'click',
      opts,
      async (locator, box, originalMethod, options) => {
        if (Math.random() < opts.rightClickProbability) {
          await this.performHumanRightClick(page, box, opts);
        } else {
          await this.performHumanLeftClick(page, box, opts);
        }
      },
    );
  }

  /**
   * 修补双击方法
   */
  private patchDoubleClickMethods(
    page: Page,
    opts: Required<HumanBehaviorOptions>,
  ): void {
    const originalDblclick = page.dblclick.bind(page);

    page.dblclick = async (selector: string, options?: any): Promise<void> => {
      const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);

      await page.waitForTimeout(delay);

      const locator = page.locator(selector);
      const box = await locator.boundingBox();

      if (box) {
        await this.performHumanDoubleClick(page, box, opts);
        return;
      }

      return originalDblclick(selector, options);
    };

    // 修补 locator.dblclick
    this.patchLocatorMethod(
      page,
      'dblclick',
      opts,
      async (locator, box, originalMethod, options) => {
        await this.performHumanDoubleClick(page, box, opts);
      },
    );
  }

  /**
   * 修补右键点击方法
   */
  private patchRightClickMethods(
    page: Page,
    opts: Required<HumanBehaviorOptions>,
  ): void {
    const originalClick = page.click.bind(page);

    page.click = async (selector: string, options: any = {}): Promise<void> => {
      // 如果是右键点击选项，使用人类化右键点击
      if (options?.button === 'right') {
        const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);

        await page.waitForTimeout(delay);

        const locator = page.locator(selector);
        const box = await locator.boundingBox();

        if (box) {
          await this.performHumanRightClick(page, box, opts);
          return;
        }
      }

      return originalClick(selector, options);
    };
  }

  /**
   * 修补悬停方法
   */
  private patchHoverMethods(
    page: Page,
    opts: Required<HumanBehaviorOptions>,
  ): void {
    const originalHover = page.hover.bind(page);

    page.hover = async (selector: string, options?: any): Promise<void> => {
      const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);

      await page.waitForTimeout(delay);

      const locator = page.locator(selector);
      const box = await locator.boundingBox();

      if (box) {
        await this.performHumanHover(page, box, opts);
        return;
      }

      return originalHover(selector, options);
    };

    // 修补 locator.hover
    this.patchLocatorMethod(
      page,
      'hover',
      opts,
      async (locator, box, originalMethod, options) => {
        await this.performHumanHover(page, box, opts);
      },
    );
  }

  /**
   * 修补拖拽方法
   */
  private patchDragMethods(
    page: Page,
    opts: Required<HumanBehaviorOptions>,
  ): void {
    const originalDragTo = page.dragAndDrop.bind(page);

    page.dragAndDrop = async (
      source: string,
      target: string,
      options?: any,
    ): Promise<void> => {
      const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);

      await page.waitForTimeout(delay);

      const sourceLocator = page.locator(source);
      const targetLocator = page.locator(target);

      const sourceBox = await sourceLocator.boundingBox();
      const targetBox = await targetLocator.boundingBox();

      if (sourceBox && targetBox) {
        await this.performHumanDrag(page, sourceBox, targetBox, opts);
        return;
      }

      return originalDragTo(source, target, options);
    };
  }

  /**
   * 修补触摸方法
   */
  private patchTapMethods(
    page: Page,
    opts: Required<HumanBehaviorOptions>,
  ): void {
    const originalTap = page.tap.bind(page);

    page.tap = async (selector: string): Promise<void> => {
      const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);

      await page.waitForTimeout(delay);

      const locator = page.locator(selector);
      const box = await locator.boundingBox();

      if (box) {
        // 模拟触摸点击（短暂延迟后直接点击）
        const targetPos = this.calculateInteractionPosition(box, opts.jitter);
        await page.waitForTimeout(100 + Math.random() * 200);
        await page.touchscreen.tap(targetPos.x, targetPos.y);
        return;
      }

      return originalTap(selector);
    };

    // 修补 locator.tap
    this.patchLocatorMethod(
      page,
      'tap',
      opts,
      async (locator, box, originalMethod, options) => {
        const targetPos = this.calculateInteractionPosition(box, opts.jitter);
        await page.waitForTimeout(100 + Math.random() * 200);
        await page.touchscreen.tap(targetPos.x, targetPos.y);
      },
    );
  }

  /**
   * 修补输入框填充方法
   */
  private patchFillMethods(
    page: Page,
    opts: Required<HumanBehaviorOptions>,
  ): void {
    const originalFill = page.fill.bind(page);

    page.fill = async (
      selector: string,
      value: string,
      options?: any,
    ): Promise<void> => {
      const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);

      await page.waitForTimeout(delay);

      // 先点击输入框
      const locator = page.locator(selector);
      const box = await locator.boundingBox();

      if (box) {
        // 点击输入框
        await this.performHumanLeftClick(page, box, opts);

        // 清空现有内容（模拟人类按退格键）
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.waitForTimeout(50 + Math.random() * 100);

        // 模拟人类输入速度
        for (let i = 0; i < value.length; i++) {
          await page.keyboard.type(value[i], {
            delay: 50 + Math.random() * 150,
          });

          // 偶尔会有输入错误和修正
          if (Math.random() < 0.02) {
            // 2%的概率输错
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(100 + Math.random() * 200);
            await page.keyboard.type(value[i], {
              delay: 50 + Math.random() * 150,
            });
          }
        }
        return;
      }

      return originalFill(selector, value, options);
    };

    // 修补 locator.fill
    this.patchLocatorMethod(
      page,
      'fill',
      opts,
      async (locator, box, originalMethod, value, options) => {
        // 点击输入框
        await this.performHumanLeftClick(page, box, opts);

        // 清空并输入
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.waitForTimeout(50 + Math.random() * 100);

        // 模拟人类输入
        for (let i = 0; i < value.length; i++) {
          await page.keyboard.type(value[i], {
            delay: 50 + Math.random() * 150,
          });

          if (Math.random() < 0.02) {
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(100 + Math.random() * 200);
            await page.keyboard.type(value[i], {
              delay: 50 + Math.random() * 150,
            });
          }
        }
      },
    );
  }

  /**
   * 修补选择框方法
   */
  private patchSelectMethods(
    page: Page,
    opts: Required<HumanBehaviorOptions>,
  ): void {
    const originalSelectOption = page.selectOption.bind(page);

    page.selectOption = async (
      selector: string,
      values: string | any[] | any,
      options?: any,
    ): Promise<string[]> => {
      const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);

      await page.waitForTimeout(delay);

      const locator = page.locator(selector);
      const box = await locator.boundingBox();

      if (box) {
        // 点击选择框
        await this.performHumanLeftClick(page, box, opts);

        // 短暂等待下拉菜单展开
        await page.waitForTimeout(200 + Math.random() * 300);

        // 使用原始方法选择
        return originalSelectOption(selector, values, options);
      }

      return originalSelectOption(selector, values, options);
    };
  }

  /**
   * 修补复选框方法
   */
  private patchCheckboxMethods(
    page: Page,
    opts: Required<HumanBehaviorOptions>,
  ): void {
    const originalCheck = page.check.bind(page);
    const originalUncheck = page.uncheck.bind(page);

    page.check = async (selector: string, options?: any): Promise<void> => {
      const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);

      await page.waitForTimeout(delay);

      const locator = page.locator(selector);
      const box = await locator.boundingBox();

      if (box) {
        await this.performHumanLeftClick(page, box, opts);
        return;
      }

      return originalCheck(selector, options);
    };

    page.uncheck = async (selector: string, options?: any): Promise<void> => {
      const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);

      await page.waitForTimeout(delay);

      const locator = page.locator(selector);
      const box = await locator.boundingBox();

      if (box) {
        await this.performHumanLeftClick(page, box, opts);
        return;
      }

      return originalUncheck(selector, options);
    };
  }

  /**
   * 通用定位器方法修补
   */
  private patchLocatorMethod(
    page: Page,
    methodName: string,
    opts: Required<HumanBehaviorOptions>,
    humanizedAction: (
      locator: Locator,
      box: any,
      originalMethod: Function,
      ...args: any[]
    ) => Promise<void>,
  ): void {
    const originalLocator = page.locator.bind(page);

    page.locator = ((...args: Parameters<Page['locator']>) => {
      const locator = originalLocator(...args);
      const originalMethod = (locator as any)[methodName]?.bind(locator);

      if (originalMethod) {
        (locator as any)[methodName] = async (...methodArgs: any[]) => {
          const delay = this.generateHumanDelay(opts.delayMin, opts.delayMax);
          await page.waitForTimeout(delay);

          const box = await locator.boundingBox();
          if (box) {
            await humanizedAction(locator, box, originalMethod, ...methodArgs);
            return;
          }

          return originalMethod(...methodArgs);
        };
      }

      return locator;
    }) as Page['locator'];
  }

  /**
   * 浏览器连接时的处理
   */
  async onBrowser(browser: Browser): Promise<void> {
    browser.contexts().forEach((context) => {
      context.pages().forEach((page) => {
        this.patchAllInteractionMethods(
          page,
          this.opts as Required<HumanBehaviorOptions>,
        );
      });

      // 监听新页面创建
      context.on('page', (page) => {
        this.patchAllInteractionMethods(
          page,
          this.opts as Required<HumanBehaviorOptions>,
        );
      });
    });
  }

  /**
   * 页面创建时的处理
   */
  async onPageCreated(page: Page): Promise<void> {
    this.patchAllInteractionMethods(
      page,
      this.opts as Required<HumanBehaviorOptions>,
    );
  }
}

/**
 * 创建人类行为插件实例
 */
export default function createHumanBehaviorPlugin(
  pluginConfig?: HumanBehaviorOptions,
) {
  return new HumanBehaviorPlugin(pluginConfig);
}
