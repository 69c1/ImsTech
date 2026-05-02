import { Page } from 'playwright';
import ReadLine from 'readline';

async function waitForStable(page: Page, ms = 1000) {
  await page.waitForFunction((duration) => {
    return new Promise((resolve) => {
      let timer: number;

      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          observer.disconnect();
          resolve(true);
        }, duration);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      });

      timer = window.setTimeout(() => {
        observer.disconnect();
        resolve(true);
      }, duration);
    });
  }, ms);
}

function input(query: string) {
  const rl = ReadLine.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function parseDOMText(page: Page, str: string) {
  return page.evaluate((str) => {
    const div = document.createElement('div');
    div.innerHTML = str;
    return div.innerText;
  }, str);
}

class ErrorWithRetry {
  private failedTask: (e: any) => void = (e) => {
    throw e;
  };
  private retryTask: () => Promise<void> | void = async () => {};

  constructor(
    private taskName: string,
    private maxCnt: number,
  ) {}

  async run(task: () => Promise<void> | void) {
    let lastError: any;

    for (let i = 0; i < this.maxCnt; i++) {
      try {
        await task();
        return; // 成功则退出
      } catch (e) {
        lastError = e;
        console.warn(
          `任务: ${this.taskName} 执行失败, 重试: ${i + 1}/${this.maxCnt}, 错误: ${e}`,
        );

        // 如果不是最后一次重试，执行重试任务
        if (i < this.maxCnt - 1) {
          try {
            await this.retryTask();
          } catch (retryError) {
            console.warn(`重试任务执行失败: ${retryError}`);
          }
        }
      }
    }

    // 所有重试都失败
    console.error(`任务: ${this.taskName} 执行失败, 并且达到最大重试次数.`);
    this.failedTask(lastError);
  }

  failed(callback: (e: any) => void) {
    this.failedTask = callback;
    return this;
  }

  retry(callback: () => Promise<void> | void) {
    this.retryTask = callback;
    return this;
  }
}

function errorWithRetry(taskName: string, maxCnt: number) {
  return new ErrorWithRetry(taskName, maxCnt);
}

export { input, waitForStable, parseDOMText, errorWithRetry };
