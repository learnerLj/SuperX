---
title: 长期答案缓存与可配置容量
status: closed
---

## 目标与合同

用户授权：已核查帖子长期缓存，不按时间过期，默认上限 1 GB，用户可配置；重新分析绕过并在成功后替换。刷新、离开再返回、重新打开和浏览器重启后可复用。1 GB 表示 1024 MB，仅作为逻辑数据字节预算，不预分配；IndexedDB 文件管理开销不包括在预算内。

完整帖子核查答案（所有 provider）进入扩展 origin IndexedDB；草稿不缓存，评论沿用现有会话缓存，不改变浏览历史 24 小时保留规则。失败、取消、空回答和 incomplete/failed 不写入；失败的强制重试保留上次成功答案。旧会话帖子缓存可迁移一次（最多现有160条/4MB）；旧 native 残留不迁移。

新库 answer-cache.js：按 key 单条 get/put，lastAccess 索引实现 LRU；事务原子更新条目与总字节，10 路写入不超预算。不在启动加载全部数据；缩小预算立即淘汰。get 触碰 lastAccess；单条过大跳过写入；存储失败不阻断正常核查。clear 与已在途写入通过现有 epoch/串行写队列排序，清空后旧请求不得恢复旧缓存。

身份沿用 API/Build/OAuth 已有参数 key 和凭证变更清理边界。native 使用单独版本 key：当前 X 账号公开 profile href（规范化用户名，不读取 token）、帖子 canonical URL、输出语言与解析后语言、实际核查 prompt/版本、固定 Fast。与帖子预览截断无关；账号不可识别则正常生成但不读写 native 持久缓存。账号标记由 content 提交，不跨账号复用。异步读取后必须再次检查任务/连接/清理 epoch，避免缓存 I/O 造成过期结果发布或重复请求。

设置 answerCacheLimitMB 默认1024，整数 MB，最小1，最大1048576（1TB，防误输入；不预分配）。修改后立即 trim。设置页显示单位、默认、长期保留与 LRU，沿用清空缓存按钮，清空持久库及旧会话缓存。权限增加 unlimitedStorage，应用仍强制自己的容量上限。依据 Chrome 官方 Storage and cookies / Permissions：该权限覆盖 IndexedDB 配额和 eviction，IndexedDB 可在 extension service worker 使用。

## 实施与验收

后台由 Codex CLI 实现：store、background、core、backend tests；主 agent 实现 content 账号传递、options UI、manifest、docs。互不改写文件。独立 spec 审查后执行；完成后独立实现审查。

验收：无 TTL/新 store 实例仍可读；精确字节预算、LRU触碰、替换、缩容、过大条目、并发写、clear竞态；background native 重复命中无网络、force刷新、失败保留、账号/语言/prompt/provider隔离，缓存先于 providerReady；正常回归。全量 npm test/check/package:check + package。实际安装必须用户 Reload 后验证，未安装前不得宣称生效。

## 进度

根因已确认：native 被 background 显式排除缓存；旧缓存为 session +24小时。当前待 spec review。

来源：https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies 与 https://developer.chrome.com/docs/extensions/reference/permissions-list （2026-10-27核对）。

Spec review 已完成，采纳四项：content 提交缓存查询与 providerReady 分离；native 账号变化进入 request/显示 generation 并取消旧任务；容量字段排除生成参数比较，缩容不取消生成；put 使用执行时当前预算，禁止旧快照覆盖缩容。content 通过 NATIVE_ACCOUNT_CHANGED（nativeAccount 字段）通知账号变化，每次 ANALYZE 也附账号；background 在准入、异步读后和发布/保存前核对 client 账号代际。未知账号允许 live generation，但不持久缓存。frontend tick 与收到结果前检测 profile，变化即清理旧显示并 CANCEL_ALL，再提交新账号消息。

实现进度：主 agent 已接入 settings MB 输入/保存、12语言文案、公开账号变更清理及原生派发前账号复核、unlimitedStorage、生产打包allowlist和文档。前端/原生相关303项及设置18项已通过；真实 X 页面确认存在 AppTabBar_Profile_Link。独立 backend 审查仅发现清缓存读取竞态无terminal，待修；store focused11项通过。后台CLI正在补充最终端到端回归。

## 最终本地验证与待办

2026-10-27：实施与独立复查已完成。审查发现的旧 epoch 读取静默悬挂，以及新 epoch 越过排队清空读取旧答案两项均已修正：旧请求返回 CANCELLED，新请求等待同步建立的 answerClearBarrier；reviewer 定点3/3通过。

主 agent 最终执行 npm test：1384 pass，3 skip，0 fail（总1387）；npm run check：65份JS语法和58个生产文件通过；npm run package:check通过。npm run package成功，artifacts/SuperX-1.0.0.zip SHA256：9ba1cf5c9071c5885a5284010bc06bedd2742b805cb7580705e6836e67b55f17。

代码仍为本地未提交修改。尚未宣称安装生效：Chrome 缓存旧脚本，需要用户在扩展管理页 Reload（宿主策略禁止 agent 操作或绕过该页）；之后主 agent 验收实际首次写入、离开返回/重开缓存命中、强制刷新。spec 保持 executing，直到安装验收完成。


用户随后将交付边界改为「今晚完成本地开发测试，明天安装验收」，并在睡前回复旧缓存版Reload已点击；本轮未再操作Chrome，未将其等同于缓存runtime验收。缓存本地目标已完成，原生安装验证合并到 superpowers/2026-10-27-prefetch-and-provider-refactor-spec.md 的明天步骤。本地最终版本已随TypeScript缓存owner迁移通过1428 pass/3 skip完整回归；因此本spec按本地交付边界结项，真实安装状态仍明确待验收。


安装验收补充（2026-10-27）：X内置Grok实际已验证离屏预生成→进入视口复用→详情Cached→整页reload仍Cached且无原帖新RUN；手动重新分析明确只发1次新RUN并成功返回。完整记录和本地证据路径认预加载/TS spec 的安装实测补记。
