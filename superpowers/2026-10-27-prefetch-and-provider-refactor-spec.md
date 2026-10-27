---
title: 五条预加载与 TypeScript 核心重构
status: closed
---

## 用户目标与范围

用户睡前授权本地实现、测试、重构和打包，安装验收留明天，不再要求今晚 Reload。承接已完成的长期答案缓存（默认1GB，可配置，不按时间过期）。新功能：默认预加载视口下方最近5条有效帖子，数量可设置，支持关闭和全部模式。

「全部」指 X 当前已挂载在页面的有效帖子，不自动滚动、不无限拉取 X feed、不扫描尚未加载的远端内容。预加载会真实使用所选provider额度；设置清楚说明。缓存命中不发模型请求。数量设置 prefetchCount 默认5，整数0..100（0关闭），prefetchAll默认false；全部模式禁用数量框但保留其值。五条是视口下方最近五条的固定窗口，完成后不会在不滚动时继续向更远处补满五条而耗尽整条时间线。广告、无有效帖子链接、顶部离屏不属候选；曾短暂可见但无结果仍须保留在最近窗口；重复post只算一次。

可见帖子优先于预加载；二者共享现有全局并发（native10、其他保持当前设置），不另加provider并发。预加载运行中的任务在滚动后保留，不重复生成；尚未开始且离开窗口/关闭/减少数量时条件取消，不误取消已开始任务。预加载变成可见时提升排队优先级，仍是同一request/result。预加载不提前写浏览历史；真正进入视口再记录。隐藏标签、暂停、收起右栏、模态遮挡、page suspension或不支持页面不得派发新预加载。切页/换provider/换账号沿用现有隔离与取消。调整预加载参数只影响调度，不取消正在运行的核查，也不改变答案缓存身份。

## 模块方案与边界

沿用现有无远程代码的MV3，不引入UI框架。TypeScript按官方渐进迁移路径落地实际生产模块：
- src/shared/contracts.ts：post/settings/result/update/provider能力、请求和依赖接口；严格类型，不用any逃避接口。
- src/background/provider-registry.ts：四个真实适配器（API/OAuth/Build/X native），统一分析/评论/draft调用、能力检查、公开错误分类、并发策略；后台runAPI通过registry，认证只在background依赖中取得，凭据不得跨content消息。保留OAuth rotation/identity检查和Build permissions/liveJob核对，native仅analysis，禁止fallback。
- src/background/answer-cache.ts：迁移真实IndexedDB缓存owner，保持既有事务/LRU/清空行为，extension/answer-cache.js由构建生成。
- src/content/feed-scheduler.ts：纯候选选择与window计算owner，不持有DOM或网络，主agent在content接入DOM与调度；TypeScript模块可单测。

src是以上模块唯一维护位置；npm build 将它们编译为extension目录原兼容入口（本地生成，明确generated标记），保证用户已安装路径不变。strict typecheck，bundler打包为本地IIFE/CommonJS测试兼容，不运行eval/远程脚本。生成校验避免TS源与安装JS漂移。其余经过验证的JS传输/渲染/认证渐进保留，文档明确边界，不假称全仓TS迁移。后台仍负责worker top-level listeners、身份、队列和缓存；content负责页面观测/UI，provider registry负责接入差异，避免新增多余抽象。

主agent负责前端content/options/i18n及其行为测试；Codex CLI负责严格类型核心、provider registry/缓存TS迁移、build/后台接线/相关测试，不互改文件。独立spec review后继续。所有既有未提交文件属于当前用户资产，禁止reset/stash/删改无关内容。不commit/push/发布，用户本轮只要求本地准备。

## 验收

1. 本地fixture模拟下方20帖子：默认恰好5（完成后不滚动不会扩到第6），0/自定义/全部、去重/广告/短暂可见未分析保留/顶部过滤；可见优先、变可见不重发、窗口移走仅取消未开始、历史可见才记录、页面关闭条件；cached prefetched reuse、native10并发不超额。
2. provider registry四种实际适配器和不支持能力拒绝，凭据/refresh/permissions/current identity/cancel语义不变；已有后台/API/native/Build/OAuth缓存全回归。
3. 严格tsc、构建生成一致性、完整npm test/check/package:check、生产包只含本地运行资源；独立实现审查和修复定点复查；交付安装包与明天验收步骤。
4. 不修改正在运行的Chrome、不假称新版本已安装生效。

官方依据（2026-10-27读取）：
- https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html ：源/生成分离、allowJs渐进迁移。
- https://www.typescriptlang.org/tsconfig/strict.html ：strict类型约束。
- https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers ：ephemeral worker、storage持久化、顶层注册listener、本地打包代码。
- https://developer.chrome.com/docs/extensions/develop/concepts/messaging#security-considerations ：content输入校验、限制privileged动作、不解释不可信HTML。

独立spec审查通过后采纳：后台必须支持已排队任务提升，不能仅content提交顺序；各取消入口用统一visible-or-lookahead资格，DOM卸载仍条件取消；已看集合独立于historySeen；prefetchCount/prefetchAll排除后台/前端任务身份与缓存身份；源码导出包括src、tsconfig、lock，CI先npm ci再构建一致性，验证源码包重建相同生产入口。provider registry保持薄适配器，不复制认证、队列、重试生命周期。

调度前后端契约：普通ANALYZE携带prefetch:boolean；已预加载request进入视口发送PROMOTE_REQUEST(requestId)，后台原地提升，不取消重发；后台优先级 comment/draft > visible analysis > prefetch，保持同级FIFO，不抢占已运行任务。纯模块 SuperXFeedScheduler.selectLookahead(candidates,{width,height},{count,all}) 返回string post IDs；候选字段 id,top,bottom,left,right,seen,isPromoted，默认只取视口下方有效行、去重、排序、固定N；不会依据status补满。


## 本地结项（2026-10-27）

本轮授权的本地开发、重构与验证已完成；用户明确把实际安装验收留到明天，本轮未操作Chrome、未提交/推送或发布。已落实默认5、0关闭、0..100自定义及全部已挂载模式；固定窗口不随完成继续补位，可见任务提升不重复，原有10并发共用，浏览历史仅实际可见才记录。

TypeScript已覆盖真实provider registry、共享契约、IndexedDB答案缓存、纯预加载选择器；strict与noUncheckedIndexedAccess开启，3个生成入口保持原extension加载路径。已有DOM/UI和服务传输JS保留为渐进迁移边界，未假称全仓TS。维护说明 docs/ARCHITECTURE.md，构建/测试/CI/source导出已经消费TS owner和依赖锁。

独立review确认并修复：预加载提升后取消保护丢失、已开始重试链在scroll/DOM/modal路径被撤销、暂停/未就绪时seen记录缺失，以及接口遗漏running/unverified状态。前三项使用不可变originatedPrefetch、各取消入口preserveStarted与独立可见seen观察；类型fixture放tests/types被strict tsc消费并包含在源码包。原reviewer均定点复查通过。最后能力与模型策略已接入实际准入，删除未调用selectedModel；reviewer4/4通过。

最终本地检查：npm run typecheck通过；生成一致性与导出源码重建逐字节一致通过；完整校验1428 pass、3 skip、0 fail，总1431；生产包60文件，JS语法71文件；git diff --check通过。新增前端相关fixtures覆盖5/0/数量/all、不扩展窗口、promotion、已看/推广/历史、缩容/取消保护、hidden/paused/collapsed/unsupported等。未用mock结果冒充真实安装通过。

明天只需一次重新加载本地扩展并刷新X，再检查：已缓存帖子返回命中无新请求；预加载帖子滚入视口复用；数量/全部设置持久；Fast、10并发、Markdown与页面位置/焦点正常。若X当前挂载不足5条，仅处理已挂载部分；不自动滚动。

最终安装包：artifacts/SuperX-1.0.0.zip，SHA256 58cafb4ec30b0d51bc237b58cc17e8558265138ea1e9681dc400ac7af77d42d1。源码包：artifacts/SuperX-1.0.0-source.zip（140文件），SHA256 35b2ef5a37e82de39d4d946f89c3bed56293921b715e7d09c5adbd29465c6f6d。均为本地文件，未发布。


## 安装实测补记（2026-10-27）

用户回复「点了，你继续」后，已刷新既有X验收页并确认新脚本含feed-scheduler及originatedPrefetch最终保护。实际CONFIG：x-native、ready true、answerCacheReady true、prefetchCount5、prefetchAll false、answerCacheLimitMB1024、enabled true。未访问或绕过扩展管理页/设置页。

真实路径：主页下方离屏两帖已完整生成；滚入第二帖时直接显示1732字答案且无该帖新RUN；点击进入同帖详情显示Cached。随后整页reload，Cached状态及1732字答案仍在，观察窗口无RUN，确认跨页面内存复用。手动Reanalyze原帖只触发1次RUN并完整RESULT，实际WebSocket session.create model=fast。

继续聚焦原生空回复框，X加载更多回复后完成预加载批次；包含上面的手动重分析在内，共8个唯一帖子RUN、8个RESULT、0个ERROR、无重复帖子RUN；观测客户端active峰值7，不声称服务端10worker。此动态滚动批次包含当前可见帖及之前已开始的任务，累计8不是「固定窗口8条」；默认5窗口的数量/过滤规则由本地fixtures覆盖，实屏确认离屏预加载与不持续向后补位。

多次bootstrap/生成期间焦点保持tweetTextarea_0空回复框；稳定阶段scrollY从1662到1662，URL始终保持同一详情页。未输入或发布任何回复。正文已实屏看到分条/粗体/引用，完成尾句保留；原生panel无残留owned标记。临时事件观察器与Debugger/Network诊断已清理。

证据（本地ignored）：artifacts/installed-cache-prefetch-20261027/audit.json、final-focus.png。实际验收覆盖X内置Grok/Fast；API/OAuth/Build、全部模式/改数量/1GB淘汰与浏览器进程重启仍是本地自动化证据，不扩大为已实测承诺。


## 预加载空位修复（用户反馈后追加）

用户观察「中间空了几个，后面先有结果」。只读实屏捕捉：中间卡片为Fact-checking而不是未请求，部分为并发返回顺序不同；另有可重复漏选：一帖仅露出1px、未满足dwell、未发送ANALYZE，却因seenPosts永久排除而让窗口选到更远第六帖。新回归先红：实际105..109，预期104..108。

纠正合同：窗口取视口下方最近5个有效帖子位置，不以曾经进入视口为排除依据；完成/运行条目仍占窗口位置，避免原地不断补远处，并通过entry状态与持久缓存不重发。只排除推广、无有效输入/几何以及当前另一个副本已可见的重复帖。删除历史seenPosts状态；模块字段visible仅表示同帖当前另一个实例可见，与浏览历史无关。并发仍保留，先后完成不必与帖子顺序一致，不以串行执行掩盖延迟。

用户进一步指出「往下滑没有动态继续加载」。确认原实现将prefetchSince与dwell共用，持续scroll每次重置，导致预加载等滚停才推进。修正：预加载每tick随几何窗口立即派发，可见分析仍保留dwell，删除prefetchSince。独立review另复现同id多个DOM实例时重复派发；改为按path/taskRevision/账号/provider/post语言与有效prompt身份共用一份analysis，镜像流式/终态，去重与窗口位置独立，primary卸载后仍保留订阅结果。新增连续100ms滚动、active重复实例、done复用和原DOM卸载四项回归，前端285项通过，待独立复查与最终校验。


本轮空位/动态推进修复审查：同帖多个DOM实例按analysis identity（path、revision、native/OAuth账号、provider、post语言及有效prompt）复用在途/完成数据，leader版本变化镜像流式与终态；primary DOM消失不丢follower答案。review复现同tick两个副本force导致2请求，已将force改为仅绕过completed，不绕过active同身份；新回归证明只1新请求且旧RESULT不覆盖fresh。原reviewer14项定点通过，无剩余阻断。前端286项通过，完整最终校验见下。

修正版完整校验1435 pass、3 skip、0 fail；strict TypeScript/生成一致性/源码重建/60文件生产包/71份JS语法全部通过。安装包已更新，SHA256 e2becc0fa8f62ed0991266bcf9997f70c01d6f5df8c746ab5b1dca9cac26df0b；源码包140文件。当前尚未加载此次修复，已请求用户仅Reload一次，随后继续实屏连续滚动验收。旧版本实屏的成功记录不能代替新调度修复已安装的证明。


## 动态修正版安装实测发现媒体空位（2026-10-27）

用户Reload后换用仍开的主页1162871594并刷新。连续三次滚动（0→651→1302→1953），步骤间约0.5–0.7秒，看到后方新帖进入核查，确认不再等滚停。实屏精确复现一中间空位：2114624985050288377（https://x.com/a2530341932/status/2114624985050288377），正文length0、hasMedia true、imageCount1、有效canonicalURL；卡片Ready to analyze，后方文字帖Fact-checking。根因lookaheadWindow额外要求post.text.trim，虽原生与后台本来允许按原帖URL核查图片帖。

新增红回归：image-only/video-only/quote-only占最近窗口，原实现104被跳过选105..109。移除正文非空过滤，继续依赖已有Core帖子提取与后台URL/id校验；不放宽广告、几何或身份边界。此修复仍待最终检查/重新加载后媒体实测。

媒体空位补丁最终完整校验1436 pass/3 skip/0 fail，strict TS与源码重建通过；独立review验证仅删除错误的正文非空过滤，未放宽链接/身份/广告/几何边界。安装包SHA256 3bae0d99fee4f44cd967a30304f2cefab934618c63f97e10627ea9a5f83076ce；source140文件。动态滚动实屏快照与媒体漏选证据在 artifacts/installed-dynamic-prefetch-20261027/scroll-and-media-gap.json（本地ignored）。临时观察器已移除。已请求用户Reload后精确验收该图片帖，spec保持executing，不把本地补丁等同已安装通过。


媒体修正版用户Reload后复核：主页刷新排序已换，改在原作者页 https://x.com/A2530341932 验收同一原帖。目标2114624985050288377位于top1545、viewport651、scrollY0，全部卡片离屏时已经RUN并完成698字答案，初始最近5帖RUN5/RESULT5/ERROR0。连续两次滚动到scrollY651、1302，间隔约0.6秒，目标移动到top243，698字答案立即可见且目标RUN仍1次。后方新增媒体帖进入Fact-checking并出现新的RUN，动态推进成立。尚在等最后新增批次收尾，随后清理观察器并保存本地证据。


媒体修正版最终安装验收完成：该作者页本轮累计7个RUN、7个RESULT、0个ERROR；原图片帖2114624985050288377仅1次RUN。目标在视口外完成，滚入后显示同一698字答案；滚动新增的后方请求也全部完成。当前URL仍为原作者页，scrollY1302。最终脱敏事件与DOM几何证据保存于 artifacts/installed-dynamic-prefetch-20261027/media-fixed.json（本地ignored，不含prompt、回答正文或凭据）。临时MAIN观察器已清除，验收页保留。此次只完成已授权的本地开发与安装验收，未commit/push/发布；无新增源码变更，因此沿用媒体补丁1436 pass/3 skip/0 fail的最终校验结果。
