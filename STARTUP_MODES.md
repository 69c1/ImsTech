# ImsTech 启动方式

该项目现在支持两种启动方式：

## 1. Node.js 直接启动（CLI 模式）

支持通过终端直接输入选项，适合自动化和 CI/CD 环境。

```bash
yarn start
```

或编译后直接运行：
```bash
node ./dist/src/cli
```

**优点：**
- ✅ 可以直接在终端输入课程序号
- ✅ 支持管道输入 `echo "1" | node ./dist/src/cli`
- ✅ 20秒自动超时选择全部课程
- ✅ 资源占用少，启动快

## 2. Electron 启动（GUI 模式）

使用 Electron 启动，提供可视化界面。

```bash
yarn start:electron
```

**优点：**
- ✅ 提供 GUI 界面
- ✅ 可查看浏览器窗口和开发者工具
- ✅ 更容易调试问题

**说明：**
- 在 Electron 中由于 stdin 隔离，控制台输入不可用
- 20秒后自动选择全部课程（0）

## 3. 构建安装程序

```bash
yarn build:electron
```

生成 Windows 可执行文件。

## 编辑配置

编辑 `core/.env` 文件配置用户信息和学习平台 URL：

```
IMS_BASE_URL=https://lms.ouchn.cn
IMS_USER=your_username
IMS_PASSWORD=your_password
```

## 推荐使用场景

- **开发/调试**: 使用 `yarn start:electron`，可以看到浏览器窗口和日志
- **自动化/定时任务**: 使用 `yarn start`，支持 cron 或任务计划程序
- **生产环境**: 构建 `yarn build:electron` 生成 `.exe` 文件，可作为独立应用分发
