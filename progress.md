# 进度日志

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
