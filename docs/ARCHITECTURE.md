# SuperX 开发结构

## 源码与构建

扩展全部自有运行时的 TypeScript 源码在 `src/`，开启 `strict`、`noUncheckedIndexedAccess` 和 `noFallthroughCasesInSwitch`。安装目录仍是 `extension/`，避免更换现有 Chrome 加载路径。27 个带 `GENERATED` 标记的 JavaScript 入口由 TypeScript 构建生成，不提交到 Git，也不能直接编辑；构建检查会拒绝源文件和安装文件不一致的状态。

```sh
npm ci
npm run build
npm run typecheck
npm run format:check
npm test
npm run check
npm run package
```

`npm run build` 先核对完整入口覆盖并做严格类型检查。已有四个导出模块保持本地 IIFE 打包；其他 classic scripts 只擦除类型，保留 UMD、顶层词法、脚本顺序和各 world 边界，不加入运行时 import/export。类型导入、导出先由 TypeScript AST 识别并移除模块标记，避免 esbuild 将顶层 `this` 改成 `undefined`。Node 测试通过同一生成入口加载生产逻辑，不维护第二套测试实现。`npm test` 的 pretest 与 `npm run check` 都会检查生成一致性。源码包包含 TypeScript、配置、依赖锁与构建工具；安装包只包含运行所需的本地资源。

扩展不再有自有手写 JavaScript 运行时。`extension/marked.umd.js` 与 `extension/marked-cjk-friendly.umd.js` 是唯一两个第三方发行文件豁免，不修改第三方源码。HTML、CSS 和静态资源仍在 `extension/`；Node ESM 工具与现有 JS 行为测试属于开发工具，保持其原格式。所有业务修改都编辑 `src/` 后构建，不维护第二份手写实现。全新 Git 克隆没有这些生成 JS；先 `npm ci` 与 `npm run build` 才能加载 `extension/`。npm 的测试、全量检查和打包入口会自动先构建；CI 与 release workflow 也显式构建后再检查。安装 ZIP 和源码分发 ZIP 可含构建好的 JS 供直接加载，这不代表生成物被纳入 Git。

构建从安装目录递归枚举 JS，与 TS owner 双向核对；新增遗漏文件、缺 owner、生成物漂移均失败。`npm run format` / `npm run format:check` 使用锁定版本 Prettier 统一 TS 源码排版，全量检查包含格式验收。源码禁止显式 `any`、关闭类型检查的注释和 `as unknown as` 双重断言。动态 JSON、React fiber、浏览器 DOM 与协议帧使用有界契约；既有运行时校验保留。`@types/chrome` 锁定版本提供扩展 API 类型，`runtime-globals.d.ts` 描述各脚本实际暴露的全局对象，不引入运行时注册层。

## 真实调用链

```text
src/content/content.ts 观测帖子/显示答案
  → feed-scheduler.ts 选择固定预加载窗口
  → ANALYZE / PROMOTE_REQUEST
src/background/worker.ts 校验身份、读取缓存、安排共享队列
  → provider-registry.ts 选择统一 ProviderAdapter
  → API / OAuth / Build / X native transport
  → 原始 Markdown + 来源/使用量元数据
src/background/worker.ts 保存完整成功答案
  → answer-cache.ts 的 IndexedDB 事务与 LRU
  → RESULT 回到 content.ts 的安全 Markdown renderer
```

| Owner | 责任 |
| --- | --- |
| `src/shared/contracts.ts` | Provider、任务、设置、帖子、结果、流式更新与依赖接口 |
| `src/background/provider-registry.ts` | 四种 provider 的能力、并发、模型、错误映射和薄适配器 |
| `src/background/answer-cache.ts` | 单条持久答案、原子容量计数、LRU、清空与迁移 |
| `src/content/feed-scheduler.ts` | 几何候选过滤、去重、排序和固定窗口；没有 DOM/网络副作用 |
| `src/background/worker.ts` | 顶层 MV3 事件、凭据、请求准入、共享槽位、取消、重试及设置生命周期 |
| `src/content/content.ts` | X DOM 观测、视口资格、原生面板协调与结果 UI |
| `src/providers/` | 已有服务的认证或传输协议；registry 不复制它们的连接生命周期 |
| `tests/` | 合成 provider/browser/storage fixtures，不调用真实付费服务 |

同一分析在后台先按缓存语义、账号、凭据代、设置版本和缓存清空代合并，再异步读缓存。不同标签页共享排队、生成、重试与最终结果；取消一个订阅不取消其他订阅。已完成答案的后续读取等待同键缓存写入，避免落库前重复调用。只有尚未开始且离开可见／预加载窗口的自动任务会因滚动撤回；已开始分析的重试继续保留。X native 的来源文档失效时，必须等待旧连接真正结束，才能由存活订阅的页面续开。

帖子详情页只自动核查URL选中的主帖，其他回复／上下文仅恢复已有缓存，主动点「分析此回复」才提交缓存优先的显式任务；首页预加载保持原规则。最后一个订阅页面关闭时取消未完成任务，不保留无人需要的后台暂停队列；完整成功答案保留缓存。

分析右栏沿用原生sidebar宽度，保留搜索框位置，工具栏在搜索框下方。输出语言由设置页管理；原生搜索获得焦点时暂时隐藏overlay供建议列表交互，失焦恢复，不取消已开始分析。

右栏宽度由右边缘separator调整，默认跟随native sidebar；独立local偏好`railWidth`为0时自动，用户值至少220 CSS px，显示宽度按视口裁剪但保留偏好。松手后串行存储并广播，取消未完成拖动回滚；该偏好不进入分析settings、revision或缓存键。双击／Home恢复自动，方向键调整。

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

### Native authentication wire adapter

`src/providers/native-api-bridge.ts` obtains credentials from the idle owned composer runtime and converts only the observed `grok.bearer` (also the omitted-protocol default) and `xai-x-user` formats into WebSocket subprotocols. It does not import webpack modules or search module exports. Unknown formats fail closed with `X_NATIVE_ADAPTER_CHANGED`; credentials, uid and auth subprotocols remain in MAIN-world memory. The gateway and runtime are private website contracts and can still change independently of bundle module IDs.

User-visible changes must include a dated `CHANGELOG.md` entry with validation scope and any pending installed verification.
