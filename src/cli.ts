import 'source-map-support/register.js';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { ims } from '@ims-tech-auto/core';
import AIModel from '@ims-tech-auto/core/ai/AIModel.js';
import HumanBehaviorPlugin from '@ims-tech-auto/core/plugins/HumanBehaviorPlugin.js';
import Config from '@ims-tech-auto/core/config.js';

async function runCLI() {
  const browser = await chromium
    .use(StealthPlugin())
    .use(HumanBehaviorPlugin())
    .launch({
      headless: Config.browser.headless,
      executablePath: Config.browser.executablePath,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-size=1600,1000',
      ],
    });

  try {
    await AIModel.init(false);

    const runner = await ims
      .login(browser, {
        ...Config.user,
        loginApi: Config.urls.login(),
        homeApi: Config.urls.home(),
      })
      .start();

    await runner?.restart();
  } finally {
    await browser.close();
  }
}

runCLI().catch((err) => {
  console.error('CLI 模式执行失败:', err);
  process.exit(1);
});
