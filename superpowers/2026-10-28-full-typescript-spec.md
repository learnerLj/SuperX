---
title: SuperX 全量运行时 TypeScript 迁移
status: closed
---

用户要求把剩余手写运行时代码完整迁入 TypeScript，保持功能不变，测试、更新日志做好，最后 commit/push。基线 c361cc3，工作区干净。

范围：extension 内全部自有 JS 变成 src 下严格 TS 源码的生成物。保留第三方 marked 与 marked-cjk-friendly 官方 UMD 文件及许可证；KaTeX 仍由现有 TS 入口打包。tools 的 Node ESM 构建脚本和 tests 的既有 JS 测试是开发工具，不是遗漏的扩展运行时，不强行在行为迁移同时改测试框架。

构建保留现有文件名、MV3 manifest、脚本加载顺序、UMD/CommonJS 和 browser globals、MAIN/isolated/service worker 边界。新增源码用类型导入/导出，非打包脚本通过 esbuild transform 擦除类型，无运行时模块包装；现有四个已打包入口保持原方式。strict、noUncheckedIndexedAccess 持续启用；不使用 ts-nocheck/ts-ignore，不关闭严格检查，不用全局 any 字典掩盖类型。真实动态协议边界允许范围受限的类型断言并保留原校验。

源码按 background/providers/content/ui/shared 放置；Chrome 与浏览器全局声明单独维护，业务状态、任务、消息和 provider 接口落实到实际 consumer。不加入新功能、不改算法/错误策略/认证/并发/缓存行为。类型迁移中发现行为问题先记录，不混进此轮。

执行：独立 spec 审查；按文件分开迁移后台/协议与前端；主 agent 接线 build、文档、发布清单与源码导出；构建覆盖检查保证每个自有运行时 JS 都有唯一 TS owner、无遗留手写 JS。CLI 仅后台/纯数据模块，前端主 agent 负责。完成后独立审查 diff、针对修复定点复核、完整 npm run check/package/source 重建一致性。现有行为测试断言保留，源码文本断言改为等价结构或行为证据，不能因迁移删除保护。

完成条件：全部自有入口 strict TS、生成物可复现且 drift 被拒绝、既有测试通过、关键边界 type-test、生效构建与真实安装验收状态如实记录、CHANGELOG/ARCHITECTURE/CONTRIBUTING 更新。若宿主仍禁止扩展管理页，完成所有本地工作后只请用户 Reload，不绕过限制。用户已授权最终 commit/push，独立审查和有效本地验证完成后执行，安装验收可在 Reload 后继续。


完成结论：全部 27 个自有运行时入口迁至 src 严格 TypeScript，extension 仅为可复现生成物，两份 Marked vendor UMD 精确豁免。功能回归与独立审查通过；用户已授权本轮 commit/push，最终提交完成后核对远端。真实安装版本需用户 Reload 后另行验收，不把本地预览当作已安装验证。

实施与验收：

- spec_review 在实施前只读核对计划、manifest、源码导出与入口清单，无阻断；据此补递归 ownership、classic script/world 与无 any/suppression 验收。build 递归枚举 extension JS，双向核对唯一 TS source，缺失和嵌套遗漏均拒绝。
- 后台 CLI 会话 01a17e6c-616c-7563-992e-0f5051b00b86 负责 worker/core/history/key-store，643 项原行为测试通过；provider CLI 会话 01a17e6c-5cea-7773-98ed-6775f2b6d553 负责 9 份协议/认证模块，384 原测试通过、3 Windows shell 项跳过。主 agent 负责所有前端/UI、shared/global 接线、构建与最终验收。
- 两位独立 reviewer 核对原版与擦除后的运行逻辑、认证/并发/取消/缓存、DOM 生命周期与实际调用边界。发现 draft input 的可选 closest 方法检查在迁移中误删，已恢复原 ?.closest?. 调用；新增 jsdom Document/Text input target 回归，修复前稳定 TypeError，修后 1/1 通过，原 reviewer 定点复查闭合。
- HTML input.value 本来是字符串。TS 赋值显式 String(number)，mock UIElement 亦修为真实 DOM 的字符串setter；原有并发/停留/保存/重开断言保留，数值配置保存仍按 Number 读取。没有更改推荐默认值或 native 10 并发。
- classicSource 先以 TS AST 剥离类型模块声明，再做独立 esbuild transform；避免顶层 this 被ESM转换，不添加 runtime import/export/wrapper。保留所有现有脚本名、加载顺序和MV3权限。原四个打包模块保持原 IIFE，不打包跨world。
- 完整 npm run check 最终 1598 通过、3 平台相关跳过，含 strict/noUncheckedIndexedAccess、锁定Prettier排版、27生成物漂移、62发布文件、30manifest/UI资源、73JS语法检查、源码包重建一致性。新增负向type-tests直接消费真实provider/layout/UI契约；源码构建拒绝 any、抑制指令、双重unknown断言和src手写JS。
- Chrome CUA 本地预览实际载入生成物：设置快速配置正常；模拟答案的标题/列表/引用/表格正常；右栏从320拖到432；未调用真实provider。临时页关闭。新迁移构建尚未重载到实际X，留明确边界。
- 更新 CHANGELOG/ARCHITECTURE/CONTRIBUTING，给出真实TS owner与维护命令。tools/tests仍是开发用Node ESM/CommonJS脚本，第三方发行源码不重写，这些不属于遗留的扩展业务实现。


后续用户明确要求生成代码不提交 Git：初次迁移 aa0c79e 保留了生成物，现改为仅在本地与分发包保留。按 GENERATED_ENTRIES 精确 git rm --cached 27 项，不删除已安装 extension 的本地文件；vendor/static 继续跟踪。npm 测试/验证/打包入口与CI/release均先构建。正常构建允许缺少尚未生成的输出，但依旧检查TS owner/vendor；--check保留缺失/漂移拒绝。对应重建测试删除全部生成JS模拟全新克隆，再构建并比较原产物。真实运行时代码和权限不变。


Source-only 跟进验收完成：独立只读 reviewer 核查CI/打包/正常构建与--check链路无阻断。由已暂存index checkout-index得到真正不含27个生成JS的干净检出，在独立目录实际 npm ci、npm run check、npm run package:release 全链路通过：1598 pass、3 skip。安装ZIP SHA256仍为 d279b74bd4750386f8112afef27b3db28665b7c145e0c5ea3dbafa22f909d0ed，与移除Git跟踪前完全一致，证明本次仅改变源码分发/构建跟踪，不改变浏览器运行产物。git ls-files只剩两vendor JS，git check-ignore验证全部27生成输出被忽略，access验证全部27本地文件保留。按用户此前授权将跟进修正commit/push。
