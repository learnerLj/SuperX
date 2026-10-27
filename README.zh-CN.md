# SuperX

边刷 X，边核查帖子。分析结果直接显示在右侧，不用切换页面。

[English](README.md) · [更新日志](CHANGELOG.md) · [隐私说明](PRIVACY.md)

## 能做什么

- 使用「X 内置 Grok」的 Fast 模式，也可选择 Grok 订阅登录、API Key 或本机 Grok Build。
- 回答支持 Markdown、公式和可点击的引用来源。
- 已完成答案长期缓存在本地，默认上限 1 GB，可在设置中调整。
- 默认预加载下方 5 条帖子，数量可调整；帖子详情页的回复默认手动分析。
- 支持暂停／继续、拖动右栏宽度，以及在设置中选择回答语言。

## 安装

使用本仓库源码安装，需要 Node.js 22 或更新版本：

```sh
git clone https://github.com/learnerLj/SuperX.git
cd SuperX
npm ci
npm run build
```

1. 打开 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions`，启用「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择项目中的 `extension/` 文件夹。
3. 打开 SuperX 设置，选择连接方式并保存。使用「X 内置 Grok」时，先在 X 网页登录账号。
4. 刷新 X，开始浏览。

更新源码后，重新运行 `npm run build`，在扩展管理页点击「重新加载」，再刷新 X。

## 使用

已有答案会优先复用；需要重新核查时，点击「重新分析」。暂停按钮控制新的自动分析，已开始的请求会继续完成。

模型可用性、额度和费用取决于所选服务与账号。AI 回答可能出错，请核对引用来源。

其他连接方式见[连接说明](docs/CONNECTIONS.md)，开发与构建见[贡献指南](CONTRIBUTING.md)。

## 致谢

本项目基于 [bwjoke/SuperX](https://github.com/bwjoke/SuperX) 继续改进，感谢上游作者及所有贡献者。

[MIT License](LICENSE)
