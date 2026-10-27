---
title: 保留 X 搜索栏并精简 SuperX 工具栏
status: closed
---

用户截图显示品牌被语言选择和按钮挤成Su...，原生Search被覆盖。实际Chrome viewport2048×651：primary右缘1266.5，sidebar左1296.5右1646.5宽350，原生form[role=search] top6.5 bottom50.5；插件header top0宽380高53。设计：不改X主帖宽度；插件右栏与原生sidebar左右对齐，搜索框完整保留；插件header放搜索框下方8px、高40px。缺搜索框时保持既有header几何。搜索focus时暂时隐藏插件overlay，让原生suggestions可见可点击；失焦恢复，不取消运行答案。输出语言只保留设置页入口，删除rail语言DOM/CSS/事件/唤醒控制分支。保持暂停、历史、设置、收起。主agent自行实施和视觉验收前端，不委托CLI修改前端。

验证：移除语言选择且CONFIG语言仍正确管理既有答案；native sidebar带gap时对齐；搜索矩形/隐藏/滚动位置与ResizeObserver变化；搜索focus不截获原生输入、不取消既有请求，blur恢复；无搜索时既有feed/header布局不回退；窄栏按钮和无空间隐藏。源码/全量测试/安装包，实际安装后可视与点击验收需Reload。前两轮缓存与回复改动保留。

本地真实Chrome演示页视觉与交互通过：header左右1238..1558，搜索框相同，header top147/bottom187，search bottom139，8px间距；品牌SuperX完整，语言select数量0。点击Search输入框后overlay隐藏，原生模拟suggestions出现；点击外部后overlay恢复。预览均明确标注模拟数据，不调用Grok，不当作已安装X验收。截图artifacts/math-rendering-20261027/search-rail-preview.png。343项content/layout定点通过。最终npm run check 1569pass/3skip/0fail，strict TS、generated一致、62文件包校验、73JS语法通过。当前实际安装X源仍无searchHeaderGeometry，需用户Reload后最终真实搜索点击验收。

限定独立工程审查通过：focus不取消已开始请求，blur恢复，搜索缺失／离屏／resize有回退；侧栏gutter保留；语言控件与SET_LANGUAGE旧唤醒分支无残留。临时浏览器页关闭，本地预览server停止。安装包更新，待用户Reload实屏验收。

用户补充拖拽宽度需求。原生搜索布局已实际安装验收：真实X搜索框1296.5..1646.5，toolbar相同350宽，top58.5/bottom98.5，select0；实际输入公开测试词SuperX后overlay隐藏且focusedSearch=true，清空输入并点击外部后恢复，原帖URL保持，截图search-rail-installed.png。本轮搜索基本行为闭环。

扩展方案：保留默认native sidebar宽度，在分析栏右边缘提供可拖动resize separator；向右利用屏幕空白，向左收窄，最小220px、最大视口右缘，不覆盖/缩放主帖或改变原生搜索框。local偏好railWidth=0表示自动；用户宽度独立持久化、广播，不进入analysis settings/revision/cache键，窗口变窄仅裁剪显示，回宽恢复偏好。pointerup才存储；pointercancel/Escape/失焦撤销未完成拖动。支持键盘左右调整与Home/双击恢复默认，aria separator标签有12语种。用户还未Reload此新增部分。

拖拽本地实现与验收：原生PointerCapture，begin显式focus separator，pointercancel/Escape/window或handle失焦恢复旧偏好，第二pointer不接管。独立review发现preventDefault导致Escape不获焦，已修复并通过原reviewer定点复查；实际ShadowRoot.activeElement与AX均确认为resize handle。CONFIG唤醒时保留尚未发送的SET_RAIL_WIDTH，避免旧偏好覆盖用户刚选的宽度；backend单独railWidth串行写和广播，不改变任务代、settings、缓存或running signal。

本地真实Chrome演示：320→560px拖动保存560；刷新仍560；Home与双击都回320并保存0。主帖600、search320不变，模拟分析4/取消0计数不变，pageWidth2048等于viewport2048，无横向溢出。预览图artifacts/math-rendering-20261027/resize-wide-preview.png，明确只是假数据演示。新后台/布局/content定点711项通过；补handle-blur与idle wake后最终npm run check 1580pass/3skip/0fail，strict TS、生成一致、62文件包、73语法通过。安装端尚未加载新resizer，需用户Reload后实际X拖拽/存储验收。

用户Reload后真实X安装验收通过：进入时用户已选547px，实际拖到697px，刷新仍697；双击恢复默认350，再通过真实拖拽恢复用户原547px。主帖600px、原生search350px，pageWidth2048等于viewport2048。实际输入公开测试词SuperX后overlay隐藏、searchFocused=true；清空并点击外部后恢复547px，测试输入空，activeCards0、主帖Cached，无重分析迹象。截图artifacts/math-rendering-20261027/resize-installed.png；临时页已关闭。没有改用户原有宽度偏好，真实drag/persist/default/search闭环。此前1580pass/3skip/0fail对应当前代码，无新增生产改动，不重复全量。
