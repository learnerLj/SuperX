---
title: 导出长期核查缓存
status: closed
---

用户批准 Markdown ZIP 与 JSONL 两种导出，保留此前长期缓存与各provider功能。本轮新增设置维护区的两个导出按钮、进度/取消，不加导入功能或新权限、不请求AI或修改缓存。

数据owner：background/answer-cache.ts的IndexedDB SuperXAnswers/answers。加入只读分页接口，每批按主键前进，限制条数和字节预算，单条可超预算以保证推进；不触碰LRU/meta。分批事务不声称一致快照，导出逐批读取时可见记录；并发写入可能进入/替换/删除，不能静默宣称开始时全部。空库也生成有效文件，损坏记录不伪造原帖；记录缺失/非法URL字段置null，正文类型损坏时明确计入跳过数，失败不能显示成功。

新增TypeScript导出模块：引用唯一answer-cache模块读取；公开版本化JSONL格式（首行manifest，后续每行analysis），按明确字段白名单输出正文、来源、完成时间、provider/model、语言、reasoning effort和已知usage字段。只解析已知缓存key格式获取公开帖子URL与语言，不输出raw key、账号/credential ID、自定义prompt、连接设置或诊断文本。SHA256(key)作variantId保留多个版本。JSONL用于归档/处理，不声称能直接恢复当前账号cache。Markdown ZIP一条分析一文件，文件名仅固定前缀+variantId避免路径穿越，保留正文Markdown原样；补充来源（仅http/https）和元数据、归档说明。无原帖正文/源网页快照/图片本体。

写文件：Chrome/Edge File System Access API，按钮用户手势立即打开showSaveFilePicker，createWritable流写；不使用整库Blob或扩展下载权限。取消picker或处理中取消不报成功，写入失败abort临时输出。ZIP使用锁定版本zip.js的ZipWriter+WritableStream，ZIP64支持多于65535文件，禁用workers/WASM/远端加载，顺序生成且不把正文全部缓存。UI明确 unsupported browser、选择中、进度、成功（已写入条数/跳过数）、取消、失败。页面离开取消。保存仅在close成功后报告完成。

分工：主agent维护options前端/HTML/i18n/UI验收与共享globals/build/package接线；codex-cli按明确范围实现只读分页、导出格式/ZIP模块及行为测试，不动UI、不commit。先spec只读review，再完成跨组件实现review。

测试：fake-indexeddb多页/大单条/空库/并发增删/无LRU副作用；JSONL schema白名单、已知native/API/OAuth/Build key、旧/坏key、原文/来源/usage与变体；ZIP真实解包和中文/公式/引用/非法文件名、空库、超过65535条ZIP64；慢sink背压、取消/写入或close失败、无整库聚合。UI双格式/双击互斥/picker取消/处理中取消/错误/成功/重试验证，真实Chrome本地预览和导出文件验收（不替代安装插件验收）。strict/format/全量check/源码与安装打包，CHANGELOG/ARCHITECTURE记录格式和限制，commit/push核对远端；新功能需用户随后Reload。

## 验收结果

已实现并通过本地验收；安装扩展尚未重载，真实已安装缓存的导出仍需重载后验收。无导入功能，无权限增量，无AI请求。

- 规格独立审查通过。backend由Codex CLI实现唯一cache owner的只读分页、新TS导出模块及行为测试；主agent完成设置HTML/CSS/控制流程、12语言翻译、构建/许可/打包接线。
- 独立实现审查发现并闭合：URL元数据数字实体转义导致Marked输出错误href；文件close成功后检查signal导致已提交文件误报取消。现用安全autolink，并用实际Marked lexer/parse+DOM检查href；最终observer和取消检查均在sink.close前，close成功后只返回，清理失败已隔离。observer抛错/取消、close中取消、ZIP close中取消均有针对测试。
- 真实Chrome本地页面（与插件数据库隔离）通过原生保存对话框分别导出3条JSONL和Markdown ZIP。主agent读回文件：manifest+3分析、3不同variant、公式/中文/引用/来源保留、测试账号与prompt未输出，ZIP校验/summary正确。后续链接修正通过实际Marked测试，原生picker取消状态已验证；导出区布局实屏发现flex误用并修正为纵向区块+横向可换行按钮，最终截图验收通过。临时QA页面与脚本已清理、预览页关闭、服务停止；测试文件归档/tmp/superx-cache-export/chrome-qa.*。
- 65,536条analysis真实ZIP64生成及解包通过；只读分页、多页/大单条、空库/坏记录、read-time并发增删、无LRU修改、背压、各阶段取消/读写关闭错误和重试均覆盖。最终npm run check：1623 passed，3 skipped；strict/format、28入口、64安装文件、源码重建一致性全部通过。
- 源码重建曾发现esbuild真实路径解析共享node_modules软链接，使zip模块ID不同；最小实验（相同源码/tsconfig/package）preserveSymlinks=false不等，true逐字节相等。构建启用preserveSymlinks，重建测试比对所有入口SHA256、zip.js依赖锁定。独立定点审查确认五bundle无重复模块/跨world变化，构建测试7/7通过。早期全量失败的16项为旧OAuth UI fixture未提供新增pagehide所需标准addEventListener，补真实EventTarget测试环境后19/19通过，没有给生产代码加兜底。
- npm run package:release通过；SuperX-1.1.0.zip与SuperX.zip一致，SHA256 03ef05a1825e57a63c82d4ae57ce507e084a863433b6a6905793127504e9f713。生成JS不纳入Git。CHANGELOG/ARCHITECTURE记录数据格式、内存和一致性边界。日志/tmp/superx-cache-export/{check,package,rebuild-tests,fix-tests,ui-tests,oauth-ui-tests}.log。
