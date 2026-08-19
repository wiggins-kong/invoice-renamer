# 发现与决策

## 需求
- 识别 PDF 发票内容并重命名文件
- 发票类型：中国电子发票（数电票/增值税电子发票，PDF 文字可提取，无需 OCR）
- 命名模板：用户自定义，但必须可视化拼接（界面点选字段+分隔符，不手敲 `{field}` 语法）
- LLM：程序内可选是否调用、调用哪家（DeepSeek / 任意 OpenAI 兼容端点）
- 形态：后端服务 + 网页前端，本地运行
- **v1.1 新增：必须在任意 Windows 电脑上免安装直接运行（PyInstaller 单文件 exe）**

## 研究发现
- 数电票 PDF 是电子生成的，pdfplumber 可直接提取文本层，无需 OCR
- 增值税电子发票关键字段：发票号码（20位）、开票日期、销售方名称、购买方名称、价税合计（小写/大写）、票种
- **真实专票是左右双栏版式**：「购/买/方/信/息」竖排拆字，两栏「名称」挤在同一行 → 需按页面中线裁剪分别提取左右栏文本（左=购买方，右=销售方）
- **真实 PDF 中货币符号可能提取为 `´`（尖音符）而非 `¥`** → 价税合计提取不能依赖 ¥；正确做法：锚定「小写」后紧跟的数字，或取段内带小数的金额（备注行里的大整数编号会干扰，必须排除）
- 备注行可能紧跟在价税合计下方，含大整数编号 → 抓取范围要精确
- 价税合计 = 金额 + 税额（合计行求和可作为兜底）
- DeepSeek API 是 OpenAI 兼容协议（base_url https://api.deepseek.com），可直接调 /chat/completions
- Windows 文件名不能含 `\/:*?"<>|`，字段值需清理
- **PyInstaller 打包**：单文件 exe 需把 static/ 打进包（_MEIPASS），数据文件（config.yaml/uploads/undo_log）放 exe 旁边（sys.executable 目录）；pdfminer/pypdfium2 需 --collect-all
- Hermes 配置中 DeepSeek key 加密存储于 auth.json，无法直接读取复用 → 需用户在界面粘贴

## 技术决策
| 决策 | 理由 |
|------|------|
| FastAPI + 单页前端（Web v1.x） | 初始方案，本地服务 |
| **Electron 桌面版（v2.0）** | 网页拿不到拖拽文件绝对路径；桌面端原生支持，UI 复用 HTML/Chromium 高 DPI 清晰 |
| pdfjs-dist 提取文本（v2.0） | 纯 JS 解析，无需 Python；cmaps 用自定义工厂从 fs 读（Node fetch 不支持 file://） |
| Electron 内置 Node 不支持 require(esm) | pdfjs 是 ESM → 用动态 import() |
| webUtils.getPathForFile | 拖拽文件/文件夹拿绝对路径 → 原地重命名 |
| 页面中线裁剪提取左右栏文本 | 兼容双栏版式（真实专票） |
| PyInstaller --onefile（Web 版 exe） | Web 版交付；数据目录=exe 旁 |
| 模板内部表示：有序段列表 | 前端拼接器直接生成 |
| 撤销 = rename 映射 JSON | 批量操作可一键回滚 |
| **识别进度事件流（v2.7）** | parseItems 逐文件经 `event.sender.send('parse:progress', {phase,done,total,filename})` 推送，渲染层订阅显示进度条；phase 区分本地解析/LLM 补全——LLM 模式每文件可等几十秒，静态 toast 无反馈 |
| **LLM 用量统计（v2.7.1）** | 用户真实需求是「本次到底调没调 LLM + 花了多少 token」：llm.js 从响应 usage 取 prompt/completion tokens（缺失归零），parseItems 汇总 summary（llm_calls + 输入/输出/合计），完成态/结果区/行徽标三处展示；LLM 阶段进度条黄色流动条纹动画 |
| **单文件 LLM 重识别（v2.8）** | 用户痛点：hybrid 只在关键字段缺失时调 LLM（fillMissing 填空缺）——正则解析出**非空但错误**的值时程序误判为「识别对了」，LLM 永不介入。方案：每行「🤖 LLM 重识别」按钮 → IPC `parse:one-llm` → 重新读取 PDF 文本 → **replaceAll 覆盖式**（LLM 有值即覆盖、LLM 空值保留原值）；仅更新该行（不整表重绘，避免丢失其他行手改文件名）；手动调用同样累加进 LLM 用量统计 |
| **打包版冒烟的资源路径（v2.8）** | portable exe 自解压到临时目录，asar 只含代码。测试发票需经 `extraResources` 打进 `resources/test-fixtures/` + `resources/samples/`；smoke 内 `fs.existsSync(resources 路径)` 优先、`app.getAppPath() 源目录` 兜底——开发版（npx electron .）与打包版（exe --smoke）同一套代码自检 |
| **UI 布局重构（v2.9）** | 用户需求是**布局/交互结构重排**（非换皮肤）:取消低频设置独占的左栏 → 顶栏分段控件 + ⚙ 设置弹窗;单列工作流 = 使用顺序(拖入→配模板→看结果→重命名);结果表格拿最大面积(flex:1);表格加价税合计列;附加需求 Mica 云母材质(Win11 backgroundMaterial + 渲染层半透明玻璃,旧系统降级) |
| **UI 重构的兼容性策略（v2.9）** | 大改 HTML 结构时 JS 逻辑与全部 DOM id 保留不动——高频控件(模式分段/主题图标)改为驱动**隐藏的 select#mode / select#theme**,所有依赖 `$('mode').value` 的旧逻辑与验证脚本零改动;验证脚本仅适配 settingsModal 显隐从 style.display 改 classList('show') |
| **毛玻璃背板 + 云母卡片精修（v3.0 → v3.0.1）** | 用户选定方案 A(极简玻璃延续)但「底板要毛玻璃质感」。关键认知修正：**Win11 下背景由主进程系统 Mica(`backgroundMaterial:'mica'`)主导并随桌面壁纸取色**——渲染层不该再硬编码暖色环境渐变(mockup 的效果是硬编码的,真实 app 会被系统 Mica 接管,两者天然不一致)。最终 v3.0.1 选择**跟随系统 Mica**:渲染层只留干净极淡冷色渐变,Win10 自动降级;卡片保持半透明玻璃(0.50+内顶部高光 `inset 0 1px 0 white`+saturate 1.35)分层次 |
| **顶栏不再放主题按钮（v3.0）** | 用户确认:主题按钮无法给出「跟随系统/明亮」的明确提示,且重蹈 v2.9.1 已修复的「选什么都是暗色」(隐藏 select#theme 多驱动点不同步)覆辙 → 删掉顶栏主题入口,主题选择保留在设置弹窗(themeSel:跟随系统/亮色/暗色);设置按钮放大 32→40px 加玻璃底,清晰可点触。自定义 frameless 顶栏本来就有窗口控制按钮,不再叠功能按钮 |
| **程序图标重设计（v3.1）** | 用户要重设计图标。v2.1 图标只表达「文档/表单」漏掉「识别重命名」动作。4 概念对比后选**方案 D「发票+绿色对勾徽章」**:发票主体居中(白纸+蓝抬头条+双内容行),绿勾压右上角——最简洁平衡、绿勾=「识别命名完成」一步到位,小尺寸高辨识。位置关键点:徽章必须压右上角(符合「发票右角盖戳」现实认知)且发票要放大到整体对称居中(不居中会显偏斜)。语义元素来自 icon 域(文档/标签/重命名/识别),延续深蓝 accent #1e40af 系 + 圆角扁平。生成:icon-master.svg(1024) → gen-icons.js → 全尺寸 PNG + 手写 ICO(7 尺寸) → build.icon 打包 |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 真实专票销售方/购买方识别为空 | 页面裁剪分栏提取 |
| 金额取到备注行编号 | 锚定「小写」后数字 / 只取带小数金额 |
| 金额符号是 ´ 不是 ¥ | 不依赖符号，直接抓数字 |
| 用户模板被保存到 config.yaml | 正常行为，前端预设+保存功能 |
| pdfjs Node fetch 不支持 file:// 读 cmaps | 自定义 CMapReaderFactory/StandardFontDataFactory 用 fs 读 |
| pdfjs v4 工厂接口：create() vs fetch() | 该版本直接调实例 fetch(data)，CMap 返回 {cMapData,isCompressed} |
| Electron Node20 不支持 require(esm) | pdfjs 改动态 import() |
| pdfjs 双栏版式「名称:」独立一行 | 列解析支持同行 + 下一行两种布局，并清除拆字残留（买/售） |
| npm 12 阻止 electron postinstall 脚本 | 手动 node node_modules/electron/install.js + npmmirror 镜像 |
| **防复制水印 PDF：标签字重复 3 遍**（发票号码→发发发票票票号号号码码码） | `_dedup()` 折叠连续重复字；原始文本匹配不到的字段用折叠文本再解析（原始优先，保护合法叠字） |
| **API key 明文存 config.yaml** | Web 版 `crypto_util.py` DPAPI 加密 `enc:` 密文；**Electron 版 v2.5 已解决**：`lib/secret.js` 用 Electron safeStorage（Windows=DPAPI）加密落盘，明文只在主进程内存；渲染层只给掩码；旧明文自动迁移 |

## 资源
- 数电票字段布局参考：发票号码/开票日期在票面顶部，销售方/购买方分列两侧，价税合计在右下
- DeepSeek 文档：https://api-docs.deepseek.com/ （OpenAI 兼容）

## 视觉/浏览器发现
- 无（纯后端工具，界面为自建单页）

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
