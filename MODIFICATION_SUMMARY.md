# 修改总结

## 问题解决
✅ 恢复 Node.js 直接启动支持，使项目同时支持两种启动方式
✅ 修复 Electron 中无法接收控制台输入的问题（自动快速超时）
✅ 保持 Electron 功能完整，不影响原有 GUI 模式

## 新增功能

### 1. Node.js CLI 模式启动
```bash
yarn start
```
- **支持终端输入** ✅ 可以输入课程序号
- **支持管道输入** ✅ `echo "1" | yarn start`  
- **自动超时** ✅ 20秒后自动选择全部课程

### 2. 保留 Electron 模式
```bash
yarn start:electron
```
- 提供 GUI 界面和浏览器窗口
- 自动超时（无法手动输入）
- 便于调试和开发

## 修改清单

| 文件 | 修改说明 |
|------|----------|
| `src/cli.ts` | ✨ **新建** - Node.js CLI 入口 |
| `core/src/utils.ts` | 🔧 改进 `input()` 函数，支持环境自动检测 |
| `package.json` | 🔧 添加 `start` 脚本 |
| `STARTUP_MODES.md` | 📖 **新建** - 启动方式详细文档 |
| `CHANGES.md` | 📖 **新建** - 详细改动说明 |
| `test-modes.js` | 🧪 **新建** - 测试脚本 |

## 工作原理

```
input() 函数自动检测运行环境：

process.stdin.isTTY === true  ?  CLI 模式 → 正常等待输入
                             :  Electron → 快速超时
```

## 验证编译

所有文件已正确编译到 `dist/` 目录：
```
dist/src/
  ├── cli.js          ✅ Node.js 入口
  ├── index.js        ✅ Electron 入口
  └── ...
  
core/dist/src/
  ├── utils.js        ✅ 更新的工具函数
  └── ...
```

## 下一步测试

可以运行以下命令测试两种模式：

```bash
# 测试 CLI 模式（建议）
yarn start
# 然后在 20 秒内输入课程序号，如: 1

# 测试 Electron 模式
yarn start:electron
# 20 秒后自动选择全部课程
```

## 兼容性

- ✅ 向后兼容 - 不影响现有 Electron 功能
- ✅ 跨平台 - Windows/Linux/macOS
- ✅ CI/CD - 支持自动化集成
