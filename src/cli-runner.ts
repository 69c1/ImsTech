import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { ims } from '@ims-tech-auto/core';
import AIModel from '@ims-tech-auto/core/ai/AIModel.js';
import HumanBehaviorPlugin from '@ims-tech-auto/core/plugins/HumanBehaviorPlugin.js';
import Config from '@ims-tech-auto/core/config.js';

async function run() {
  await new Promise((r) => setTimeout(r, 1500));
  const browser = await chromium
    .use(StealthPlugin())
    .use(HumanBehaviorPlugin())
    .connectOverCDP('http://127.0.0.1:9222', {
      slowMo: 240,
      timeout: 1000 * 60 * 2,
    });

  await AIModel.init(true);

  const runner = await ims
    .login(browser, {
      ...Config.user,
      loginApi: Config.urls.login(),
      homeApi: Config.urls.home(),
    })
    .start();

  await runner?.restart();

  // ⚠️ 防止进程退出
  await new Promise(() => {});
}

// ⭐ 关键：自动执行
run().catch((err) => {
  console.error(err);
  process.exit(1);
});