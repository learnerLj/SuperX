# SuperX 开发结构

## 源码与构建

TypeScript 核心源码在 `src/`，开启 `strict`、`noUncheckedIndexedAccess` 和 `noFallthroughCasesInSwitch`。安装目录仍是 `extension/`，避免更换现有 Chrome 加载路径。四个带 `GENERATED` 标记的 JavaScript 入口由 TypeScript 构建生成，不能直接编辑；构建检查会拒绝源文件和安装文件不一致的状态。

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run check
npm run package
```

`npm run build` 先做严格类型检查，再将模块打成 Chrome 120 可用的本地 IIFE。Node 测试通过同一生成入口加载生产逻辑，不维护第二套测试实现。`npm test` 的 pretest 与 `npm run check` 都会检查生成一致性。源码包包含 TypeScript、配置、依赖锁与构建工具；安装包只包含运行所需的本地资源。

这是渐进迁移：provider 调度、缓存与预加载算法已经有 TypeScript owner；已有 X DOM/UI、认证、传输协议和 Markdown renderer 仍保留 JavaScript。新领域逻辑应进入 `src/`；迁移已有模块时，一并删除原手写 owner，并保留生成入口及回归测试，避免两处都能修改。

## 真实调用链

```text
content.js 观测帖子/显示答案
  → feed-scheduler.ts 选择固定预加载窗口
  → ANALYZE / PROMOTE_REQUEST
background.js 校验身份、读取缓存、安排共享队列
  → provider-registry.ts 选择统一 ProviderAdapter
  → API / OAuth / Build / X native transport
  → 原始 Markdown + 来源/使用量元数据
background.js 保存完整成功答案
  → answer-cache.ts 的 IndexedDB 事务与 LRU
  → RESULT 回到 content.js 的安全 Markdown renderer
```

| Owner | 责任 |
| --- | --- |
| `src/shared/contracts.ts` | Provider、任务、设置、帖子、结果、流式更新与依赖接口 |
| `src/background/provider-registry.ts` | 四种 provider 的能力、并发、模型、错误映射和薄适配器 |
| `src/background/answer-cache.ts` | 单条持久答案、原子容量计数、LRU、清空与迁移 |
| `src/content/feed-scheduler.ts` | 几何候选过滤、去重、排序和固定窗口；没有 DOM/网络副作用 |
| `extension/background.js` | 顶层 MV3 事件、凭据、请求准入、共享槽位、取消、重试及设置生命周期 |
| `extension/content.js` | X DOM 观测、视口资格、原生面板协调与结果 UI |
| `extension/*-provider.js` | 已有服务的认证或传输协议；registry 不复制它们的连接生命周期 |
| `tests/` | 合成 provider/browser/storage fixtures，不调用真实付费服务 |

## Provider 接口

`ProviderAdapter` 是实际被后台消费的接口，不是单独的说明类型。每个适配器提供 `id`、`capabilities`、`model(settings)`、`concurrency(settings)`、`publicError(error)` 和 `run(request, context)`。请求区分 `analysis`、`comments`、`draft`，结果区分答案与评论。API/OAuth/Build 支持三类任务；X native 只支持已发布帖子核查。

认证仍归 background。`ExecutionContext` 提供可中止的取 Key、OAuth authorization、Build connection 和 `assertCurrent()`；适配器不向 content 传递凭据，不维护第二套令牌或请求队列，也不失败后切换服务。OAuth 刷新后的账号检查、Build 本地权限检查与 native 取消确认仍保留原边界。

新增 provider 时，扩展 `ProviderId` 与 registry 的实际 adapter，补齐所需连接 UI、设置规范化和能力测试。不要先加入未使用的注册插件层、默认 fallback 或虚构 token 使用量。

## 触发与缓存读取

右栏与弹窗仅提供简单暂停／启动，以 `enabled` 存储。暂停撤回尚未开始的自动分析和预加载，已开始的请求及明确重分析保留；恢复后继续最近五条窗口，不引入自定义或悬停模式。

`LOOKUP_CACHED_POST` 是后台独立的 IndexedDB 查询，不进入付费队列、不调用 provider、不初始化原生面板。可见帖子在启动和暂停时均可恢复已有答案；未命中仍由触发规则决定是否请求。原生缓存查询携带当前公开账号，未知账号不读取。前端同帖共享统一使用 `analysisKey` / `analysisLeader`，包括缓存、自动和重分析请求。

## 预加载与优先级

默认窗口是视口下方最近的五个有效帖子位置；数量 0 关闭，也可选择本页全部已挂载帖子。图片、视频和引用帖即使没有正文文字，也按有效原帖链接进入窗口。候选排除推广、无效几何和当前可见的重复帖子，不因帖子曾短暂露出而跳过。已有答案和在途任务保留窗口位置并直接复用；未开始的帖子按最近顺序进入调度。窗口随滚动按空间位置更新，不等待可见帖子的停留计时。完成状态不影响排名，因此停在原地不会完成五条后继续向远处补五条。同帖出现多个 DOM 实例时，共用一份在途核查和已完成答案，各自显示同一流式结果。SuperX 不自动滚动，也不无限拉取 X 时间线。

可见帖子和预加载共用既有并发，native 上限为 10。后台按评论/草稿、可见核查、预加载顺序安排等待任务，同级 FIFO；不会抢占已运行任务。预加载进入视口后以同一个 request ID 提升优先级，不重新请求。窗口缩小或移走时只条件撤销尚未开始的任务。历史记录只由实际可见触发，预加载不会提前记作已读。

数量、全部开关和缓存容量属于调度/存储设置，不是生成参数；修改它们不会取消在途核查或使答案缓存失效。预加载需要正常服务额度，缓存命中则不启动模型；提前开始仍不保证每条在用户滚到前都已完成。

## 持久缓存

完整成功答案长期保存，没有 TTL；默认预算 1024 MB，可配置。只计算序列化 key/result 的逻辑字节，数据库文件自身有额外开销，不预分配 1 GB。LRU 读取会更新最近使用顺序，超限或缩容删除最久未使用的条目。IndexedDB 事务同时更新条目与计数，避免并发写入超额；不在启动时加载全库。

缓存身份包括服务、账号（适用时）、原帖 URL、语言和有效核查设置。native 使用公开 X profile 标记，无法识别账号时跳过持久缓存。手动重新分析绕过缓存，成功才替换；失败/取消/不完整输出不覆盖旧成功答案。缓存与 24 小时浏览历史分开。

清空由后台 epoch 和同步建立的清空 barrier 协调：清空前发起的读取返回取消，清空后发起的读取等待清空完成；旧在途任务不能恢复被清掉的缓存。

## 验证边界

本地测试验证预加载窗口、队列/取消、持久存储、四种适配器、认证隔离、构建一致性和打包；fixture 通过不等于当前 X 网页或真实 provider 已验收。安装后仍需检查 X 时间线与帖子页、首次核查/返回缓存、预加载进入视口不重发、Fast 模式、页面焦点和滚动位置。Chrome 与 Edge 分别验收。

依据：[TypeScript 渐进迁移](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)、[strict](https://www.typescriptlang.org/tsconfig/strict.html)、[Chrome MV3 worker](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)、[消息安全](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#security-considerations)。

## 公式渲染

`src/content/math-renderer.ts` 是公式解析与安全 MathML 的 owner，构建本地打包 KaTeX 0.19.1 至 `extension/math-renderer.js`，附许可。Markdown renderer 在 Marked 转义之前识别数学 token，再输出原生 MathML；feed、draft、history共用，不加载远端脚本、字体或公式图片。支持行内和独立公式，代码与金额保持文字。带明确 TeX 命令的平衡括号兼容网站丢失反斜杠的公式定界符；无效或尚未闭合的公式保留原文。

KaTeX 使用公开 `renderToString`、MathML-only、`trust:false`、独立macros，单公式4096字符／1500节点／40层／200次展开／20em最大尺寸；一篇最多渲染64个公式，并计入原Markdown DOM总预算。XML解析后仅复制允许的MathML节点和属性，删除annotation，不写innerHTML。JSDOM测试验证结构与隔离；实际字体、换行与溢出用Chrome视觉验收。
