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

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 真实专票销售方/购买方识别为空 | 页面裁剪分栏提取 |
| 金额取到备注行编号 000013583289009015959 | 锚定「小写」后数字 / 只取带小数金额 |
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
