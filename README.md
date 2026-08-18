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

1. **设置**：顶栏点模式分段控件（混合 / 正则 / LLM）即时生效；点**顶栏右侧 ⚙ 图标**打开设置弹窗配置 LLM——提供商（DeepSeek / OpenCode Go / 自定义）、Base URL、模型（可「↻ 刷新」自动拉取）、API Key（按提供商分别保存）。选「仅本地正则」时解析完全不调 LLM（设置弹窗里的 LLM 配置仅作备用）。保存。
2. **命名模板**：点选「添加字段」「分隔符」拼装格式，可排序/删除，有预设，实时预览（勾选「演示缺失字段」看自动跳过效果）。模板自动保存。模板卡可一键折叠，给识别结果让出空间。
3. **处理文件**：拖文件/文件夹进窗口，或点「选择文件夹…」「选择文件…」——**全部直接原地重命名源文件**，不产生副本。识别期间「发票文件」卡片内显示进度条：当前文件名 + `N / 总数` + 阶段徽标（本地解析 / 🤖 LLM 补全）。**完成后明确告知本次是否调用 LLM**：调用了会显示 `🤖 调用 LLM M 次 · 消耗 X tokens（I 入 / O 出）`，纯本地正则则显示 `全部本地正则，未调用 LLM`。识别结果区标题旁和表格行徽标（🤖 LLM补全，可悬停看明细）同样显示该统计。**对某个文件的结果不放心？点该行「🤖 LLM 重识别」按钮**——强制调用 LLM 重新识别这一份并覆盖字段（正则/混合模式下每行都有，LLM 模式整行已是 LLM 结果故不显示；只更新该行，其他行手改的新文件名不受影响）。
4. **重命名**：表格检查识别结果（字段一目了然，新文件名可手改，价税合计列右对齐等宽）→「全部重命名」→「撤销上次重命名」可回滚。

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

**拷机 / 新会话续做**：把整个 `invoice-renamer/` 文件夹拷到新机器（含源码、`electron/tests/fixtures/`、`samples/`；`node_modules/`、`dist/` 无需携带，重新 `npm install` + 打包即可）。续做前先读 `progress.md` 顶部的「📌 当前快照」——那里有当前版本、验证命令、已知注意点，比通读全部历史更快接上。开发验证脚本在 `electron/scripts/verify-*.js`。

程序图标：`electron/build/icon-master.svg`（设计源，v3.1 方案 D「发票+绿勾徽章」）→ `scripts/gen-icons.js` 生成 `icon.ico`（16–256px 多尺寸内嵌）及各尺寸 PNG（16/24/32/48/64/128/256 + 512 源图）。打包配置 `build.icon` 指向 `build/icon.ico`。

## 安全与可靠性

- 解析失败的文件不会被重命名，表格标红显示原因
- 绝不覆盖已有文件（冲突自动加 `_1`、`_2`）
- 每次批量重命名写入 `undo_log.json`，一键撤销
- 完全本地运行，发票数据不出本机（LLM 模式除外，需自行配置 API Key）
- **API Key 加密落盘**：用 Windows 系统加密（Electron safeStorage，底层 DPAPI 账户级加密）存为 `enc:` 密文，磁盘不存明文；即使把 `%APPDATA%\invoice-renamer` 整个拷到别的电脑/账户也解不开，需重新输入。界面只显示掩码（如 `sk-***9b4`），输入框留空=保留原 Key，点「清除」=删除

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
│   ├── renderer/index.html   # 界面（单列工作流 + Mica 云母玻璃材质，三主题）
│   ├── build/                # 图标设计源 + 生成产物
│   ├── scripts/              # gen-icons.js 等工具
│   ├── tests/                # 回归测试（fixtures/ 含测试发票）
│   └── dist/发票识别重命名.exe  # 打包产物（交付物）
├── samples/                  # 样例发票（测试用）
├── PRODUCT.md / README.md    # 产品与使用文档
└── progress.md / findings.md / task_plan.md   # 开发记录
```
