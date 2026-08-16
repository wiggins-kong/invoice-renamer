# 任务计划：发票识别重命名 Web 工具

## 目标
做一个本地运行的「后端服务 + 网页前端」工具：识别 PDF 发票内容（发票号码、日期、销售方、金额等），按可视化拼接的命名模板批量重命名，支持 LLM 可选兜底；**打包为单文件 exe，任意 Windows 免安装运行**。

## 当前阶段
阶段 14（API key 加密落盘）→ complete

## 各阶段

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
- 项目目录：C:\Users\wiggins\invoice-renamer\
- 桌面发票已按用户模板原地重命名：广州晶东贸易有限公司_2026-08-13_332.00_26447000001576812494.pdf
