# 项目改动总结

## 问题
之前的代码只支持 Electron 启动方式，但 Electron 中 stdin 被隔离，导致控制台无法输入课程序号。

## 解决方案
恢复并改进了 Node.js 直接启动方式（CLI 模式），使项目同时支持两种启动模式：

### 修改的文件

#### 1. **新建 `src/cli.ts`**
   - 创建专门的 Node.js CLI 入口
   - 直接启动 Playwright 浏览器（不经过 Electron）
   - 支持标准输入/输出
   - 编译后为 `dist/src/cli.js`

#### 2. **修改 `core/src/utils.ts`**
   - 改进 `input()` 函数
   - 检测 stdin 是否可用（`process.stdin.isTTY`）
   - 两种模式自动适配：
     - **CLI 模式**: stdin 可用，正常等待用户输入（最多 25 秒）
     - **Electron 模式**: stdin 不可用，快速超时后自动选择全部（100ms 后超时）
   - 防止 Electron 中输入被冻结

#### 3. **修改 `package.json`**
   - 添加 `start` 脚本：`yarn start` → Node.js CLI 模式
   - 保留 `start:electron` 脚本：Electron 模式
   - 保留 `build:electron` 脚本：构建 Windows 安装程序

### 新增文件

- **`STARTUP_MODES.md`** - 详细的启动方式文档
- **`test-modes.js`** - 测试脚本，验证两种模式都能工作

## 使用方式

### Node.js CLI 模式（支持控制台输入）
```bash
yarn start
```
- 支持直接在终端输入课程序号
- 支持管道输入：`echo "1" | yarn start`
- 20 秒自动超时选择全部

### Electron 模式（GUI 界面）
```bash
yarn start:electron
```
- 提供浏览器窗口
- 便于调试和开发
- 20 秒自动超时选择全部

## 代码流程

```
┌─────────────────────────────────────────────────────┐
│                    输入调用流程                      │
└─────────────────────────────────────────────────────┘

selectCourseGroup() [core/src/index.ts]
    ↓
input('请输入序号...') [core/src/utils.ts]
    ↓
┌─────────────────────────────────────────────────────┐
│ 检测运行环境: process.stdin.isTTY                  │
└─────────────────────────────────────────────────────┘
    ├─ ✅ TTY 可用 (CLI 模式)
    │  → ReadLine 等待用户输入
    │  → 最多 25 秒超时
    │  → 返回用户输入或 '0'
    │
    └─ ❌ TTY 不可用 (Electron)
       → 100ms 快速超时
       → 立即返回 '0'
       → 自动选择全部课程
```

## 关键改进点

1. **兼容性** - 同时支持 Node.js 和 Electron 两种环境
2. **自动检测** - 运行时自动识别环境，无需修改代码
3. **快速响应** - Electron 中快速超时，避免卡住
4. **保持原功能** - Electron 仍可用，只是无法手动输入
5. **易于维护** - 逻辑清晰，易于扩展

## 编译说明

所有修改的 TypeScript 文件都已编译到 `dist/` 目录：
- `dist/src/cli.js` - Node.js CLI 入口
- `dist/src/index.js` - Electron 入口
- `core/dist/src/utils.js` - 更新的工具函数
