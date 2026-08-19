# 任务计划：发票识别重命名 Web 工具

## 目标
做一个本地运行的「后端服务 + 网页前端」工具：识别 PDF 发票内容（发票号码、日期、销售方、金额等），按可视化拼接的命名模板批量重命名，支持 LLM 可选兜底；**打包为单文件 exe，任意 Windows 免安装运行**。

## 当前阶段
阶段 18（UI 布局重构：单列工作流 + Mica 云母材质）→ complete

## 各阶段

### 阶段 18（v2.9：UI 布局重构——不是换皮肤，是结构重排）
- [x] 用户澄清：重构 UI = **布局/交互结构重新设计**（红章票据风格方案被否）；要求易用、美观、加入 Mica 云母元素
- [x] 布局重构：取消 300px 左栏（低频设置不再独占空间）→ 提取模式升级**顶栏分段控件**（点击即时生效自动保存）；设置收进**顶栏 ⚙ 弹窗**（原左下角齿轮迁入顶栏）
- [x] 单列工作流 = 使用顺序：发票文件（横贯拖拽宽条 + 按钮内嵌 + 进度条）→ 命名模板（玻璃卡，可折叠）→ 识别结果（主区域最大面积，flex:1）
- [x] 表格新增「价税合计」列（右对齐等宽数字）+ 底部合计行同步
- [x] **Mica 云母材质**：main.js Win11 检测 + backgroundMaterial:'mica' + 透明底色；渲染层半透明玻璃卡片（rgba + backdrop-filter）；旧系统自动降级
- [x] 兼容性：JS 逻辑与 30 个 DOM id 全部保留（mode/theme 隐藏 select 由顶栏控件同步驱动）；验证脚本适配 settingsModal classList 语义与 settingsBtn 新位置
- [x] 验证：extractor 5/5、--smoke ALL_OK、verify-secret/settings/progress/reparse 全 ALL_PASS、verify-layout 双尺寸健康、截图确认 1080 最窄无挤压
- **状态：** complete

### 阶段 17（v2.8：单文件 LLM 重识别——正则/混合模式下逐行强制 LLM）
- [x] 用户痛点：混合模式只在关键字段缺失时调 LLM 补空缺——正则解析出**非空但错误**的值（如金额错位）时程序认为「识别对了」，LLM 永不介入
- [x] main.js：新增 `reparseOneWithLlm(src)` + IPC `parse:one-llm`——重新 parsePdf 取文本 → extractWithLlm → **replaceAll 覆盖式**（LLM 有值即覆盖正则结果；LLM 空值保留原值）→ 重算 suggested/status/errors/llm_usage；返回 { item, usage }
- [x] preload：`reparseWithLlm(src)`（剥离 Electron invoke 包装错误前缀，只留真实错误文案）
- [x] renderer：表格末列改「操作」列（竖排 🤖 LLM 重识别 + ✕ 移除）；按钮仅正则/混合模式显示（LLM 模式隐藏，onModeChange 重绘）；点击 loading 态（禁用+识别中…）→ 成功**只重建该行**（buildRow 抽取独立函数，其他行手改的新文件名不丢）→ lastSummary 累加 LLM 次数与 tokens（meta 行同步）；失败保留原字段、行内红色错误 + toast
- [x] 验证：scripts/verify-reparse.js 27/27（按钮显隐/loading/字段覆盖/LLM 徽标+token/suggested 更新/手改保留/meta 累加/失败保留原型与错误文案）+ 截图；extractor 回归 5/5；--smoke ALL_OK；打包版 RESULT=ALL_OK
- [x] 附带修复：项目迁到 E 盘后所有**硬编码 C 盘路径**改为相对路径（smoke/回归测试）；打包版冒烟改读 extraResources 打入的测试发票（test-fixtures/samples），任意机器可自检
- **状态：** complete

### 阶段 16（v2.7 / v2.7.1：识别进度条 + LLM 用量统计）
- [x] 主进程 parseItems 逐文件推送进度事件（phase=regex/llm + done/total/filename），scan:dir / parse:files 经 event.sender 转发（窗口销毁自动停止）
- [x] preload 暴露 onParseProgress 订阅
- [x] renderer 进度条 UI（发票文件卡片内）：阶段徽标（本地解析蓝 / 🤖 LLM 补全黄）+ 文件名 + N/总数 + 渐变进度条；LLM 阶段黄色流动条纹动画
- [x] **LLM 用量统计**：llm.js 提取 usage（prompt/completion tokens）；parseItems 汇总 summary（llm_calls + 输入/输出/合计 tokens）；每文件 llm_usage
- [x] **完成态明确告知是否调用 LLM**：`✓ 识别完成：共 N 个文件 · 🤖 调用 LLM M 次 · 消耗 X tokens（I 入 / O 出）`；未调用则 `· 全部本地正则，未调用 LLM`；显示 4.8s 自动收起
- [x] 结果区 meta 汇总 `共 N 个文件 · 🤖 LLM M 次 · X tokens`；表格行 🤖 LLM补全 徽标附 token 数（hover 看明细）
- [x] 验证：verify-progress.js 30/30（进度事件流/阶段切换/完成态 LLM 统计/未调用场景/自动收起）+ 截图确认；extractor 回归 5/5；--smoke ALL_OK；打包版 RESULT=ALL_OK
- **状态：** complete

### 阶段 1：需求与发现
- [x] 理解用户意图：PDF 发票识别 + 重命名
- [x] 确定约束：中国电子发票；模板可视化拼接；后端+网页；LLM 可选可换 provider
- **状态：** complete

### 阶段 2：规划与结构
- [x] 确定技术方案；用户批准设计（2026-08-15）
- [x] 创建项目结构与 docs/design.md
- **状态：** complete

### 阶段 3：实现（v1.0）
- [x] config.py / extractor.py / llm_extractor.py / renamer.py / app.py / static/index.html
- **状态：** complete

### 阶段 4：测试与验证（v1.0）
- [x] 样例发票 9 字段解析全对；端到端 16/16；LLM 降级；前后端渲染一致性
- **状态：** complete

### 阶段 5：交付（v1.0）
- [x] README.md / start.bat / .gitignore
- **状态：** complete

### 阶段 6：v1.1 真实发票修复 + 免安装打包
- [x] 修复 extractor：双栏版式（页面中线裁剪）+ 金额锚定「小写」/小数
- [x] 真实发票 123124.pdf 验证 9 字段全对
- [x] UI：模式联动、方式A/B 明确标注、下载按钮
- [x] paths.py 冻结感知重构；/api/download + 路径穿越防护
- [x] PyInstaller 打包单文件 exe + exe 实测（全流程通过）
- **状态：** complete

### 阶段 7：v2.0 Electron 桌面版
- [x] 用户决策：网页方式受限（浏览器拿不到拖拽绝对路径）→ 桌面程序
- [x] Electron 工程搭建（electron + pdfjs-dist，npmmirror 镜像装二进制）
- [x] 移植 extractor → lib/extractor.js（pdfjs 文本提取 + 正则，双栏版式，cmaps 自定义工厂）
- [x] 移植 renamer / config / llm → JS 模块
- [x] main.js 主进程 + preload 桥（webUtils.getPathForFile 拖拽绝对路径、原生选择器、IPC）
- [x] renderer 界面（复用暗色设计，统一"拖入→原地重命名"，无副本概念）
- [x] JS 回归测试 3/3 通过（样例×2 + 真实发票）；Electron --smoke 冒烟 ALL_OK
- [x] electron-builder 打包 portable exe + 打包版 --smoke 实测（RESULT=ALL_OK）
- [x] 数据目录改用 %APPDATA%\invoice-renamer（portable exe 自解压到临时目录，不能用 exe 旁）
- [x] 交付：electron/dist/发票识别重命名.exe（83MB）+ 使用说明.txt
- **状态：** complete

### 阶段 13（v2.4：全局设置弹窗——LLM 配置移入二级设置界面）
- [x] 左栏移除 LLM 四字段（提供商/Base URL/模型/API Key）
- [x] 全局设置入口：**界面左下角固定 ⚙ 齿轮图标**（fixed 定位），任何提取模式下都可见；hover 高亮 + tooltip
- [x] 新增模态设置弹窗：标题「设置」，可扩展分区结构（`.modal-sec-title`，首个区块「LLM 服务」），后续设置项按区块追加
- [x] 交互：打开时快照、取消/遮罩/Esc 原样恢复、保存写配置；provider 切换 key 按提供商隔离
- [x] 配置结构（cfg.llm）与 IPC 不变，仅前端改造；README 使用流程更新
- [x] 验证：交互验证脚本 scripts/verify-settings.js 17/17 通过 + 截图检查（齿轮图标/弹窗/遮罩层级）；extractor 回归 5/5；--smoke ALL_OK；重新打包 exe 实测通过
- **状态：** complete

### 阶段 14（v2.5：API key 加密落盘 safeStorage/DPAPI）
- [x] 新增 lib/secret.js：safeStorage 封装（encrypt/decrypt/isEncrypted/mask，注入式可单测）；值格式 enc:<base64>
- [x] config.js：saveConfig 写盘前自动加密 keys（enc: 跳过；加密失败宁删不落明文）；遗留 api_key 单字段不再落盘
- [x] main.js：config:get 脱敏视图（keys→{masked,has}，渲染层永无明文）；config:save 语义（''=保留/新值=加密/__clear__=删除）；llm:list-models 用已保存 key；启动迁移旧 api_key 单字段
- [x] renderer：keyStates 掩码展示 + placeholder「已保存，留空则保留」+「清除」按钮；keyDraft 草稿暂存（切换 provider 不丢输入）；输入即隐藏清除按钮
- [x] 验证：verify-secret.js 14/14（磁盘无明文/往返/损坏密文→null/遗留字段清除）；verify-settings.js 19/19（掩码不回填/草稿提交/不提交 keys map）；extractor 5/5；--smoke ALL_OK；真实配置迁移完成（明文→enc:，模板未破坏）
- **状态：** complete

### 阶段 15（v2.6：响应式布局——窗口缩放不换行不裁切）
- [x] 横向：命名模板「预设」在控件行内（`spacer` 推至行尾，`.preset-inline` 不拆散）——用户反馈放标题行右侧不合适，改回控件行末
- [x] 横向：分隔符组（标签+4按钮+其他输入+添加）包 `.sep-group` nowrap 整组不拆散；所有按钮 `white-space:nowrap + flex-shrink:0`（修复「＋字段」按钮被压扁竖排）
- [x] 横向：控件行 `.row-ctl.nowrap`，字段下拉收缩（180→min 100px）吸收空间；**窗口最小宽度 940→1080**；预设下拉固定 145px
- [x] 纵向：全局细滚动条（9px 圆角、主题色、悬停加深）；拖拽区紧凑化（图标 44→34、padding 34→20、标题 15→14）；chips/preview 微压缩
- [x] 验证：verify-layout.js（1180x820 / 1080x820，含 addBtnOneLine/rowOverflow 断言）——按钮单行、整行无溢出、字段下拉正常、无重叠；截图视觉确认
- **状态：** complete

## 关键问题
- [x] 发票类型？→ 中国电子发票（含真实双栏版式专票）
- [x] 命名格式？→ 可视化拼接，用户自存模板（现为 销售方_日期_金额_号码）
- [x] LLM 方案？→ 程序内可选是否调用、调用哪家
- [x] 使用方式？→ 后端服务 + 网页前端；方式A 原地重命名（推荐）/ 方式B 上传副本
- [x] 免安装？→ PyInstaller 单文件 exe

## 已做决策
| 决策 | 理由 |
|------|------|
| 双栏版式用页面中线裁剪提取 | 真实专票左购买方右销售方 |
| 金额锚定「小写」/带小数数字 | 符号可能是 ´，备注行有干扰整数 |
| PyInstaller --onefile + 数据目录=exe 旁 | 任意 Windows 双击即用，数据可持久化 |
| 方式A 扫描原地重命名为主路径 | 用户真实需求是改源文件 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| config.py 无限递归 | 1 | 拆 _read_existing() |
| 样例路径多一层 samples/samples | 1 | 修正拼接 |
| 金额取到备注行编号 | 1 | 锚定「小写」+ 只取带小数金额 |
| e2e 断言硬编码默认模板名 | 1 | 用户模板是销售方_日期_金额_号码，断言应只查字段 |

## 备注
- 项目目录：本项目根目录
- 桌面发票已按用户模板原地重命名：{销售方}_{日期}_{金额}_{发票号}（样例行，不涉真实数据）
