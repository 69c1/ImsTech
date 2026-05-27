#!/usr/bin/env node

/**
 * 测试脚本：验证 CLI 模式和 Electron 模式都能工作
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

async function testCLIMode() {
  console.log('\n=============== 测试 CLI 模式 ===============');
  
  return new Promise((resolve) => {
    const child = spawn('yarn', ['start'], {
      cwd: resolve(import.meta.url, '..'),
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true,
      timeout: 5000,
    });

    // 2秒后发送输入
    setTimeout(() => {
      console.log('\n[测试] 发送输入: 0');
      child.stdin?.write('0\n');
    }, 2000);

    // 10秒后终止
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 10000);

    child.on('exit', (code) => {
      if (code === null || code === 0 || code === 143) {
        // 0 = success, 143 = SIGTERM
        console.log('\n✅ CLI 模式测试通过\n');
        resolve(true);
      } else {
        console.log(`\n❌ CLI 模式测试失败，退出代码: ${code}\n`);
        resolve(false);
      }
    });

    child.on('error', (err) => {
      console.log(`\n❌ CLI 模式启动失败: ${err.message}\n`);
      resolve(false);
    });
  });
}

async function testElectronMode() {
  console.log('\n=============== 测试 Electron 模式 ===============');
  
  return new Promise((resolve) => {
    const child = spawn('yarn', ['start:electron'], {
      cwd: resolve(import.meta.url, '..'),
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: true,
    });

    // 15秒后终止（Electron 应该在 20 秒后自动超时并退出）
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 15000);

    child.on('exit', (code) => {
      if (code === null || code === 0 || code === 143) {
        console.log('\n✅ Electron 模式测试通过\n');
        resolve(true);
      } else {
        console.log(`\n❌ Electron 模式测试失败，退出代码: ${code}\n`);
        resolve(false);
      }
    });

    child.on('error', (err) => {
      console.log(`\n❌ Electron 模式启动失败: ${err.message}\n`);
      resolve(false);
    });
  });
}

async function main() {
  console.log('开始测试两种启动模式...');
  
  const cliResult = await testCLIMode();
  const electronResult = await testElectronMode();

  console.log('\n=============== 测试总结 ===============');
  console.log(`CLI 模式:      ${cliResult ? '✅ 通过' : '❌ 失败'}`);
  console.log(`Electron 模式: ${electronResult ? '✅ 通过' : '❌ 失败'}`);
  console.log('=======================================\n');

  process.exit(cliResult && electronResult ? 0 : 1);
}

main().catch((err) => {
  console.error('测试脚本出错:', err);
  process.exit(1);
});
