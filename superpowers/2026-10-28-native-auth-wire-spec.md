---
title: 去掉 X Grok 认证对固定模块编号的依赖
status: closed
---

用户报告 X_NATIVE_ADAPTER_CHANGED，要求排查频繁变化，并要求此后每次记录更新日志。本次仅修改认证格式适配、对应测试、架构记录和日志；不改变权限、Fast、并发、缓存、连接初始化或取消协议。

CUA 当前 X 原生 Grok 页公开脚本 bundle.GrokXWebRuntime.146bd34bb7c2da5fa.js 使用 ts=s(387111)，createSocket 调用 ts.ke。直接检查旧 228952.ke 不可用，当前 387111.ke 为函数。只读取当前直接依赖函数静态源码：省略 protocol 默认 grok.bearer，xai-x-user 使用单个 xai-x-user.token 子协议，其余原生分支为 grok.bearer 与 token 两个子协议。没有读取或输出真实 token、uid、cookie、认证头或网络帧。

因此本次证据是内部打包编号变化，不能证明 Grok wire 协议变化或每日变更次数。修复把两个已观察格式在 MAIN 内本地转换，不读取 webpack，不扫描模块；未知协议、空值或不合法 token 在创建 socket 前固定报错。私有 runtime 和 wire 协议仍可能变化，不能承诺以后永不失效。

验证：42 项 native-api-bridge 测试通过，覆盖两种格式、默认协议、模块完全不可用、无凭据泄露、非法格式、取消、十并发及传输确认。完整 npm run check 为 1593 通过、3 跳过，严格 TS、生成物、发布白名单、manifest、JS 语法均通过。npm run package 成功。独立只读 reviewer 检查所有本轮 diff 及连接取消上下文，未发现阻断问题。

已补 CHANGELOG.md，ARCHITECTURE.md 记录后续用户可见修改须附日期、验证状态。当前浏览器仍为旧脚本，必须用户 Reload 后实际核查；宿主策略禁止代理操作或绕过扩展管理页。未提交或推送此轮修改。

用户 Reload 后 CUA 实测：新开 Ryan Williams 帖 2114835554177261953，实际加载 native-api-bridge.js 包含 authProtocols 且无 require(228952)。先看到旧缓存，再显式点击 Reanalyze，观察 Fact-checking 到全新完整答案和 5 个引用、Reanalyze 终态；非缓存结果元信息不再含 Cached result。全过程 path 保持原帖，没有认证适配错误。未读取真实凭据、认证头或 WebSocket 帧。

随后刷新同帖，恢复的是本次新答案（同一开头及 5 引用），元信息明确 Cached result; no new tokens for this part，无 Fact-checking。缓存持久化恢复通过。
