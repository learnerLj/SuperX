---
title: 统一 SuperX 公共契约的唯一维护位置
status: completed
---

用户要求继续重构SSOT。基线5915651，工作区干净。按当前会话上下文理解为移除重复的类型/配置定义；本轮聚焦已验证重复的公共领域契约，不更改产品行为，不把测试工具全迁TS，不拆大模块作为旁支任务。

证据：shared/contracts、providers/types、background/worker-types各维护Post；providers/types与background/history-store重复Usage和Metadata；feed-core与provider重复诊断；UI/provider重复ModelEntry；shared/provider重复Authorization；content本地Result重复共享答案字段。默认设置/模型档位已有feed-core运行时owner，不复制第二配置中心。

设计：shared/contracts.ts作为公共领域owner，唯一维护Post（补齐已被消费的草稿/username等字段）、Source、Usage/嵌套详情、GenerationMetadata、FailureDetails、ModelEntry、Authorization及映射派生的SettingsInput。清洗后的RequestDiagnostics和原始ProviderDiagnostics以不同类型表示，字段从同一owner派生，不放宽清洗后failureOrigin/transportStatus/effort约束。AnalysisResult补全已有实际元数据字段；各层别名、Pick/Omit/Partial/扩展体现其真实阶段，不继续重复整份字段清单。

Provider-specific wire frames/secret/oauth状态、持久历史精简视图、worker Job/Subscription、DOM视图状态保留各自owner；这些不同职责不能因为同名就强行合并。禁止runtime新增import/export跨world。只允许类型导入/导出和类型断言变化；生成的27个runtime JS应逐字节保持基线相同。无any/nocheck/unchecked双重断言。

实施分工：主agent维护shared/contracts与UI/content类型接线；按codex-cli技能将明确的provider/background/core类型迁移交CLI（只改指定文件、不commit/push）。spec先独立只读审查，完成后独立实现复核。新增type-test验证Post同一类型、Usage和metadata跨层可赋、原始/清洗诊断不可错误互换、可选恢复授权从owner派生。原有行为测试保留。

验收：严格TS与格式、全部行为测试、生成JS逐文件字节相等、干净构建/源码导出及安装包SHA一致、公共契约重复声明清单复核、CHANGELOG/ARCHITECTURE记录owner。按原任务持续授权commit/push并验证远端，不需要扩展重新加载（若运行产物完全一致）。

## 实施与验收记录

- 规格独立审查通过；保留 raw→validated 的单向可赋关系和 required/optional 授权恢复差异。
- 公共契约统一到 shared/contracts；12 个生产 TS 消费文件改为导入、重导出或派生。历史 stage map 保留 Required 视图；私有协议和生命周期未强合并。
- `AnalysisResult` 默认表示已归一化诊断，provider transport 显式返回 raw 类型参数。worker 的 `withBillingMetadata` 原声明误将原始入参视为已校验，现使用派生 ProviderResult；现有 delete + sanitizer 后单次断言恢复 Result，逻辑不变。
- 新增 tests/types/shared-contracts.type-test.ts，校验 Post/用量/模型等 owner 一致性、真实 sanitizer 输出及原始诊断/非法 effort/status/可选授权恢复的负例；由 strict tsc 消费。
- 主 agent 的 `npm run check`：1598 passed，3 skipped；含格式、strict、27 入口生成一致性、源码重建、资源与行为测试。独立 reviewer 的 typecheck/build --check 通过，12 个生产 TS 擦除类型后与5915651逻辑一致，无剩余finding。
- 实施前保存全部本地29 JS 至 /tmp/superx-contract-ssot/baseline，与正式重建结果逐字节比较：27 generated + 2 vendor均无差异。`npm run package:release` 成功，安装包 SHA256 d279b74bd4750386f8112afef27b3db28665b7c145e0c5ea3dbafa22f909d0ed 与基线一致，源码包包含共享owner和新type-test。
- CHANGELOG及ARCHITECTURE已更新；README维持用户版简洁内容。此轮无需插件重载，不声称新增真实X运行验收。日志 /tmp/superx-contract-ssot/check.log、package.log；生成JS继续不纳入Git。
