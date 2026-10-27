---
title: 吸纳上游 1.1.0 修复并保留简单暂停
status: closed
---

## 最终授权与范围

用户授权吸纳upstream/main两个提交716bfa8和fe3ecd2；实施中明确不要自定义／悬停／额外模式，只要一个简单暂停／启动按钮。以本地0e18058164af4bf0c127a9c7891d1837d8d7dcdc为基线做真实Git merge保留上游历史，按最终用户要求排除上游复杂触发功能。范围不含未合并PR、安全加固或新provider。

保留X内置Grok/Fast/10并发、无页面切换、默认1024MB可配长期缓存、最近五帖动态预加载与图片／视频／引用帖、同帖在途去重、优先级和已启动任务保护。TS cache／registry／scheduler继续为唯一owner，生成JS可重建。

吸纳视频封面URL参数、图片错误分类与不重试、隐藏保留DOM提取、回复控件间距、OAuth临时恢复、暂停时读取缓存等修复。popup/options延用原boolean控制，阅读右栏新增一个暂停／继续按钮；没有custom/hover设置、帖子新按钮、trigger schema或新provider。

## 行为合同与实现

`enabled`是启停唯一owner；暂停撤回尚未开始的自动分析／预加载，保留已开始逻辑任务（含重试）和已接受明确force重分析，切换启停不进入付费identity或清缓存。恢复继续最近五帖窗口，不重发保留请求。评论／草稿原有行为不扩展，native仍不支持它们。

`LOOKUP_CACHED_POST`独立纯IndexedDB查询，三方账号／generation／clear epoch+barrier／取消隔离与ANALYZE缓存身份一致；miss不获取凭据、不初始化native、不占并发。前端读取位于enabled/providerReady早退前，暂停仍保留右栏及已有答案。原生查询携带公开账号；账号未知不读。

同帖共享统一使用本地analysisKey／analysisLeader，未引入上游followers第二owner。force与prefetch独立，force重分析仍复用同身份active任务。候选仍按空间位置不跳过无正文媒体帖。

分工：主agent负责前端、文档、验收；Codex CLI处理后端初步合并后因模型capacity退出，无最终报告，实际源与测试由主agent核查；实施agent机械精简后台至用户最新范围，指定348测试和严格TS通过；独立spec reviewer确认精简合同，并对最终实现只读审查。所有构建在写入结束后执行。

## 验证与交付边界

最终npm run check：1482 pass／3 skip／0 fail，strict TS、生成一致性、源码导出重建、60生产文件、71JS语法通过。前端定点486项通过，包含启停／缓存／媒体／重复DOM／动态预加载；后台348项含10native在运行＋排队prefetch时暂停恢复、force/retry保留、异步cachemiss后暂停、passive身份与清空race。

CUA本地模拟页亲自点击单一rail-toggle：暂停→继续→暂停，Markdown列表答案保留，未调用真实服务。该结果不等于真实X新版本验收；安装目录不变，仍需用户Reload后刷新X。宿主禁止访问或绕过扩展管理页。

待独立最终review、打包及merge收尾；没有声称上游发布包校验值属于fork。README明确fork排除custom/hover；上游发布记录仅作为上游历史来源保留。

最终独立审查：final_pause_review实际读取最终content/background diff、调度/重试/缓存身份/clear barrier及回归用例，未发现可复现阻断；未重跑全套或浏览器，范围明确。早先spec_review只覆盖精简前版本，不将其当作最终通过依据。1482pass/3skip校验仍对应最终语义实现，之后仅清理空白/注释及文档。package:release成功，60生产文件、完整source包已更新；当前等待用户Reload后的真实X新版本验收。临时模拟浏览器页已关闭，本地服务器已停止。合并按用户最终范围排除custom/hover，保留真实上游历史。
