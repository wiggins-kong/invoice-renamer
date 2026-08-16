# 发票识别重命名（桌面版）

识别 PDF 发票内容（发票号码、日期、销售方、金额等），按**可视化拼接的命名模板**批量重命名。**桌面程序**：把文件或整个文件夹拖进窗口，直接原地重命名源文件；Chromium 渲染，高 DPI 缩放下界面依然清晰。

## 免安装使用（推荐）

**`electron\dist\发票识别重命名.exe`** 是打包好的单文件程序（含运行环境），复制到任何 64 位 Windows 10/11 电脑**双击即用**：

1. 双击 exe（首次启动等待几秒）
2. 拖入 PDF 文件或整个文件夹（也可点「选择文件夹…」/「选择文件…」）
3. 检查识别结果 → 点「🚀 全部重命名」→ 完成（支持一键撤销）
4. 关闭窗口即退出

数据文件（`config.json` 设置、`undo_log.json` 撤销记录）保存在 `%APPDATA%\invoice-renamer\data\`。

> 若杀毒软件误报，添加信任即可（Electron 打包的程序常见现象）。

## 使用流程

1. **设置**：左栏选提取模式（混合 / 仅正则 / 仅 LLM）。点「⚙ 设置…」打开设置弹窗配置 LLM——提供商（DeepSeek / OpenCode Go / 自定义）、Base URL、模型（可「↻ 刷新」自动拉取）、API Key（按提供商分别保存）。选「仅本地正则」时设置入口自动隐藏（离线不调 LLM）。保存。
2. **命名模板**：点选「添加字段」「分隔符」拼装格式，可排序/删除，有预设，实时预览（勾选「演示缺失字段」看自动跳过效果）。模板自动保存。
3. **处理文件**：拖文件/文件夹进窗口，或点「选择文件夹…」「选择文件…」——**全部直接原地重命名源文件**，不产生副本。
4. **重命名**：表格检查识别结果（字段一目了然，新文件名可手改）→「全部重命名」→「撤销上次重命名」可回滚。

## 支持的字段

| 字段 | 说明 |
|------|------|
| invoice_no | 发票号码 |
| date | 开票日期（YYYY年MM月DD日） |
| seller / buyer | 销售方 / 购买方名称 |
| amount_excl / tax | 金额（不含税）/ 税额 |
| amount / amount_cn | 价税合计（小写 / 大写） |
| type | 票种（电子普通/专用发票、数电票、铁路客票等） |
| seller_tax_id / buyer_tax_id | 销售方 / 购买方税号 |

模板中缺失的字段自动跳过，连续分隔符自动折叠。结果表格底部自动汇总：金额合计 / 税额合计 / 价税合计。

## 版式兼容

- ✅ 数电票（单栏版式）
- ✅ 增值税电子发票（单栏版式）
- ✅ 增值税专用发票（左右双栏版式，页面中线裁剪分栏提取）
- ✅ 防复制水印 PDF（标签字/短语重复 3 遍，自动折叠去重）
- ✅ 金额提取不依赖 ¥ 符号（真实 PDF 可能提取为 ´），备注行编号不干扰

## 提取模式

| 模式 | 行为 |
|------|------|
| 混合 hybrid（默认） | 本地正则优先，关键字段（号码/日期/金额/销售方/购买方）缺失时调 LLM 补全 |
| 仅正则 regex | 纯本地离线，不调任何 API，界面隐藏 LLM 配置 |
| 仅 LLM llm | 所有字段走大模型（需 API Key） |

LLM 提供商：**DeepSeek**（默认）、**OpenCode Go**（Base URL `https://opencode.ai/zen/go/v1`，用 OpenCode Zen 订阅的 API 密钥）、**自定义**（任意 OpenAI 兼容服务）。模型下拉会自动从 `{Base URL}/models` 抓取，也可点「↻ 刷新模型」手动拉取。

## 开发与重新打包

```bash
cd electron
npm install                    # 安装依赖（electron 二进制走 npmmirror 镜像更快）
node scripts/gen-icons.js      # 从 build/icon-master.svg 重新生成全尺寸 PNG + ICO
node tests/test_extractor.js   # 解析回归测试（样例 + 真实发票）
npx electron . --smoke         # 主进程冒烟自检
npx electron-builder --win portable   # 打包 → dist/发票识别重命名.exe
```

程序图标：`electron/build/icon-master.svg`（设计源）→ `scripts/gen-icons.js` 生成 `icon.ico`（16–256px 多尺寸）及各尺寸 PNG。打包配置 `build.icon` 指向 `build/icon.ico`。

## 安全与可靠性

- 解析失败的文件不会被重命名，表格标红显示原因
- 绝不覆盖已有文件（冲突自动加 `_1`、`_2`）
- 每次批量重命名写入 `undo_log.json`，一键撤销
- 完全本地运行，发票数据不出本机（LLM 模式除外，需自行配置 API Key）

## 项目结构

```
invoice-renamer/
├── electron/                 # 桌面版（Electron）
│   ├── main.js               # 主进程：窗口 + IPC + 文件/解析/重命名
│   ├── preload.js            # contextBridge 安全桥（含拖拽绝对路径）
│   ├── lib/extractor.js      # pdfjs 文本提取 + 正则解析（双栏版式/水印去重）
│   ├── lib/renamer.js        # 模板渲染 + 重命名 + 撤销
│   ├── lib/config.js         # 配置读写
│   ├── lib/llm.js            # LLM 提取（OpenAI 兼容）
│   ├── renderer/index.html   # 界面（明亮双栏工作台，三主题）
│   ├── build/                # 图标设计源 + 生成产物
│   ├── scripts/              # gen-icons.js 等工具
│   ├── tests/                # 回归测试（fixtures/ 含测试发票）
│   └── dist/发票识别重命名.exe  # 打包产物（交付物）
├── samples/                  # 样例发票（测试用）
├── PRODUCT.md / README.md    # 产品与使用文档
└── progress.md / findings.md / task_plan.md   # 开发记录
```
