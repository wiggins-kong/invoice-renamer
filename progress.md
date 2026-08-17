# 进度日志

## 会话：2026-08-18（v2.7：识别进度条——混合/LLM 模式逐文件进度反馈）

### 阶段 16（识别进度交互）
- **状态：** complete
- 用户反馈：混合识别/LLM 模式下没有明确的识别进度交互——`parseItems` 整批处理完才返回，LLM 模式每个文件可能等几十秒，界面只有 8 秒静态 toast，用户干等不知道进行到哪
- 执行的操作：
  1. **主进程 `parseItems(paths, cfg, onProgress)`**：循环内逐文件推送 `{ phase, done, total, filename }` 进度事件——每个文件开始解析时 `phase:'regex'`，触发 LLM 补全时 `phase:'llm'`
  2. **IPC 推送**：`progressSender(event)` 工具函数——`scan:dir`/`parse:files` handler 经 `event.sender.send('parse:progress', p)` 推送，窗口销毁后自动停止
  3. **preload** 暴露 `onParseProgress(cb)` 订阅
  4. **renderer 进度条 UI**：`#parseProgress`（发票文件卡片内、选择按钮下方）——圆角进度条（accent 渐变，完成变绿）+ 顶部一行：阶段徽标（本地解析蓝 / 🤖 LLM 补全黄）+ 当前文件名（超长省略）+ 计数 `N / 总数`（等宽数字）
  5. **交互逻辑**：`runParse`/`pickAndScan` 开头 `showProgress()` 立即显示「准备中」；事件驱动更新；完成后短暂显示「✓ 识别完成，共 N 个文件」1.6s 自动收起（绿色满条）；失败 `hideParseProgress`；新一批开始时清旧定时器防误藏
  6. 删除原 8 秒静态 toast（`parsingToast` 保留为兜底但不再使用）；`reparse` 多余 toast 移除
- 创建/修改的文件：
  - electron/main.js（parseItems + progressSender + handler）、preload.js（onParseProgress）、renderer/index.html（进度条 HTML/CSS/JS）
  - electron/scripts/verify-progress.js（新：stub IPC 模拟主进程逐文件推送 + 真实 renderer 的交互验证）
- 验证：
  - verify-progress.js 20/20：初始隐藏/解析中可见/进度推进/计数 1-2-3/阶段标签切换（regex→LLM→regex）/文件名显示/LLM 徽标/完成态（满条+绿色+文案含数量）/1.8s 自动收起；截图确认进度条在按钮下方、布局无重叠
  - extractor 回归 5/5；--smoke ALL_OK
- 遇到的问题：
  - 首次断言时序算错（IPC 事件到达比 stub 延时快）→ 把断言点对齐事件时间线：stub 间隔拉宽 120ms，t≈90/190/310/450 四点断言
  - verify 日志有 `llm:list-models No handler` 告警 → stub 补 handler；截图原想页面内拍但合成层不完整 → 改主进程 capturePage 补拍

## 会话：2026-08-17（v2.6.1：＋字段按钮竖排修复）

### 阶段 15 二次修正（按钮不收缩 + 整行装得下）
- **状态：** complete
- 用户反馈：截图显示「＋ 字段」按钮加号与文字竖排堆叠（按钮被 flex 压缩导致文字换行）
- 执行的操作：
  1. **按钮永不收缩**：`.btn` 全局加 `white-space: nowrap`；`.row-ctl.nowrap > .btn` 加 `flex-shrink: 0`——空间不足时只由字段下拉收缩吸收，按钮保持单行
  2. **整行装得下**：字段下拉 min-width 110→100；「其他」输入框 58→48；预设下拉 `width:auto` → 145px 固定（原被「日期_号码_销售方_金额」文案撑到 207px）；sep-group/preset-inline 间距 7/6→5——1080 最小宽度下 scrollWidth==clientWidth（无溢出）
- 验证：
  - verify-layout.js 新增 `addBtnOneLine`（按钮高度 <40）与 `rowOverflow`（scrollWidth vs clientWidth）断言
  - 1080：rowCtlH=36 单行、addBtnOneLine=true、rowOverflow=false、fieldSel 收缩到 100-102px
  - 1180：fieldSel 148px、无溢出
  - 截图视觉：+字段按钮横排、预设文字完整、无挤压变形
  - extractor 5/5；--smoke ALL_OK；verify-settings 19/19；verify-secret 14/14

## 会话：2026-08-16（v2.5：API key 加密落盘）

### 阶段 14（safeStorage/DPAPI 加密，明文只在主进程内存）
- **状态：** complete
- 执行的操作：
  1. **lib/secret.js**：Electron safeStorage 封装（Windows=DPAPI 账户级加密），值格式 `enc:<base64>`；`encrypt`/`decrypt`/`isEncrypted`/`mask`；decrypt 对明文透传（迁移期兜底）、密文损坏返回 null（换电脑/账户场景）；注入式设计可纯 node 单测
  2. **config.js**：saveConfig 写盘前 encryptKeys 自动加密（enc: 跳过；加密失败删该项宁不落明文）；遗留 `llm.api_key` 单字段保存时删除（keys 为准）
  3. **main.js**：config:get 返回脱敏视图（keys → {masked,has}，渲染层永无明文）；config:save 语义（''=保留原 key / '__clear__'=删除 / 其他=新值加密）；llm:list-models 未传新 key 时主进程用已保存解密 key；启动 migrateLegacyKey 把旧 api_key 单字段迁入 keys[provider] 加密
  4. **renderer**：keyStates 掩码态 + placeholder「sk-***9b4（已保存，留空则保留）」+「清除」按钮；keyDraft 草稿暂存（切换 provider 不丢输入，draft 不进配置不落盘）；输入即写 draft 并隐藏清除按钮；collectSettings 不再提交 keys map
- 创建/修改的文件：
  - electron/lib/secret.js（新）、config.js、main.js、renderer/index.html
  - electron/scripts/verify-secret.js（新：真实 safeStorage + 临时目录）、migrate-real-config.js（新：真实配置一次性加密迁移）
  - verify-settings.js（断言改为掩码语义）、README.md、findings.md
- 验证：
  - verify-secret.js 14/14：磁盘无明文/enc: 前缀/往返一致/损坏密文→null/遗留字段清除/模板不受影响/空 keys 正常
  - verify-settings.js 19/19：掩码不回填明文/清除按钮显隐/草稿提交载荷/渲染层不提交 keys map/Esc/正则模式入口可见
  - extractor 回归 5/5；--smoke ALL_OK（真实配置已是密文，主进程解密路径正常）
  - 真实配置迁移：BEFORE 明文 → AFTER enc: 密文，api_key 字段清除，解密往返 matches，模板完好
- 遇到的问题：
  - **独立 electron 脚本的 userData = %APPDATA%\Electron（默认应用名）≠ 真实 %APPDATA%\invoice-renamer** → 首次写 migrate 脚本指向了错目录（还顺带在 %APPDATA%\Electron\data 写了个默认配置垃圾文件，已删除）→ 修复：脚本顶部 `app.setName('invoice-renamer')` 与 package.json name 一致
  - mask 断言两次算错星号数（字符串长度数错）→ 用 `'*'.repeat(len)` 计算避免手数
  - 输入 key 后清除按钮不消失 → input 监听里补 applyKeyField 即时刷新按钮态

## 会话：2026-08-16（v2.4：全局设置弹窗）

### 阶段 13（LLM 配置移入二级设置界面）
- **状态：** complete
- 执行的操作：
  1. 左栏「解析与重命名设置」卡片移除 LLM 四字段（提供商/Base URL/模型/API Key）
  2. **入口设计两次修正**：初版做成左栏内「⚙ 设置…」文字按钮（regex 模式隐藏）→ 用户纠正：要的是**全局设置入口**，放**界面左下角、纯图标**、任何提取模式下都不隐藏 → 改为 `position:fixed` 左下角齿轮 SVG 图标按钮（`.settings-fab`，hover 高亮 accent + tooltip「设置」），onModeChange 不再干预显隐
  3. 新增模态设置弹窗（overlay + card）：标题「⚙ 设置」，内部用 `.modal-sec-title` 分区结构（首个区块「LLM 服务」）——用户明确要求保留可扩展设计逻辑，后续设置项按区块追加
  4. 交互逻辑：openSettings 时快照（provider/keys/model/base），取消/点遮罩/Esc 原样恢复；saveSettings 写 llmKeys + saveConfig；provider 切换时 key 按提供商隔离；fetchModels 静默刷新模型下拉
  5. 配置结构 cfg.llm 与 IPC 完全不变，纯前端改造；collectSettings/loadConfig 无需改动（DOM id 未变，只是移了位置）
- 创建/修改的文件：
  - electron/renderer/index.html（左下角齿轮按钮 + 弹窗 HTML/CSS + openSettings/closeSettings/saveSettings）
  - electron/scripts/verify-settings.js（新增：stub IPC + 真实 renderer/preload 的交互验证）
  - README.md（使用流程第 1 条更新）
- 验证：
  - scripts/verify-settings.js 17/17 通过（打开/切提供商/取消恢复/保存载荷/Esc/regex 下入口仍可见/fixed 定位断言）
  - 截图检查：左下角齿轮图标、弹窗标题/分区/四字段、遮罩压暗层级正常，无布局问题
  - extractor 回归 5/5；--smoke ALL_OK；重新打包 exe 打包版冒烟 RESULT=ALL_OK
- 遇到的问题：
  - 验证脚本 save 断言在页面里读不到主进程 lastSaved → 拆两段 executeJavaScript，主进程断言
  - 隐藏窗口截图缺弹窗：backdrop-filter 合成层在不可见窗口不渲染 → win.show() + 注入样式禁用 backdrop-filter/animation

## 会话：2026-08-16（v2.3.1：清理 Web 版文件）

### 阶段 12（项目瘦身：移除 Web 版）
- **状态：** complete
- 执行的操作：
  1. 删除全部 Web 版文件：根目录 app.py/config.py/extractor.py/llm_extractor.py/paths.py/renamer.py/crypto_util.py、requirements.txt/start.bat/InvoiceRenamer.spec、config.yaml/undo_log.json、static/、uploads/、tests/、build/、dist/、venv/、docs/、__pycache__/
  2. 测试发票迁移：uploads 的 2 张真实发票 + 水印发票 → `electron/tests/fixtures/`（水印发票改名为 水印发票_26447000001546483915.pdf），测试路径更新
  3. smoke 模式改为自包含：移除桌面 PDF 探测，改用 samples + fixtures
  4. 清理中间产物：.impeccable/review/、electron/build/concepts/、electron/dist/win-unpacked/、builder-debug.yml
  5. README 重写（移除 Web 版段落、更新字段表含 金额/税额、日期格式、项目结构）
- 验证：回归 5/5 + 冒烟 ALL_OK（3 张样例/真实发票）
- 剩余结构：electron/（完整桌面版）+ samples/ + 文档 + .git

## 会话：2026-08-16（v2.3：日期汉字格式 + Git 版本管理）

### 阶段 11（日期格式 + Git 初始化）
- **状态：** complete
- 执行的操作：
  1. **日期字段改为汉字年月日**：`2026-08-15` → `2026年08月15日`（月日补零）；extractor.js 归一化 + llm.js prompt 指示/返回兜底归一化（兼容 LLM 回 `2026-08-15`）；测试断言/demo 数据同步更新
  2. **Git 版本管理**：项目根初始化 git 仓库，.gitignore 排除 node_modules/dist/venv/uploads/config.yaml/undo_log.json；首次提交「初始存档：发票识别重命名（v2.2）」commit 5517259
- 验证：回归测试 5/5（水印发票路径已更新为真实重命名后的文件——用户使用中销售方识别正常）
- 遇到的问题：
  - main.js 两次被 asar extract-file 覆盖/误删（调试时提取到源目录）→ 从 app.asar 提取恢复 + 重建；教训：提取临时文件必须先 cd 到临时目录
  - 水印发票测试路径失效（用户已用程序重命名该文件）→ 更新路径

## 会话：2026-08-16（v2.2.1：水印发票 + LLM 补全修复）

### 阶段 10（防复制水印 PDF + hybrid 补全触发）
- **状态：** complete
- 执行的操作：
  1. **防复制水印 PDF（短语重复 3 遍）**：`名称：名称：名称：` 整短语重复 → 原 `dedup`（逐字 `(.)\1+`）无效 → 升级为短语折叠 `(.{1,12}?)\1{2,}`（只折叠 ≥3 次，保护合法叠字）；原始解析优先，仅补空值/「名称」类水印伪值
  2. **hybrid LLM 补全触发字段**：原 `KEY_FIELDS=*** date, amount]` 不含 seller/buyer → 销售方缺失不触发 LLM → 新增 `LLM_TRIGGER_FIELDS = [...KEY_FIELDS, 'seller', 'buyer']`
- 验证：回归测试 5/5（新增水印发票：销售方广州晶东贸易有限公司/购买方广州白云山明兴制药有限公司/金额 1041.59/税额 135.41 全对）
- 遇到的问题：
  - 水印是整短语重复而非逐字重复 → dedup 正则需短语级折叠
  - parseFieldsCore 未导出导致调试报错 → 补充导出

## 会话：2026-08-16（v2.2：表格优化 + 金额合计）

### 阶段 9（识别结果表格三项优化）
- **状态：** complete
- 执行的操作：
  1. **字段折叠**：表格默认只显示关键字段（发票号码/日期/价税合计），每行「⌄ 展开全部 N 项」按钮展开全部字段（含新增 金额/税额），按 src 记忆展开状态
  2. **新文件名自动换行**：input → textarea，`word-break: break-all` 折行完整显示，autoGrow 高度自适应（最多约 3 行），提交时去除换行符
  3. **金额合计**：extractor.js 新增 `amount_excl`（金额）/`tax`（税额）提取——锚定非价税合计的「合计」行（两个数字=金额+税额），缺失一侧时用 价税合计 推算；表格底部 tfoot 合计行（accent-soft 蓝底）：金额合计/税额合计/价税合计，千分位格式，未识别金额的行不计入并提示
- 创建/修改的文件：
  - electron/lib/extractor.js（新字段 + 推算）、renderer/index.html（表格改造）、main.js（demo 数据）、tests/test_extractor.js（新断言）、README 未动
- 验证：
  - 回归测试 4/4（新增金额 293.81/税额 38.19 等断言）
  - DOM 验证：合计 1,401.06+182.85=1,583.91 ✓、折叠 3→11 chip ✓、textarea 29→85px 折行 ✓
  - 截图验证：tfoot 蓝色强调带存在 ✓
- 遇到的问题：
  - verify-dom.js 无 IPC handler 导致 template 空 → 手动注入 template 后验证通过（真实环境无此问题）

## 会话：2026-08-16（v2.1：程序图标）

### 阶段 8（程序图标设计 + 打包）
- **状态：** complete
- 执行的操作：
  1. 三个概念设计（A 发票+⇄重命名徽章 / B 发票+命名标签 / C 「票」字标记），ASCII 小尺寸可读性检查（16/24/48px）
  2. 用户选定 B → 精修 icon-master.svg（135° 渐变与界面一致、标签条浮起投影、内容行节奏）
  3. sharp 生成全尺寸 PNG（16–512）+ 手写 ICO 容器（16/24/32/48/64/128/256 内嵌 PNG）
  4. 接入：package.json build.icon + main.js BrowserWindow icon；标题栏/拖拽区 🧾 emoji 换新图标 SVG
  5. 打包 portable exe；提取 exe 图标像素验证（蓝底白纸结构 ✅）；打包版 --smoke ALL_OK
- 创建/修改的文件：
  - electron/build/icon-master.svg（设计源）、icon.ico、icon-*.png、concepts/（概念稿）
  - electron/scripts/gen-icons.js、verify-exe-icon.js
  - electron/package.json、main.js、renderer/index.html、README.md
- 遇到的问题：
  - SVG 注释含 `--` 触发 XML 解析错误 → 改写注释
  - sharp 合成超画布 → 小尺寸放大倍数封顶 256

## 会话：2026-08-15

### 阶段 1-5（v1.0 完整交付）
- **状态：** complete
- v1.0 交付：样例发票解析全对、端到端 16/16、LLM 降级验证、前后端一致性验证
- 创建：config/extractor/llm_extractor/renamer/app/static、samples、tests、docs/design.md、README、start.bat

### 阶段 6（v1.1：真实发票修复 + Web 版免安装打包）
- **状态：** complete
- 执行的操作：
  1. 调查真实发票（双栏版式、金额符号 ´、备注行干扰）→ 重写 extractor.py：页面中线裁剪分栏提取 + 金额锚定「小写」
  2. 真实发票 9 字段全对；UI 模式联动隐藏 LLM；paths.py 冻结感知；/api/download + 防护
  3. PyInstaller 打包 InvoiceRenamer.exe + exe 全流程实测通过
- 创建/修改的文件：extractor.py、paths.py、app.py、config.py、renamer.py、static/index.html

### 阶段 7（v2.0：Electron 桌面版）
- **状态：** complete
- 执行的操作：
  1. 用户决策：网页拿不到拖拽绝对路径 → 桌面程序（Electron 方案）
  2. 搭建 electron/ 工程：electron 33 + pdfjs-dist（npmmirror 镜像装二进制）
  3. 移植解析到 lib/extractor.js：pdfjs 文本提取（cmaps 自定义工厂 fs 读取）+ 双栏版式 + 金额锚定「小写」
  4. 移植 renamer/config/llm 到 JS
  5. main.js 主进程 + preload 桥（webUtils.getPathForFile 拖拽绝对路径、原生选择器、IPC）
  6. renderer 界面复用暗色设计，统一"拖入→原地重命名"，删除副本概念
  7. JS 回归测试 3/3（样例×2+真实发票）；--smoke 冒烟 ALL_OK
  8. electron-builder portable 打包（禁签名绕过 winCodeSign 权限问题）；打包版 --smoke RESULT=ALL_OK
  9. 数据目录改 %APPDATA%\invoice-renamer（portable 解压到临时目录）
- 创建/修改的文件：
  - electron/ 全部（main/preload/lib×4/renderer/tests/package.json）、README、findings、task_plan
- 遇到的问题：
  - require(esm) 不支持 → 动态 import()
  - cmaps file:// 读不了 → 自定义工厂
  - winCodeSign 解压权限错误 → signAndEditExecutable:false
  - portable 解压到临时目录 → userData 存数据

## 测试结果
| 测试 | 输入 | 预期结果 | 实际结果 | 状态 |
|------|------|---------|---------|------|
| 真实发票 9 字段 | 123124.pdf（双栏专票） | 全对 | 全对（金额 332.00） | ✅ |
| 样例发票回归 | 普通/专用样例 | 仍全对 | 全对 | ✅ |
| 原地重命名 | 桌面 123124.pdf | 源文件改名 | 改名成功（用户模板） | ✅ |
| 下载接口 | uploads 文件 | 200 + 文件字节 | 200 / 2904B | ✅ |
| 路径穿越防护 | file=../../config.yaml | 404 | 404 | ✅ |
| exe 全流程 | 扫描真实发票+样例→重命名→撤销→下载→页面 | 全过 | 3/3 识别、重命名/撤销 3 个、下载 200 | ✅ |

## 错误日志
| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-08-15 | config.py RecursionError | 1 | _read_existing() |
| 2026-08-15 | samples/samples 路径 | 1 | 修正拼接 |
| 2026-08-15 | 金额取到备注行编号 | 1 | 锚定「小写」+ 带小数过滤 |
| 2026-08-15 | e2e 断言硬编码默认模板 | 1 | 只断言字段（用户模板已保存） |

## 五问重启检查
| 问题 | 答案 |
|------|------|
| 我在哪里？ | 阶段 6（v1.1 完成，exe 待实测） |
| 我要去哪里？ | exe 实测 → 交付 |
| 目标是什么？ | 发票识别重命名工具 + 免安装 exe |
| 我学到了什么？ | 见 findings.md（双栏版式/金额符号/打包路径） |
| 我做了什么？ | 见上方记录 |

---
*每个阶段完成后或遇到错误时更新此文件*
