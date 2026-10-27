---
title: Markdown 公式渲染修复
status: complete
---

用户报告SuperX科学核查回答中TeX公式未渲染，样例(2^{O(n/\sqrt{\log n})})。只修复排版，不核实其引用的科学断言。当前marked只渲染普通Markdown，缺少数学token，\(...\)反斜杠可被当作Markdown escape。

方案：本地打包KaTeX固定0.19.1版本，使用公开renderToString(output mathml,trust false)输出原生MathML，不加载远端脚本、字体、图片或HTML；有界XML解析后只复制MathML允许节点/属性到目标document，禁innerHTML/模型HTML。逻辑进入src/content/math-renderer.ts，构建为本地generated入口，markdown renderer消费。Chrome120已有原生MathML；公式不依赖ShadowRoot外CSS。

支持\(...\)、\[...\]、$...$、$$...$$与用户样例这种带明确TeX命令的括号公式；普通括号、美元金额、转义美元、代码块/inline code、链接与引用保持原样。未完成流式公式先保留原文，闭合后渲染；无效公式单独回退原文，不清空整篇。限制表达式长度、节点、maxExpand/maxSize，不开启trusted命令。读写路径覆盖feed/draft/history的同一renderer；许可、生产allowlist与源码可重建校验同步。

验证：样例MathML包含msup/msqrt，常见分式/求和/矩阵/上下标/中文邻接/表格/引用、流式每个前缀、无效表达式、金额/代码/链接、恶意命令/宏/超限；全回归、严格TS、打包。CUA本地浏览器视觉检查公式、行距与长公式溢出。最终独立审查；真实X需用户Reload后另验收。

独立spec复核无方向阻断：已明确平衡嵌套普通括号；实现上限4096字符、1500节点、深度40、maxExpand200、maxSize20、每篇64公式且计入Markdown总节点预算。未闭合外层括号整体保留，不错误渲染内部子式。


实现与验证完成：KaTeX0.19.1固定本地bundled，MathML-only，无网络字体。新增27项数学回归，连同20项既有Markdown专项共47pass；完整npm run check为1509pass／3skip／0fail，严格TS、4generated一致、源码导出重建、62生产文件、73JS语法全部通过。npm run package:release成功。

独立最终review实际读取math源码、Markdown接线、manifest/history/demo、build/package/license和测试，未见阻断；指出start与explicitTex命令列表差异，已共用explicitTex.source修复，dfrac/alpha两项回归及原reviewer定点通过。

CUA真实Chrome本地ShadowRoot视觉验收：用户普通括号与标准行内样例均显示指数/根号，引用仍上标；分式/求和/矩阵清晰，美元金额和inlinecode原样；长公式容器360px，内部scroll1280px，answer宽/scroll均360px，页面宽/scroll均2048px，尾句保留。流式起始formulaCount0，结束2，引用1，尾句完整。样例截图artifacts/math-rendering-20261027/sample.png，本地ignored。两次后台tab截图超时后将自建验收页置前台即成功，未改浏览器设置或用户页面。

当前代码/安装包已准备好，但Chrome安装扩展仍为旧脚本，待用户Reload后刷新X进行最终真实帖子显示验收；不把本地ShadowRoot预览当作已安装通过。未commit/push此轮修复，保留本地可审阅改动。


用户Reload暴露真实安装缺口：Chrome报math-renderer.js不是UTF-8，manifest加载失败。原文件266180字节可严格UTF8解码但KaTeX正则构造字符串含1个原样U+FFFF；普通网页加载与语法测试未覆盖扩展loader的字符限制。先新增构建编码回归，旧产物失败；math生成entry改charset ascii，哨兵转为\uFFFF，语义不变。esbuild对regexliteral仍可保留普通非ASCII文字，因此验收针对Chrome不接受的noncharacters，而非错误承诺全ASCII。包预检新增fatal UTF8解码及JS/CSS noncharacter拒绝（FDD0..FDEF及每平面FFFE/FFFF），覆盖非法UTF8／UFFFF／10FFFF三种输入。构建/包/公式定点51pass。后续完整结果见验证日志/tmp/superx-math-encoding-validation.log。安装目录保持不变，未操作或绕过扩展管理页，仍须用户点击重试后才能确认真正loader成功。


用户再次Reload后安装复核：刷新原X主页，overlay正常出现、缓存可读，编码loader错误消失。实际扩展isolated context（origin为本地SuperX extension）确认SuperXMath/GrokFirstMarkdown/XGrokCore均object。调用实际安装renderer处理用户原样公式，得到MathML1/msup1/msqrt1/上标引用1，并在X实际卡片样式的临时、明确标注“本地样例，非Grok生成”验收块中实屏显示；截图artifacts/math-rendering-20261027/installed-x.png。临时块已删除，自建测试tab关闭、Runtime诊断关闭，不改用户内容。

完整新生成另遇X_NATIVE_UNAVAILABLE：数学原帖https://x.com/ktwu01/status/2114908883227455716。启停恢复enabled后手动重试仍失败（之前进度只证明按钮恢复，不能当连接成功）。仅检查旧固定webpack模块831216的导出形状，当前页面返回空导出，formatter ke不存在；没有取出credentials、token、cookies或尝试其他模块。该连接适配问题与MathML格式代码无关；未声称真实模型生成已通过。当前公式加载/安装版渲染已验收，新的native生成仍不可用，需独立修复其网页适配。此轮没有改变native协议代码。

编码修复后最终完整校验1514pass/3skip/0fail，62生产文件、73JS语法、4generated一致与source重建通过，package:release成功。

最终安装闭环：native适配修复后，实际6条核查返回完整终态，含73个MathML公式及22个上标引用。实屏主帖公式正常，未跳转；详见2026-10-27-native-adapter-update-spec.md。此前待Reload／生成失败记录是历史阶段，当前已解决。用户现已授权commit/push本轮全部修复。
