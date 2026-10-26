---
status: closed
---

# X 内置 Grok 核查连接

用户授权恢复内置 Grok 调用，并接受产生零碎网页聊天历史。代码位于外置盘，`~/projects/SuperX` 为软链接。基线 main `5cfa125f9000866c1719afc452d1867ef37280bf`。

## 行为与边界

- 增加独立连接 `x-native`，不重新启用旧的 `native` 设置；保留已有连接选择，不自动切换或登录。
- 沿用帖子停留触发、右栏与后台任务生命周期；内置网页仅串行，一个任务使用一个扩展创建的非活动 X Grok 标签页。只关闭自己创建的标签页，不操控用户原有聊天。
- 通过现有 X 登录网页编辑器提交核查指令、帖子 URL 和可见辅助上下文。要求读取完整帖子、核对来源、指出访问失败；网页读取成功不等于事实正确。
- 工作者使用随机 nonce 与后台创建的 tab ID 双重绑定，经扩展 port 握手后才接收任务；hash 本身不能触发提交。只在 `/i/grok` 工作，导航到其他页面立即终止。不读取或导出登录 cookie/token，不用私有 HTTP API。
- 工作者在 DOM 中读自己的新对话回答与链接，流式返回纯文本及来源，完成只由回答操作控件和停止状态判断；空答、网页错误、登录缺失、超时与断连明确失败，不自动重放请求。
- 仅恢复已发布帖子核查；草稿与评论入口在此模式禁用，并在后台拒绝，避免误发未发布内容。网页图片/视频访问由 Grok 自己检索，不声称已作为原生图片上传。模型由网页控制，不伪造 Token/模型统计。
- 禁用此模式跨任务缓存与持久化答案历史，避免 X 网页账户切换造成结果串用；本地浏览记录仍按现有开关工作。
- 设置中说明需已登录 X、使用网页额度、串行、产生网页聊天记录；不承诺更省或无限。

## 验收

自动化：设置隔离、单次提交、身份绑定、取消/超时/断连回收、失败不重放、完成判定、来源归属、模式限制与打包。现有 validate 全绿。真实 Chrome：在 unpacked 安装上选择此模式，公开帖子得到网页生成的核查并显示右栏与来源；不使用 API/Build。若宿主无法加载扩展，明确保留该验收缺口，不以网页手动测试替代。

## 进度

- 已观察当前 X Grok 编辑器为 `[contenteditable=true][role=textbox][data-lexical-editor]`，发送按钮为 `aria-label=Send`，生成中为 `Stop`，对话区域为 `role=region` / `aria-label=Conversation`。
- 已提交一个公开 Apollo 11 事实核查样本以检查回答 DOM。
- 已实现连接、设置与十二语言文案、已发布帖子右栏流式结果、草稿/评论限制与缓存/历史隔离。
- 独立 spec 与代码审查发现的账户失败队列风暴、长上下文超限已修复，并增加回归。断连后的旧任务页不重连也不重新提交；后台不认识的旧 nonce 会拒绝。
- `node tools/validate.mjs` 已通过：1229 passed、3 Windows-only skipped；设置与右栏界面分别有本地预览和程序级验证。
- 真实 X 网页手动核查 Apollo 11 返回中文与 NASA 来源，已确认输入/回答/完成 DOM；不能替代安装验收。
- 宿主浏览器安全策略拒绝打开 `chrome://extensions/`，并明确禁止其他界面或 CDP 绕过。须用户手动加载 `extension/` 后，才能验收完整网页提交到右栏链路；本次未自动加载或替换已安装扩展。
- 独立审查、最终打包及下述真实 Chrome 已安装扩展验收已完成。

## 安装后的实测继续

- 用户已加载本地扩展，Chrome 扩展 ID 为 `mjdgepkcgjilcbngmeblgbnacngccfhk`。真实 X 页 rail 显示 `X built-in Grok`，证明来源已选中。
- 首次与一次手动重试均在网页输入/提交阶段报 `X_NATIVE_LAYOUT`，尚无真实扩展端到端成功，不得把手动 Grok 样本或mock测试当成功。
- 增加受限的阶段诊断（仅固定 stage，无prompt或账号信息），将固定150ms提交检查改为等待原编辑器内容同步与Send启用，最多8秒，保留单发与断连取消。此等待改动尚未证明是根因修复。
- 新增Send延迟350ms的回归验证，等待用户刷新扩展后读取确切失败stage；宿主对扩展设置页也拒绝访问，不能通过其他Computer Use界面绕过。

## 最终验收结论

2026-10-26 北京时间，用户重新加载本地扩展后，完整 X 内置 Grok 链路通过一次真实公开帖子验收。原帖：`https://x.com/runes_leo/status/2101147543380128114`。新建原生会话 `https://x.com/i/grok?conversation=012e9b1f-6944-4041-b4a3-eeb9aff0cf14`，自动回显863字符中文结果及4个可点击来源；右栏 `aria-busy=false`、诊断隐藏，后台任务标签页已自动关闭。截图 `artifacts/x-native-acceptance-20261026/native-success.png`。这只证明该样本的集成，不为模型结论、全量帖子/媒体/所有浏览器或额度节省背书。

实测根因：Lexical `execCommand(insertText)` 吞掉真实CR/LF，导致前后指令相连，输入文本与原prompt的空白归一比较失败。现将实际CR/LF先转空格再插入，JSON字面量反斜杠n保留；发送与答案归属使用同一处理后的prompt。Send启用等待和受限stage诊断保留。独立reviewer已定点复查通过。

最终自动校验 `node tools/validate.mjs`：1231通过，3项Windows专属跳过；`git diff --check`通过。本地安装ZIP已生成，未发布、未提交。用户本地连接保持X内置Grok。

## 当前页不切换的追加验收

用户明确要求全程留在当前信息流。先前实测为了读取后台现场调用了浏览器getTab，故先前的可用验收不能证明无打断，不能把调试期间切页归因为产品必然行为。代码仅以active:false创建任务页，没有激活标签页/窗口的调用。

2026-10-26追加现场观测，期间不claim或打开工作页：
- 第一段30秒：x.com/home由busy=true变为busy=false，document.hidden始终false，visibilityState始终visible，URL始终x.com/home。
- 第二段从一次手动重新分析前开始，每50ms采样，55秒内busy=false→true、hidden始终false、URL不变；随后补读任务已完成，hidden=false、URL仍为x.com/home。55秒观察期与最终补读之间存在工具调用间隙，不能称连续记录了全部完成时刻。
- 以上证明已观测片段没有切页，不证明任何浏览器/其他扩展组合永不抢焦点。已询问用户这轮是否仍有可见跳转，等待其反馈。暂未以无根因的代码改动替代调查。

### 完整不切页实测（不依赖用户反馈）

在当前 x.com/home 上，先装临时只记录可见性/焦点/地址/任务busy的监听，再点击本金保护帖子右栏重新分析，全程不claim或查看工作页。事件监听覆盖visibilitychange、focus、blur、pagehide，同时100ms采样：

- t=0ms：当前页visible、hidden=false、focused=true、busy=false。
- t=8202ms：busy=true，其余不变。
- t=75401ms：busy=false，其余不变；监测结束并自动移除监听。
- 此75.401秒完整窗口内无visibilitychange/focus/blur/pagehide事件、无地址变化。生成阶段为67.199秒。
- 结束后本金保护帖子右栏1115字符、5个来源、busy=false、diagnostics隐藏；另一已完成帖子902字符、4个来源。
- 证据：artifacts/x-native-acceptance-20261026/focus-audit.json 与 focus-success.png。临时window.__superxFocusAudit记录已清除，不改用户页面/扩展设置，不等待用户观察反馈。

结论：本次从提交前到核查结束的完整实测没有切页或抢焦点。先前查看后台页的调试动作不能归因于扩展正常流程；没有证据支持为此盲改运行逻辑。该结论限于当前macOS Chrome配置与这一次完整任务。

## 用户再次报告自动切页：重新打开任务

单次无切页测试不足以排除用户稳定遇到的问题。旧main tab已不在，当前无法把先前监测等同于用户现有浏览窗口。独立任务tab仍存在可被浏览器/其他扩展激活的面，拟验证并改为当前X页内的同源iframe；不再创建任务标签页/窗口，不通过事后切回来掩盖跳转。

先证伪：实际X响应包含X-Frame-Options:SAMEORIGIN以及frame-ancestors self/x.com/twitter.com。已在旧X首页插入一个同源测试iframe，未提交AI请求；须确认登录后的完整Grok编辑器可在同源沙箱frame中正常加载，不移除任何X安全响应头。原型仅作临时探测，结束应删除。

候选连接合同：后台以来源feed client的tabId+nonce绑定iframe worker的非零frameId；父内容脚本负责创建/移除自己持有的iframe，取消/断连/导航均清理；iframe sandbox仅allow-scripts allow-same-origin且无top-navigation/popups，显式断绝顶层导航。manifest all_frames但普通content脚本顶层限定，iframe只启用nonce worker；不读取用户已有iframe。输入focus preventScroll并同步恢复父页原焦点，测试键盘焦点和scroll位置。失败明确报错，不fallback开tab。其余单发、无缓存、草稿禁用、额度暂停沿用。实现前需独立spec检查与原型闸门通过。

### 同页面板方案（替代 iframe 候选）

iframe原型在宿主Browser Use中持续空白且出现paused document response，未通过原型闸门；已刷新原页面移除，不以取消响应安全限制为恢复手段。改用X本身的同页悬浮Grok面板。原型已在x.com/home通过真实请求“37×8=306”得到“正确乘积296”，URL不变，无新tab。已收起原型面板。

实施合同：
- 完全删除native-provider中的tabs.create/update/remove和worker tab port。后台run接收来源client，监听该已验证FEED port中匹配nonce的NATIVE_EVENT；发送NATIVE_RUN / NATIVE_CANCEL。同一时间仍串行。
- 顶层content接收NATIVE_RUN，交native-panel.js。已有用户面板打开则拒绝，不抢占；先安装只作用于本次owned原生面板的屏幕外样式，再点击全局Grok按钮；若X恢复旧对话，则New Chat新建，不篡改历史。
- 使用#layers下包含[data-grok-composer]的独立根作为面板边界；scope内找Send/Stop/Collapse/New Chat与对应消息。面板不展示在视口，不导航，不触碰Open conversation、链接或X发帖按钮，不打开tab/window/iframe，不请求tabs/windows权限。
- 输入focus preventScroll，插入单行prompt后同步blur并恢复父页原焦点，保留scroll位置；所有异步等待前先恢复焦点。不得每次poll或生成结束重新focus，避免抢夺用户后来选择的输入框。
- 正常结果/失败/取消先停止与收起自己的面板，再移除样式/标记并发送terminal事件。已有用户面板不操作；frame/layout/busy失败无tab fallback。若面板关闭无法确认则发明确错误，后台保留安全busy门禁，不能与下一次输入并发。
- 后台超时发送cancel，等待CLOSED ack（或来源port断连）；无ack不释放本会话并发门禁，不自动重发。top navigation/pagehide/worker disconnect时content取消owned面板；每个nonce仅发送一次。所有provider错误、缓存隔离、草稿/评论限制不变。
- 真正验收：全程tabs数量不增加，主URL/可见性/scroll/keyboard focus稳定，右栏收到结果来源，原生面板已收起，连续不同帖可继续；独立审查与mock边界覆盖后再请用户刷新一次。

### 同页实现与安装前复核

- 已移除 native-worker 与任务 tab 通信。native-provider 通过来源 FEED port 单发 NATIVE_RUN，nonce 隔离，取消等待 CLOSED，未确认保留门禁；content 断连清理 owned panel。
- 真实 DOM 复核修正：入口实际为 `[data-testid="GrokDrawerHeader"] > button`，没有 aria-label=Grok。面板边界为 composer.closest(`[data-testid="GrokDrawer"]`)，只隐藏该根。Collapse 后 drawer 外壳保留、composer 卸载，关闭确认以已打开 composer 的存在为准，不能只看 isConnected。简单回答没有 reasoning wrapper，新增严格直系正文路径。
- 已有用户面板零操作；trusted takeover 释放隐藏并停止自动操作；持续监听原生延迟 focusin，保留用户最新外部输入焦点和选区。测试模拟 Collapse 后外壳继续 connected。
- 独立实现审查完成，panel/provider 37 项通过；后续真实 DOM 选择器修正复查中。最新完整 `node tools/validate.mjs`：1244 passed，3 skipped，54 个生产文件，语法与包验证通过。`git diff --check` 通过。
- 本地安装包 SHA256：a188583a7fdfa1e65934634a98da396beed88b0a73f927138fbf5b81a2ccac29。未发布或提交。安装版尚未加载此同页实现，不能声明已消除用户现场跳转；需用户点击扩展重新加载后由 agent 自行完成连续任务与焦点验收。宿主策略禁止 agent 访问扩展管理页，也不能用其他 UI 绕过。

### 首轮同页安装验收未通过与修正

用户点击重新加载后，fresh X 页的 header 实际是 `button[data-testid="GrokDrawerHeader"]`，而打开再收起后才是 header div 的直属 button。原 selector 只能识别后者，导致初始核查失败。OPENER 已兼容两种真实结构，且 takeover 共用同 selector。

手工初始化面板后 Reanalyze 测试出现 CDP focus-emulation/Runtime 超时；一轮 Chrome 报 Page Unresponsive/RESULT_CODE_HUNG，已退出并重新载入该测试页面。另一轮无额外 audit 仍遇到 CDP 超时，但原生 Chrome 截图最后正常显示核查错误。现场卡死的完整因果尚未确定，不能宣称等同于已定位的焦点缺陷。

独立代码审查和有界 mock 确认旧 onFocus→restore→原生异步 autofocus 可无界循环；初始 snapshot 在 root 未绑定时还可能保存原生 Range。现修复：排除任意 GrokDrawer/Header 目标和 Range 两端；同焦点/同 Range 不重复设置；清除遗留 native selection；无外部焦点时使用 body fallback；每个用户操作周期最多12次自动恢复，超限安全失败并收起 owned panel。新增异步反assert、残留 native Range、相同 Range 幂等、初始 Header 焦点4项回归，focused10项通过。

修正后的全量检查1247 passed、3 skipped（在最终 Header 回归新增前）；最终focused10项通过。54文件安装包 SHA256：3d5426645b3f4ad08c208e2e1caa608ca36c804451bbe191fd49e32062b5a842。源码未提交/发布。已请求用户再次reload：实测X普通reload仍使用旧selector，扩展资源缓存不能以页面刷新更新。新修正尚未完成安装验收。


### 原生强制聚焦的真实修复机制

重新加载后，新建验收首页1162871423，fresh入口已成功。但自动任务以X_NATIVE_LAYOUT [input-sync]安全失败。现场实际触发12次恢复预算，证实浮层持续原生聚焦与恢复冲突，不再无界。

先在真实X做隔离原型：收起SuperX，手工打开Grok浮层，设置drawer inert，聚焦主tweetTextarea_0，输入自建测试草稿；焦点稳定。再同步原生editor写入公开帖核查prompt，立即恢复inert，程序化点击Send。生成期间应用生产同款屏幕外CSS，主URL仍https://x.com/home、scroll(0,0)、主编辑器保有焦点且可编辑。最终得到1362字符正文、13个来源链接，reload/thumbsup完成控件齐备；在inert下Collapse.click正常收起，移除临时inert/CSS，测试草稿已清空，未发X帖。此为真实机制原型，不冒充已安装自动流程验收。

已集成生产own(): 设置owned drawer inert，只有同步focus+execCommand写入期间去掉inert，finally立即加回；正常发送、New Chat与Collapse通过程序化click，保持inert；release恢复本次之前的inert状态。已有用户panel仍零操作，takeover释放inert。

独立审查无新增阻断，13项panel测试通过，含模拟inert阻止异步autofocus、临时同步解锁、success/cancel/input异常恢复原inert；绕过inert的反复聚焦保留有限安全停止。全量validate1251 passed、3 skipped，54文件包通过。新ZIP SHA256：032233ff1f808dc5a77c5fb3cada135fb797c2a1fa685666105dc5b9dc5be162。等待扩展重新加载后验证自动右栏完整闭环，不能据原型声明交付完成。

### 用户要求 Fast 模式（待完成）

用户明确要求 X 内置 Grok 使用 Fast，不继续跟随 Auto。当前 native-panel 尚未实现提交前选 Fast，模型元数据仍为 x-web；不得仅改显示文案冒充已选择。

现场浮层的模型按钮是 `button[aria-label="Select a model Auto"]`，打开后 `menu` 只有 `menuitem` “Failed to load models. Retry”。观察网页正常UI重试的Network事件确认：X页面自动请求 `https://grok.com/rest/modes` 返回403，随后net::ERR_FAILED。没有直接调用此接口或读取凭据。正常访问grok.com首页可打开，呈未登录状态且自身输入模式标Fast；回X通过菜单重试后仍403。这不能证明X已选择Fast，也不能据此认定具体403原因。

证据截图：artifacts/x-native-acceptance-20261026/fast-menu-unavailable.png。已收起agent手工打开的浮层、关闭临时grok.com检查tab、停止Network采集；未修改网站模型偏好或扩展代码。后续须先恢复X菜单正常目录，再根据真实Fast菜单项实现每次提交前选择与读回验证；失败不冒充Fast。当前Fast选择被外部目录403阻断。


### Grok 美国分组生效与 Fast 恢复

现场排查确认 Grok 模式目录曾被网络访问限制阻断。调整本地网络分流后，/rest/modes 预检返回204、POST返回200，菜单恢复 Auto/Fast/Expert；以原生菜单选择 Fast 后，新会话仍保持 Fast。此结果只证明当次目录和模式恢复，不保证后续访问始终可用。私人网络拓扑、节点和维护记录不随公开源码发布。


### Connection lost 与富文本显示修正

用户新页1162871441初始显示Connection lost，header仍是未收到CONFIG时默认Grok subscription/3并行，语言disabled。确认无草稿后刷新X，配置握手恢复为X built-in Grok/中文，自动核查实际返回右栏。未据此宣称已确定后台暂断的唯一原因，不将其归于美国路由。

真实完成核查中，rail最后停在“直”，同一原生已保存回答尾句完整。native-panel原先看到控件且无Stop即finish，增加text+sources连续稳定1500ms后再finish；complete=false或signature改变重计时。600ms延迟尾句回归通过，独立复查完成。1500ms是DOM稳定窗口，并非任意延迟的服务端终止保证。

用户指出引用与格式显示差。真实DOM含span[data-streamdown=strong]、ul/li和a[href][role=button][aria-haspopup=dialog]。原read使用innerText丢失这些结构，属于转换链路问题，未改业务prompt。native-dom新增预算受限的DOM→Markdown白名单转换，保留段落/强调/列表/表格/代码/引用/真实安全链接，citation依真实URL编号去重。Markdown renderer为[[n]]安全链接生成sup，content加上标CSS；不复制HTML、不执行模型内容、不加载图片或视频。

捕获当前公开回答的可见DOM做离线回放，生产转换器+生产renderer输出：1个strong、1个ul、3个li、4处sup、6个links，尾句完整。1256 passed/3 skipped，包54文件，SHA256 ae84e061b4bbbe29f590af17ffb9c9deff2fb1c6ef06364aa865e892f37757d2。富文本独立审查进行中，修正版尚待扩展reload后的实屏验收；不能用本地回放冒充已安装生效。


富文本独立审查及定点复查完成：修正表格中代码A|B被GFM切列导致内容丢失，取消全局代码连续空行压缩，新增对应真实Marked lexer回归。23项DOM/renderer测试通过；最终全量1258 passed/3 skipped，54文件，SHA256 251da78942eff9b247d16db33905eb26eb8f6030f948821a4805fd005e41ab50。低优先级保真边界：表格代码中原本含字面反斜杠紧接pipe时，GFM可能消耗该反斜杠，当前真实样本不涉及；未宣称任意HTML/图表都能原样迁移。已请用户一次reload，尚待实屏验收。

### 原始接口方案（用户明确提出，替代 DOM 富文本重建）

用户要求优先读取/请求原始API Markdown，避免剪贴板复制或复杂DOM格式映射。停止继续扩充转换器；已安装富文本版保留至原始接口版通过验收后替换。

真实协议已证伪“普通HTTP纯文本”：X原生Grok使用 wss://grok.com/ws/mgw/ 的JSON WebSocket，URL仅观察query键uid，存在子协议鉴权但未读取其内容。通过一次最短正常网页请求抓到：event.type=response.chunk，chunk.text.channel=CHANNEL_ASSISTANT_RESPONSE，chunk.text.text为原始Markdown增量（实际拼接为 **7 × 8 = 56**）。另有notetaker header必须忽略。response.output_text.done和output_item.done.content.text在样本中为空，不能依赖这些字段；response.done.response.status=completed明确终止。

直接请求原型已通过：复用网页现有已登录WebSocket（不读取/复制cookie、Authorization或子协议），发送 session.create(model=fast)；等待匹配client_event_id的session.created取session_id，再等待conversation.attached；发送匹配本任务event_id的response.create，item为message/user/input_text并带独立client_message_id。结果完整得到 **Markdown 原文测试通过。**，status=completed，无编辑器输入/DOM文本抓取/剪贴板调用。错误原型：复用过期session会unknown_session，因此每任务必须新建session，不自动重发response.create。取消原型：收到首段正文后发送response.cancel(event_id,response_id)，得到response.done status=incomplete、无错误，生成提前结束。

候选实施合同：
- 新native-api-bridge.js在MAIN world document_start安装，只在确切 wss://grok.com/ws/mgw/ 上通过原生WebSocket.send透明包装捕获网页建立的socket引用，忽略URL query和protocol内容；原send调用语义保持，不修改网页自己的消息。无新host/clipboard/debugger权限，不从CDP收集生产数据。
- isolated native-panel通过带nonce的window消息与MAIN桥通信。只允许匹配本任务nonce/prompt/session_id/client_event_id/response_id的回答；一次任务一条response.create，串行150s超时，无自动重放。网页本来就可改变DOM回答，因此window消息不构成信任来源：结果仍verified/searched=false，安全Markdown渲染，无可执行HTML或外部图像。
- 利用已有同页隐藏/inert浮层只完成正常网页模块与登录socket的初始化；不再focus/execCommand写编辑器、不再读取/遍历回答DOM、不再以完成按钮/稳定1.5s判断成功。原生Fast通过session.create显式固定，网页编辑器的Auto不作为实际模型依据。遇已有用户面板/草稿/生成任务仍零操作拒绝；用户接管时停止本任务且释放隐藏，不能操作用户新会话。
- task ARM后等待Grok socket可用；ARM不应使未登录网页获得新权限。新建session后才发送本任务；不接入网页原有/用户conversation，不读取其他WS数据内容，不泄露auth/subprotocol。只收集本任务assistant channel及经真实样本验证的引用元数据，其他reasoning/header/tooltext不进入显示或诊断。
- 取消先发原始response.cancel并等待本response的done/连接关闭，才释放并发槽与收起owned浮层；未确认沿用CANCEL_UNCONFIRMED门禁。客户端断连必须触发取消；MAIN桥任务状态与socket监听定时回收，window卸载清理。完成状态以response.done completed为准，incomplete/failed不能冒充成功。
- 移除native-dom富文本转换器及对应专用映射测试；保留少量DOM入口/面板fresh/busy判断。共用Markdown渲染器保留编号安全上标能力。引用协议已实测：chunk.render_citation 含真实 URL，按出现位置追加 [[n]](<URL>) 并去重编号；缺失/不安全引用失败，不用 prompt 掩盖缺口。
- 先独立spec检查，再实现/独立审查/回归。实屏验收需：单次生成完整Markdown、真实来源链接、Fast、新建/关闭不切页不抢光标、取消确认、同页可连续不同任务。现阶段原型验证不冒充已安装生效。


原始接口 spec 审查四项处理：MAIN nonce 仅作路由，外部消息只允许 PREPARE/RUN/CANCEL 和 prompt，不接受任意 URL、协议载荷或 session/response 标识；协议内部生成并关联所有任务 ID。共享 socket 只解析分流所需 envelope 后丢弃外部任务，不保存/显示其数据。用户新的 response.create 只触发取消本任务，不触碰用户响应。取消在 response.create 之前安全终止；之后等待 response ID 再取消并保留门禁，直至 own done/socket close；不重放、不迁移。NASA 实测引用 URL 为 https://science.nasa.gov/earth/facts/，直接 API 会话未改变可见原生对话或页面 URL。

原始接口实现独立审查发现并修复：发送 response.create/cancel 抛错不能等同 socket close，改为保留 CANCEL_UNCONFIRMED，真实 done/close 才解除；未知 API 拒绝及连接不可用无法可靠判断额度/鉴权，后台直接暂停自动队列，保存连接后恢复，不猜测错误原因。显式回显非 fast 时拒绝生成。定点复查通过，协议 59 项测试通过；完整回归及安装验收仍待完成。

原始接口版完整校验已通过：1312 passed、3 skipped、62 JS syntax、55 production files。独立实现复查通过；包 SHA256 176ede2b7104795ad4697d59a5370076bd9c560f06097025b5d57054accdd210。已请求用户在 Chrome 扩展管理页重新加载；尚未宣称新版本安装实屏通过。后续应先 refresh X（MAIN document_start 必须重新注入），确认 Fast 原始 Markdown/引用、无焦点/导航变化、取消与连续任务，再更新验收状态。

### 冷启动实测与认证适配方案

用户重新加载后的安装实测失败：刚刷新 X、仅打开 Grok 浮层，不建立 /ws/mgw/ 连接；因此复用现存 socket 无法冷启动。New Chat 也不会预连接。已有原型成功仅覆盖 warm socket，不得外推为已安装验收。

网页代码/当前 React props 实证：composer 的 React fiber 祖先存在 runtime，提供 getCredentials/getTurnStatus/getSessionConfig。原生 runtime.getCredentials() 走网页自己的 mint/cache；Webpack module 831216 的 ke 是原生 WebSocket 认证适配器。拟用 MAIN 在 owned composer 限定范围最多35层祖先查找此 runtime，调用原生 getCredentials 并直接交给原生 ke，再传 WebSocket(exact wss://grok.com/ws/mgw/)。认证对象只在 MAIN 函数局部短暂传递，不枚举/输出/token字段读取，不向 isolated/后台/日志/磁盘发送；这取代原“只复用已建立连接”的设计承诺，必须同步隐私文档。

每任务独占一个 socket（不再hook全局WebSocket.send）；fresh Fast session/response ID 关联及 Markdown/citation/cancel 协议继续使用。正常 terminal 后关闭 owned socket；取消发送失败等待 own done 或真实 owned close，超时可主动关闭独占 socket后明确CLOSED（这仅确认本地连接结束，不承诺服务端已停止计费/计算）。用户已有panel/draft/streaming零提交，用户接管只取消并关闭 owned socket，不触碰native runtime.stop/Send/NewChat。getter、formatter、webpack缺失明确unavailable，无自动重试/生成/凭据旁路。客户端导航和断连终止owned socket。

MAIN有限命令新增 CONNECT：必须先 PREPARE 绑定nonce且isolated面板已owned/inert且editor空并runtime idle。CONNECT可等待认证/握手，异步完成后再校验任务仍prepared和owned；取消先清除generation/nonce，迟到认证不得open。RUN只在READY的本任务socket启动一次。协议send前检查readyState=OPEN，关闭事件才调用disconnect。预连接30s超时安全关闭，任务150s上限；无全局网络事件采集、无用户其他WS payload读取。

冷启动专用连接原型已验证：不带 uid 的新连接失败；按原生方式在固定 gateway URL 添加 native credentials.uid 后，得到 session.created.model=fast、完整原始 Markdown、NASA citation metadata，真实 close 已确认，native 编辑器空、URL 不变。认证对象不打印/落盘/跨world，只有 native formatter 读取 token；MAIN 读取 uid 只供固定连接URL。spec复查要求的同 composer/runtime、空editor/idle、取消后auth迟到不open、真实close才确认、固定错误均纳入实现；去掉全局 WebSocket.send hook。

冷启动修复完整检查：1316 passed、3 skipped，62 JS syntax，55 package files；SHA256 d0d9c16fe05f8bc3070b8a90e17a2cbca646bb243636e6aa94051d652e6afaa6。独立审查的原生 runtime 异常边界已修复并定点复查，补充 CONNECT/open/RUN 抛错不泄露原文回归。独占连接取消原型：首字符后 response.cancel，done=incomplete，CLOSED、真实close均确认。安装新版仍需用户reload，之前安装失败不得改写成成功。

用户新增输出偏好：中文引用用「」，核心结论在前、重点分条、短标题与适度粗体；通过 native 请求格式要求实现，不修改或替换原始 API 返回值，不强制凑固定条数，不篡改代码/来源原文。

再次安装实测定位首次失败根因：CONNECT约在4.9–6.8s发出，owned/inert/root/composer均存在，但正式 contenteditable editor 数量为0；X先挂载 textarea placeholder，随后替换为 Lexical 编辑器。native-panel 的editor helper接受textarea导致提前CONNECT；MAIN严格要求真实editor于是立即UNAVAILABLE。已移除placeholder fallback，只有真实 Lexical composer 就绪才CONNECT；补充延迟编辑器的冷启动回归。此前同页完整Fast结果1096字符/4处citation已通过，但不算首次冷启动通过；格式偏好合入同一版后待reload验收。

正式编辑器门槛与用户输出偏好版本：1317 passed/3 skipped，独立定点复查通过；包 SHA256 7d3d9a16909846e29964c307605dc65351480174bf69737ecfeb7cf4807db581。须用户reload后首轮冷启动实测。已有成功截图 raw-installed-success.png 和 raw-installed-warm-audit.json 仅证明前一已安装版在正式编辑器就绪后的 Fast/原始 Markdown/4引用，不能冒充最新格式或冷启动通过。

### 最终安装验收（2026-10-26）

用户重新加载最后版本后，refresh X 的首轮冷启动通过：PREPARE 6998ms、CONNECT 7728ms、READY 8916ms、RUN 8943ms、RESULT 48912ms，Fast，1221字符。未人工打开/预热Grok。连续另外两帖返回1558/1459字符，后续一次手动重查1995字符。每次都独占Fast连接，原生编辑器 input 事件为0。URL始终 https://x.com/home，首轮滚动(0,0)，主动滚动后的核查保持(0,651)，主编辑器焦点在隐藏浮层临时初始化后当帧恢复。

实屏有「」引号、重点粗体、分项短标题及Markdown列表；第二条原始citation metadata为6个去重来源、正文7处sup链接；第一/三条以普通Markdown链接返回，同样正确渲染，不虚构sup。独立取消验收在response.create提交后1s发CANCEL，约838ms后收到CLOSED；未产生RESULT，owned面板清理，URL/滚动不变。原生页面代码之外的临时诊断监听与WebSocket.send观察包装已全部撤除。

1317 passed/3 skipped、独立审查、安装首轮/连续/取消/原始Markdown实屏验收均完成。证据 artifacts/x-native-acceptance-20261026/final-installed-audit.json 与 final-cold-installed.png。最终生产包 SHA256 7d3d9a16909846e29964c307605dc65351480174bf69737ecfeb7cf4807db581；无提交、推送或发布。结项：以原生认证专用WebSocket直读Fast Markdown取代DOM回答映射，已安装可用。私有网页协议变化仍可使连接失效，遇未分类接口拒绝会暂停队列，不自动重放。

### 速度、同页2路并发与CJK符号渲染（2026-10-26继续）

用户明确希望提高并发并排查Markdown符号粘连。当前background.apiLimit将x-native固定1，provider/panel/MAIN各自单active门禁，属于本地限制；实测RUN→RESULT约27–40s，初始化约0.6–2s。并发只减少多帖排队，不声称缩短单条联网查证。

当前实屏可重现「约**$32**」「约**$16,138.6**」残留星号：CJK字邻接美元开头的strong片段未被当前Marked解析。不能用全局替换星号或在中文中塞空格，需定位词法边界并只对正确闭合的strong范围扩展，保留code/escape/link/url语义、安全DOM构造与流式不完整文本。

拟将native并发提升为固定2（不改Build/API默认），任务仍各自Fresh Fast session和socket，取消/定时器/来源端口按nonce隔离；任一取消未确认拒绝新任务。初始化浮层仍串行。MAIN发出RUNNING确认已开始独立协议后，isolated收起owned浮层、撤销焦点管理和UI锁；请求继续在独占socket完成。下一任务随后可独立初始化并运行，因此同页2条API可重叠，无共享UI状态复用。任务终止后若UI已交接清理，不再关闭可能由用户打开的新面板。

安全边界：只有BOOT任务可操纵当前owned浮层；auth/open/RUN仍复核同runtime/composer/空编辑器/idle。MAIN在RUNNING后不再依赖已收起的原生runtime；源文档断开/暂停仍取消其每条nonce。每条任务继续PING，孤立未确认任务占槽，晚到CLOSED能安全回收；启动/取消/结果竞态最多发一次terminal。有限2路不是自动重试或预生成不可见帖；不额外调用探测回答。先独立spec审查并证明收起浮层不影响专用socket；再实现、定点回归、独立审查和一次安装验收。

用户随后明确要求直接10并发：本轮目标上限由2改为10，架构与隔离合同不变；服务端支持必须实测，不声称提升单条速度。UIbootstrap串行、请求10槽独立；任一未确认取消全局拒绝新请求，晚到terminal不触碰新UI。

10路跟进实现完成，安装待激活：background/provider/MAIN/panel均限10独立任务；单UIbootstrap在RUNNING后收起交接，不随旧任务terminal误碰新UI。独立审查发现的MAIN after-auth/open/RUN门禁复查，以及非retained拒绝、本地blocked预拒绝的phantom-slot ACK均修复并定点复查通过。CJK使用上游MIT marked-cjk-friendly 0.1.3（只改UMD封装），manifest/demo/history接线与license齐全，不自行正则替换答案。

真实原型10请求全部Fast，9条返回正确ID、1条主动cancel=CLOSED，无串线；短回答期间观测活动响应峰值8，不据此宣称服务器8上限，也不声称10个服务端worker同时生成。关闭浮层400ms后专用socket仍完整返回。证据 ten-request-prototype.json。离线1440字符fixture解析/安全节点构造100次中位0.336ms、P95 0.888ms，非浏览器layout耗时；单条原先RUN→RESULT约27–40s，故并发减少排队而非保证缩短单条联网。

最终校验1346 passed/3 skipped、63 JS syntax、57 production files；包SHA256 423b7d450dc2aabe49326f7d9da87a5b8adfd26744e6017c7efb6e3fb7ceb9d0。已准备请求用户reload一次，再做已安装多任务重叠、字星号消失和旧任务不影响新UI的实屏验收；当前Chrome仍是前一版，不宣称新10路已安装生效。

### 10路与CJK安装验收结项

用户reload后真实X信息流完成12条核查，全部Fast、无请求ERROR、原生编辑器input为0；正常可见帖滚动下记录客户端重叠峰值7，不冒称已观测10个服务端worker同时生成。已加载isolated NativePanel.create源中tasks.size>=10为true，单元/integration的10槽与第11拒绝通过；前述10独立socket原型9正确结果/1取消也通过。因此10路客户端上限生效，服务端同时生成数不承诺。

在已安装的extension isolated world1374，直接调用真实GrokFirstMarkdown.render（detached节点，不改网页）：约**$32**、约**$16,138.6**、**「重点」**均变为strong，text无星号，插件函数已加载。实际回答排版正常。证据 ten-installed-audit.json、ten-final-ready.png。本批请求RUN到RESULT 29.482–74.336s，中位42.894s；首正文18.900–63.054s，主要等待在联网/服务端处理，10路缓解排队、不保证缩短每条请求。1346 passed/3 skipped，独立审查修复项均复查通过。包SHA256仍423b7d450dc2aabe49326f7d9da87a5b8adfd26744e6017c7efb6e3fb7ceb9d0。已撤除全部本轮诊断监听/包装，恢复展开右栏，无提交发布；结项。
