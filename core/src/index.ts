import 'source-map-support/register.js';
import chalk from 'chalk';
import { Browser, Locator, Page } from 'playwright-core';
import { format } from 'util';
import { exit } from 'process';

import Config, { API_BASE_URL } from './config.js';
import * as Activity from './activity.js';
import * as Processor from './course/processor.js';
import * as Search from './course/search.js';
import { filterCookies, login, LoginConfig, storeCookies } from './login.js';
import { errorWithRetry, input, waitForStable } from './utils.js';
import { CourseInfo } from './course/search.js';
import { ActivityInfo } from './activity.js';

class IMSRunner {
  private page?: Page;
  constructor() {}

  async restart() {
    if (this.page) await this.start(this.page);
  }

  // 主入口
  async start(page: Page) {
    this.page = page;
    // page.on('response', async (response) => {
    //   (await response.body()).
    //   const url = response.url();
    //   if (url.includes('forbidden') || url.includes('banned')) {
    //     console.log(chalk.red('⚠️ 发现风控响应:'), url);
    //     await page.screenshot({ path: 'banned.png' });
    //     exit(1);
    //   }
    // });

    await this.checkRiskStatus(page);
    await this.initSession(page);

    const listItems = await Activity.getActivities();
    const selected = await this.selectCourseGroup(listItems);

    for (const item of selected) {
      console.log(chalk.bold('-'.repeat(60)));
      console.log(chalk.cyan(`开始执行课程组: ${item.title}`));
      if (!item.percent) continue;
      await this.processCourseGroup(page, item);
    }

    console.log(chalk.greenBright('🎉 全部课程执行完毕!'));
  }

  // 检查风控状态
  private async checkRiskStatus(page: Page): Promise<boolean> {
    const blockedText =
      '您好，您的账号被检测到异常访问行为，您的账号将被禁止访问教学平台，时限1小时。';

    // 检查页面中是否包含风控提示
    const count = await page.getByText(blockedText, { exact: false }).count();

    if (count > 0) {
      console.error(chalk.bgRed(`⚠️ 检测到风控提示，账号可能已被封禁1小时`));
      await page.screenshot({ path: 'risk_detected.png', fullPage: true });
      return true;
    }

    return false;
  }

  // 初始化会话 cookie
  private async initSession(page: Page) {
    const cs = await page.evaluate(
      async () => await (window as any).cookieStore.getAll(),
    );

    await storeCookies(
      filterCookies(cs, ['session']).map((cookie) => ({
        ...cookie,
        domain: API_BASE_URL.replace(/^https:\/\//, ''),
      })),
    );
  }

  // 用户选择课程组
  private async selectCourseGroup(listItems: ActivityInfo[]) {
    console.log(chalk.bold('\n可选课程组:'));
    console.log(chalk.gray(`0. 全部课程`));

    listItems.forEach((item, i) =>
      console.log(`${i + 1}. ${item.title}  ${item.percent ?? ''}`),
    );

    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve(0), 20000),
    );
    const userInput = await Promise.race([
      input('请输入序号选择课程组(20秒后自动选择全部): '),
      timeoutPromise,
    ]);

    const num = Number(userInput);
    if (isNaN(num)) {
      console.error(chalk.red('❌ 请输入数字'));
      exit(1);
    }

    return num === 0 ? listItems : [listItems[num - 1]];
  }

  // 执行课程组
  private async processCourseGroup(page: Page, item: ActivityInfo) {
    try {
      const courses = (await Search.getUncompletedCourses(page, item)).filter(
        (course) => course.progress != 'full' || course.type == 'exam',
      );

      // 防止复选框影响
      await page.locator('input[type="checkbox"]').setChecked(false);

      for (const [i, course] of courses.entries()) {
        await this.processSingleCourse(page, course, i + 1, courses.length);
      }

      await this.goBackToCourseList(page);
    } catch (e: any) {
      console.error(
        chalk.red(`[${item.title}] 课程组执行异常: ${e.message ?? e}`),
      );
    }
  }

  // 执行单个课程
  private async processSingleCourse(
    page: Page,
    course: CourseInfo,
    index: number,
    total: number,
  ) {
    console.log(
      chalk.bgBlueBright(
        format(
          '%s %s %s %s : %d/%d',
          course.moduleName,
          course.syllabusName ?? '',
          course.activityName,
          course.progress,
          index,
          total,
        ),
      ),
    );

    const processor = Processor.getProcessor(course.type);
    if (!processor) {
      console.warn(
        '⚠️ 不支持的课程类型:',
        Processor.getCourseType(course.type),
      );
      return;
    }

    if (processor.condition && !(await processor.condition(course))) return;

    const t = await this.getCourseLocator(page, course);

    if (await this.isLockedOrUpcoming(t)) return;

    try {
      await t.click();
    } catch {
      return;
    }

    await page.waitForURL(RegExp(`^${Config.urls.course()}.*`), {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await errorWithRetry(`处理课程: ${course.activityName}`, 3)
      .retry(async () => {
        await page.reload({ timeout: 60000 });
      })
      .failed((e) => {
        console.log(`执行出错: ${e}`);
      })
      .run(async () => {
        await waitForStable(page);
        await processor.exec(page);
      });

    await this.goBackToCourseList(page);
  }

  // 课程定位
  private async getCourseLocator(page: Page, course: CourseInfo) {
    let loc = page.locator(`#${course.moduleId}`);
    if (course.syllabusId) loc = loc.locator(`#${course.syllabusId}`);
    return loc
      .locator(`#learning-activity-${course.activityId}`)
      .getByText(course.activityName, { exact: true });
  }

  // 检查锁定/未开始
  private async isLockedOrUpcoming(t: Locator) {
    if ((await t.getAttribute('class'))?.includes('locked')) {
      console.log('🔒 课程锁定，跳过');
      return true;
    }
    if (await t.locator('xpath=../*[contains(@class, "upcoming")]').count()) {
      console.log('⏳ 课程未开始，跳过');
      return true;
    }
    return false;
  }

  // 返回上一级页面
  private async goBackToCourseList(page: Page) {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 0 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });
  }
}

export const ims = {
  login(browser: Browser, config: LoginConfig) {
    const runner = new IMSRunner();
    return {
      async start() {
        return await runner
          .start(await login(browser, config))
          .catch(() => runner);
      },
    };
  },
};
