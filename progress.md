# 进度日志

## 📌 当前快照（新会话 / 拷机续做从这里开始）

- **最新版本**：v3.1.6（启动提速：移除自带 16MB MsyhSb 字体，改用系统微软雅黑）
- **最近 commit**：`v3.1.6：启动提速（移除 16MB 自带字体，用系统微软雅黑）`
- **本机工作目录**：`E:\invoice-renamer`（桌面版在 `electron/`，Web 版已移除）
- **产品形态**：Electron 桌面 app（`electron/dist/发票识别重命名.exe` 打包产物已就绪），识别 PDF 发票 → 按可视化模板批量重命名
- **功能全貌（v2.x 演进）**：
  - v2.7 / v2.7.1：识别进度条 + LLM 用量统计（本次调用次数/tokens）
  - v2.8：单文件 LLM 重识别（每行「🤖 LLM 重识别」强制覆盖式）
  - v2.9：UI 布局重构（取消左栏 → 顶栏分段控件 + ⚙ 设置弹窗；单列工作流；表格加价税合计列；Mica 云母材质）
  - v2.9.1：恢复全局 MsyhSb 字体 + 移除顶栏主题按钮
  - **v3.0：毛玻璃背板 + 云母卡片精修（方案 A 落地）**——柔和环境色渐变背板（淡蓝/暖米），Win11 透出系统 Mica；卡片玻璃更通透 + 内顶部高光；删除顶栏主题按钮、主题收进设置弹窗（提防 v2.9.1 select#theme 不同步坑）；设置按钮 32→40px 放大加玻璃底
  - **v3.1.1：卡片玻璃回到 v2.9「全云母」材质**——亮色 --glass 0.70/0.88/0.55（更实）、去掉 v3.0 内顶部高光、saturate 1.35→1.3；背板保持跟随系统 Mica；布局/JS/DOM 不动
- **验证命令**（在 `electron/` 下）：
  - `node tests/test_extractor.js` → 解析回归 5/5
  - `npx electron . --smoke` → 冒烟 ALL_OK
  - `npx electron scripts/verify-settings.js` / `verify-progress` / `verify-reparse` / `verify-secret` / `verify-layout` → 交互验证
  - `npx electron-builder --win portable` → 打包 exe
- **已知注意点**：
  - 已移除自带 16MB 字体（v3.1.6）：UI 走系统微软雅黑，启动显著加快；verify-progress 的 `document.fonts.ready` 现在会立即 resolve
  - 主题下拉必须经 `applyThemeSel()` 同步隐藏 `#theme` 再应用（见阶段 18 修复）
  - 打包版冒烟用 `exe --smoke`（含 extraResources 测试发票）
  - **毛玻璃背板注意**：真实 app 的磨砂由系统 Mica 提供，渲染层只做环境色渐变打底（勿加全屏 blur 层遮挡 Mica）；离屏截图（verify-layout 的 capturePage）不渲染 backdrop-filter，看效果要用可见窗口
- 全部历史按会话记录见下方各「会话」段

---

### 阶段 19.1（v3.0.1 修正：背景跟随系统 Mica，而非固定暖色）
- **状态：** complete
- 用户反馈：打包后实际 exe 的观感与 mockup 不一致——exe 是「冷调浅灰蓝、平滑哑光、卡片实心白」，mockup 是「暖米白磨砂、半透明卡片」
- 根因定位：
  - 本机 Win11 build 26200，`isWin11=true` → 主进程 `backgroundMaterial:'mica'` 生效，系统 Mica **随桌面壁纸取色**，接管了窗口背景（用户壁纸偏冷 → 全窗冷灰蓝）
  - mockup 是我硬编码的暖色渐变，与系统无关 → 永远显暖
  - 因此「exe 与 mockup 不一致」是正常现象，不是 bug
- 用户决策：选择**跟随系统 Mica**（冷灰蓝、随壁纸变、Win11 原生质感）——正是 v3.0 落地的方向，保留
- 修正：
  1. 移除渲染层那几团暖色环境径向渐变（叠在 Mica 上会干扰取色/产生杂色）→ body 回到干净极淡冷色渐变，让系统 Mica 完全主导
  2. 卡片玻璃透明度微调更通透：root 0.58→0.50 / strong 0.82→0.78 / 2 0.44→0.36
- 验证：extractor 5/5；冒烟 ALL_OK；verify-layout 双尺寸无回归（按钮单行、无溢出、拖拽区完整）；打包版冒烟 RESULT=ALL_OK（exe 92.15 MiB）
- 教训：mockup 是「保证效果」，真实 app 是「跟随系统」——给用户看 mockup 时也要说明 Win11 上 Mica 会随壁纸取色，避免落地后观感差异引发困惑

---

## 会话：2026-08-20（v3.1.6：启动提速——移除 16MB 自带字体）

### 阶段 26（用户报告「每次打开都要 5 秒以上」；定位为 16MB 主字体；方案 B 落地）
- **状态：** complete
- 分析定位：
  - 打包版 `exe --smoke`（主进程 + portable 自解压，不建窗口）实测仅 **777ms** → 自解压/主进程不是瓶颈
  - 渲染进程唯一大型资源 = `renderer/assets/msyh-semibold.ttf`（16MB 全量微软雅黑 Semibold），且是 UI 主字体，
    排在每个 font-family 第一位；窗口 `show:false`，等 `ready-to-show` 才显示 → 首次绘制必须同步解析+栅格化该字体
  - `document.fonts.ready` 等待的正是这段；progress.md 此前已标注「16MB 全局字体启动期加载占主线程」
- 用户决策：**方案 B**——移除自带字体，改用系统微软雅黑（Windows 10/11 必带，原栈第二位本来就是它）
- 改动：
  1. `renderer/index.html`：删除 `@font-face`；body 字体栈 `'MsyhSb','Microsoft YaHei',…` 与 `--mono` 改为以 `'Microsoft YaHei'` 打头
  2. `main.js` `--screenshot`：`document.fonts.check('14px MsyhSb')` → `'14px "Microsoft YaHei"'`
  3. `scripts/verify-progress.js`：更新注释（不再有带字体；`document.fonts.ready` 现在立即 resolve，双 rAF 仍保稳定布局）
  4. 删除 `renderer/assets/msyh-semibold.ttf`（16MB）→ asar / exe 随之变小
  5. 版本 3.1.0 → 3.1.6
- 验证：extractor 回归 5/5；开发版 `--smoke` ALL_OK（GPU 崩溃日志为本沙箱无头环境的既有现象，与改动无关）
- 注意：本沙箱无头环境无法跑需开窗口的 verify-*.js（GPU 进程 0xC0000135 崩溃）——真机交互验证 + 打包版冒烟由用户侧确认

---

## 会话：2026-08-18（v3.1.0：程序图标重设计）

### 阶段 20（用户要重设计程序图标；方案 D「发票+对勾」居中版）
- **状态：** complete
- 用户反馈：之前 v2.1 图标只表达「文档/表单」，没表达「识别重命名」这个动作 → 要求重设计
- 设计流程（延续 mockup-first）：
  1. icon 域设计研究：核心语义元素 = 文档 file / 命名标签 tag / 重命名 pencil / 识别
  2. 产出 4 概念（A 发票+黄标签 / B 放大镜识别 / C 重命名转换/箭头 / D 发票+绿勾徽章），全部延续 v3.0 深蓝 accent + 圆角卡片扁平语言；概念展示页截图 + MiMo 视觉评估
  3. 视觉模型推荐 D（最简洁平衡、像成熟应用图标）+ A（语义最全面）→ 用户选 **方案 D**
  4. 用户指出 D 徽章位置「不居中」→ 出 3 位置变体（内嵌右上 / 右下角 / 居中版：发票更大+徽章压右上角），给图标加红十字几何中心准星辅助判定
  5. 视觉模型确认**居中版**最优（整体对称居中、绿勾压右上角符合「发票右角盖戳」认知）→ 用户选定居中版
- 最终落地：icon-master.svg 重画（1024 画布，比例放大 8.533×：发票 205×205–819×819 居中 rx68、抬头条 256×273+512×111 rx30、内容行 256×452/563+400×43、绿勾徽章 734,290 r145 stroke30）= 重跑 gen-icons.js 生成全尺寸 PNG + icon.ico（7 尺寸内嵌）→ 打包 v3.1.0
- 验证：gen-icons 全尺寸 + ICO(7) 成功；打包版冒烟 RESULT=ALL_OK；从 exe 提取图标（32px）用 MiMo 确认 = 蓝底+白发票+右上绿勾，非 Electron 默认图标
- 遇到的问题：
  - 视觉模型再次不稳定（opencode 把 mimo-v2.5 路由到文本 DeepSeek 报 400；xiaomi 又报无 provider）→ 查证 .env 里 **XIAOMI_API_KEY 仍是注释占位（值为 0 行）**，用户上次「设置里改好」实际是切到 opencode 但 key 没真填；反复切 provider 均不可靠。最终放弃依赖自动视觉复查最终图（几何与概念已双验证），靠提取 exe 图标 + 用户自查
  - 旧的 verify-exe-icon.js 硬编码 C 盘旧路径（项目早迁 E 盘）且在当年 v2.1 就是这个坑 → 直接删除该失效脚本（打包后图标验证是手动抽查，非 verify 套件成员）


## 会话：2026-08-18（v3.1.1：卡片玻璃回到 v2.9 全云母材质）

### 阶段 21（用户看完 v3.1 打包版后决定：放弃 v3.0「更透+内高光」卡片，回到「全云母」）
- **状态：** complete
- 背景：v3.1.0（图标重设计）刚拷回本机后，用户决定把卡片材质回退到更早的「全云母」方案；背板本来已是 v3.0.1「跟随系统 Mica」，v3.0 真正"跑偏"的只是卡片玻璃 —— 调得太透 + 加了内顶部高光
- 执行的操作（**只动外观材质，布局/JS/全部 DOM id 不动**）：
  1. 亮色主题变量回到 v2.9：`--glass 0.50→0.70` / `--glass-strong 0.78→0.88` / `--glass-2 0.36→0.55`（卡片更实、更接近纯云母光泽）；暗色主题这几项本就与 v2.9 相同，未动
  2. `.glass` 块：去掉 v3.0 加的内顶部高光 `box-shadow: ..., inset 0 1px 0 rgba(255,255,255,.55)` → 回 `var(--shadow-sm)`；`backdrop-filter blur(20px) saturate(1.35)` → `saturate(1.3)`；删掉多余的 `-webkit-backdrop-filter` 别名行（与 v2.9 完全一致）
- 验证：开发版冒烟 `SMOKE_DONE ALL_OK`（4/4）；重建 `dist/发票识别重命名.exe`（96.6MB）；win-unpacked 打包版冒烟 `RESULT=ALL_OK`；git 工作树干净（commit `cd4a68c`）
- 遇到的问题：
  - **portable exe --smoke 冒烟无回显**：portable 外壳自解压后由子进程运行应用，子进程 stdout 未继承到 shell 管道 → 冒烟输出为空。改用 `dist/win-unpacked/发票识别重命名.exe --smoke` 跑（同代码打包版）拿到 `SMOKE_DONE ALL_OK`（进度日志此前记的"exe --smoke"实际是 win-unpacked 那条，portable 单文件本身看不到冒烟回显属正常）


## 会话：2026-08-18（v3.1.2：文件按钮 emoji 换线性 SVG 图标）

### 阶段 22（用户反馈：「选择文件夹/选择文件」按钮旁的小图标与整体风格不合）
- **状态：** complete
- 用户反馈：两个文件按钮旁的小图标（原为 emoji 📁 / 📄）跟整体设计风格不合
- 根因：整体图标体系是**内联线性描边 SVG**（齿轮、最小化/最大化/关闭、logo 下载箭头，均 `stroke=currentColor` + 圆角端点），只有这两个按钮用了 emoji——风格不统一，高 DPI 下 emoji 渲染也会糊
- 执行的操作（只动这两个按钮的图标，功能/布局/JS 不动）：
  1. 📁 → `folder-open` 线性描边 SVG（open-folder 语义，对应「选择文件夹」）
  2. 📄 → 文档 `file` 线性描边 SVG（带折角 + 内容行，对应「选择文件」）
  3. 风格统一到齿轮基线：`viewBox 0 0 24 24`、`stroke-width 1.8`、`stroke=currentColor`（自动继承主按钮白字/soft 按钮蓝字）、`stroke-linecap/linejoin: round`；`width/height 16`
  4. 因 `.btn` 已是 `inline-flex + gap:5px`，去掉 emoji 后的空格，间距由 gap 接管；图标旁有可见文字 → 标 `aria-hidden="true"`（装饰性图标规范）
- 验证：开发版冒烟 `SMOKE_DONE ALL_OK`；临时可见窗口脚本 capturePage 截图 + MiMo 视觉复核——两个图标均为细线描边、与文字对齐间距合适、与齿轮统一，整界面无 emoji 图标残留；重建 exe（96.6MB）+ win-unpacked 打包版冒烟 `RESULT=ALL_OK`；git commit `64f3299`
- 注意：界面其它处的 🤖（LLM 重识别/补全徽标）与 🚀（全部重命名）是**语义状态/动作 emoji**，非装饰性 UI 图标，用户未反馈不合，保留

## 会话：2026-08-18（v3.1.3：左上角品牌 logo 更新为 v3.1 图标）

### 阶段 23（用户反馈：主界面左上角的图标还没改成最新版）
- **状态：** complete
- 用户反馈：主界面左上角（品牌 logo）的图标还没改成最新版——v3.1.0 换了 exe 图标（方案D 发票+绿勾徽章），但应用内左上角 `.tb-logo` 仍是旧版「发票+浅色内容行」SVG
- 执行的操作（只改 `.tb-logo` 内联 SVG，无其它改动）：
  - 读取 `build/icon-master.svg`（v3.1 方案D 几何），按 24 viewBox 比例缩放忠实复刻：白色发票纸居中（x4.8 y4.8 14.4×14.4 rx1.6）+ 蓝抬头条（#3B6CF0）+ 两条浅灰内容行（#C9D2E5）+ 右上角绿圆徽章（#1ED5A5 白描边 + 白色对勾 `M15.6 6.8 L16.8 8.0 L18.8 5.6`）
  - 内联 svg 尺寸 15→16px；`aria-hidden="true"` 保留（装饰性，旁有标题文字）
- 验证：开发版冒烟 `SMOKE_DONE ALL_OK`；可见窗口 capturePage 截图（左上角 300×60 裁剪）+ MiMo 视觉复核——白发票+蓝抬头条+内容行+右上绿勾徽章齐全、无裁切错位，与最新版一致；重建 exe（96.6MB）+ win-unpacked 打包版冒烟 `RESULT=ALL_OK`；git commit `2eaa525`
- 教训：v3.1.0 改 exe 图标时只动了打包用 build.icon，界面内左上角 logo（内联 SVG）没同步——**程序图标与界面内品牌 logo 是两处独立实现，换图标时都要检查同步**

## 会话：2026-08-18（v3.1.4：修复识别结果卡片布局）

### 阶段 24（用户反馈：把发票拉进去后识别结果的排版变样）
- **状态：** complete
- 用户反馈：把发票拉进去后，识别结果区域的排版变得异常（截图显示：标题在顶部，但表格在左、操作按钮在右横排，表格没铺满卡片约 3/4）
- 根因定位（**真实 Bug，非列宽问题**）：
  - CSS 里设置结果卡片布局的规则写的是 **`#resultCard`**（`flex:1; min-height:120px; display:flex; flex-direction:column; ...`），但结果卡片元素的实际 id 是 **`id="resultPanel"`**（JS `$('resultPanel')` 也用这个）→ **id 不匹配，这条规则从未生效**
  - renderTable/renderMeta 用内联 `style.display='flex'` 让卡片显示，但 flex 方向退化成**默认 row** → `card-head` / `.tbl-wrap` / `.actions` 被**横排在一条线上**（实测同 Y：head x17 / tblwrap x298 / actions x718），表格被挤到 ~420px、操作按钮被推到右侧
  - 用 DOM 测量确认（getComputedStyle = flex/row，`#resultCard` 元素不存在）
- 执行的操作：
  1. **修复布局根因**：CSS 选择器 `#resultCard` → `#resultPanel`（与 JS/元素 id 对齐），卡片恢复 `flex-direction:column` → 标题在上、表格全宽在中、底部右侧按钮栏在下
  2. **列宽再平衡**（用户上一步确认）：识别字段列 `自动(~48%) → width:34%`，价税合计 `9% → 11%`
- 验证（**客观 DOM 测量，非视觉猜测**）：
  - 1180：panelStyle=flex/column，表格铺满 1105px（原被挤到 420px），列宽 识别字段31%/价税合计10%，`overflow:false`
  - 1080：同样 column，表格 1005px，识别字段30%/价税合计10%，无溢出
  - 开发版冒烟 `SMOKE_DONE ALL_OK`；重建 exe（96.6MB）+ 打包版冒烟 `RESULT=ALL_OK`；git commit `ee33d03`
- 遇到的问题：
  - **视觉模型对该表格的判断不可靠**（一会儿说列全在、一会儿说 状态/价税合计/操作 列"没渲染"、又说原文件名 undefined）→ 是因为我注入的 demo 数据字段不全（buildRow 用 `it.filename` 显示原文件名、用 `template` 渲染新文件名，我给成了 `src`/空模板）。**结论：列宽这类布局问题要用 DOM getBoundingClientRect 客观测量，别依赖视觉模型的定性描述**
  - 结果区 `display:none` 时 `.tbl-wrap` 无布局宽度为 0 → 测量前需先注入真实数据渲染出内容

## 会话：2026-08-18（v3.1.5：设置弹窗主题统一确认/取消逻辑）

### 阶段 25（用户反馈：切换主题后界面立刻变色以为是预览，但按取消颜色没变回来）
- **状态：** complete
- 用户反馈：在设置弹窗里切换主题，界面马上变颜色（以为是预览），但点「取消」颜色没有变回来——要求统一设置这里的确认/取消逻辑
- 根因（两层）：
  1. **主题一选就写盘**：`themeSel` 的 `onchange` → `applyThemeSel()` 里既有 `applyTheme()`（实时预览）又调用 **`saveConfig()`**——所以主题一改就**已保存**到磁盘，取消自然回不来；且 `closeSettings(restore)` 取消分支**根本没恢复主题**
  2. **matchMedia 反馈环路**：预览切到深色后，document 的 `data-theme=dark` 令应用的 `color-scheme` 变 dark → `matchMedia('(prefers-color-scheme: dark)')` 变 **true**；取消回「跟随系统(system)」时 `resolveTheme('system')` 读到的 matchMedia 已被**污染成 dark** → 又被错误解析成深色（实测：取消后 #theme 已回 system、但 dataset.theme 仍是 dark）
- 执行的操作：
  1. `applyThemeSel()` **去掉 `saveConfig()`** → 主题切换只做实时预览，真正生效在点「保存」
  2. `openSettings()` 快照主题：`theme`（模式）/ `themeSel` / **`themeResolved`**（打开时已解析的实际主题）
  3. `closeSettings(true)` 取消分支：把 #theme/#themeSel 恢复成快照模式，并**直接写回 `themeResolved`**（`documentElement`/`body` 的 data-theme），而非再调 `resolveTheme()`——绕开被预览污染的错误 matchMedia；不写盘（磁盘仍是旧主题）
- 验证（真实函数驱动，main 侧计数 config:save）：
  - 初始（跟随系统）light → 切深色预览 dark、**未写盘**（saveCalls 仍 0）→ 取消回 **light**（#theme/#themeSel 也回 system）→ 再切深色点保存 → 持久化 dark（lastPayloadTheme=dark、postSave=dark）
  - 全程 config:save **仅触发 1 次**（就是那一下保存）
  - 开发版冒烟 `SMOKE_DONE ALL_OK`；重建 exe（96.6MB）+ 打包版冒烟 `RESULT=ALL_OK`；git commit `ffe3a0f`
- 教训：**Electron/Chromium 里给 `:root` 设 `data-theme` 并联动 `color-scheme` 时，`matchMedia(prefers-color-scheme)` 会跟随应用自身的 color-scheme 变化**——因此"跟随系统"在经历主题预览/切换后可能被自身污染；凡是需要"回退到之前主题"的场景，直接存/回写**已解析的实际主题**，别在会后依赖 resolveTheme+matchMedia 重新推导



## 会话：2026-08-18（v3.0/v3.0.1：毛玻璃背板 + 云母卡片精修）

### 阶段 19（用户选定方案 A 落地：毛玻璃底板 + 云母卡片 + 顶栏精修）
- **状态：** complete
- 用户流程：① 要求先看界面重构方案 → 产出 A(极简玻璃延续)/B(账本深色)/C(Bento 工作台)/D(结果前置) 四方案；② 用户选 A + C（先看 C）；③ C 的 Bento mockup 先出；④ 用户最终选定**方案 A** 并明确「底板做成毛玻璃质感，前面的卡片还是云母材质」；⑤ 初版 mockup 彩色光斑被否 → 参考用户图片改柔和毛玻璃质感；⑥ 用户提出主题按钮困惑 → 决定删主题按钮、主题进设置、放大设置按钮
- mockup-first 流程（按规格）：独立 `design-mockup-A.html/C.html`（自包含 token+demo 数据）→ 可见窗口 capturePage 截图 → MiMo 视觉自查 → 预览面板给用户 → 批准后才落地
- 执行的操作（落地到真实 renderer/index.html，JS 与 DOM id 全保留）：
  1. **毛玻璃背板**：body 背景从纯渐变改为「柔和环境色 radial-gradient（淡蓝/暖米/浅灰，大面积低饱和晕开）+ 原渐变」——Win11 透出系统 Mica，Win10 读作毛玻璃纯色
  2. **云母卡片**：`.glass` 加 `inset 0 1px 0 rgba(255,255,255,.55)` 内顶部高光 + `blur(20px) saturate(1.35)`；玻璃透明度 root 0.70→0.58 / strong 0.88→0.82 / 2 0.55→0.44
  3. **顶栏**：删除主题按钮（主题仅设置在 themeSel），设置按钮 `.icon-btn#settingsBtn` 放大 32→40px + 玻璃底 + SVG 齿轮 18px
- 验证：
  - scan-dom-ids 一致性良好（USED_NOT_DEFINED 仅 llmModel=动态创建的已知项）
  - extractor 回归 5/5；dev 冒烟 SMOKE_DONE ALL_OK
  - verify-settings/secret/progress/reparse 全 ALL_PASS；verify-layout 双尺寸指标健康（按钮单行 36px、无溢出、拖拽区可见、无横滚）
  - MiMo 视觉自查真实可见窗口：背板柔和渐变无刺眼光斑、卡片半透明显层次、设置齿轮协调、文字可读无重叠
- 遇到的问题：
  - **离屏截图看不到毛玻璃**：verify-layout 的 capturePage 在 offscreen/隐藏窗口不渲染 backdrop-filter → 误判「背板纯白」。改用**可见窗口**脚本（shot-renderer-visible.js）截图验证真实效果；这也是 v2.9 progress 里记过的 backdrop-filter 合成层问题
  - **视觉模型配置排查**：用户以为配了 mimo 视觉但失败——config auxiliary.vision.provider=xiaomi 无 XIAOMI_API_KEY 凭证（.env 注释占位）；曾切 opencode-go 但该通道只提供文本模型（mimo-v2.5 被路由到 DeepSeek-V4-Flash，400 not multimodal）；最终用户重跑 hermes setup 填好 key，xiaomi 视觉恢复可用

## 会话：2026-08-18（v2.9/2.9.1 + 清理）

### 阶段 18（用户真实需求：重构布局与交互结构，不是换皮肤；要易用 + 美观 + 云母元素）
- **状态：** complete
- 用户反馈：① 红章票据风格方案被否（要的是**布局重新设计**，非设计风格换皮）；② 明确需求——易用、美观、加入 Mica 云母材质；③ 确认新布局结构（单列工作流）和细节取舍（新增金额列、模板卡可折叠）后落地
- 布局重构（信息架构重排，按使用频率分配空间）：
  1. **取消 300px 左栏**——低频的「设置」卡片不再独占左带宽：提取模式升级为**顶栏分段控件**（混合/正则/LLM，点击即时生效并自动保存）；LLM/主题/冲突设置全部收进**顶栏 ⚙ 设置弹窗**（原左下角齿轮迁入顶栏图标）
  2. **单列自上而下 = 工作流顺序**：发票文件（横贯拖拽宽条 + 选择按钮内嵌 + 识别进度条）→ 命名模板（独立玻璃卡，可**一键折叠**，给结果让空间）→ 识别结果（**主区域占最大面积**，flex:1 自适应）
  3. **表格新增「价税合计」列**：右对齐等宽数字（账本感），底部合计行同步（金额/税额/价税合计）
  4. **Mica 云母材质**：main.js 检测 Win11（getSystemVersion build ≥22000）→ `backgroundMaterial: 'mica'` + 透明底色；渲染层卡片全部半透明玻璃（rgba + backdrop-filter blur）；Win10/更低自动降级纯色背景，功能不受影响
- 兼容性策略：**JS 逻辑与全部 30 个 DOM id 保留不动**——`mode`/`theme` 是隐藏 `<select>`（顶栏分段控件/主题图标/设置弹窗同步驱动），验证脚本仅需适配 settingsModal 从 style.display 改 classList('show') 与 settingsBtn 从 fixed 齿轮改顶栏图标
- 验证：extractor 回归 5/5、--smoke ALL_OK、verify-secret ALL_PASS、verify-settings ALL_PASS、verify-progress ALL_PASS、verify-reparse ALL_PASS、verify-layout 1180/1080 双尺寸指标健康（按钮单行 36px、无溢出、拖拽区可见、无横滚）；截图确认主界面/暗色/1080 最窄宽度无挤压重叠
- **状态：** complete

## 会话：2026-08-18（v2.8：单文件 LLM 重识别——正则/混合模式下逐行强制 LLM）

### 阶段 17（用户真实需求：有时程序觉得自己识别对了，但实际是错的）
- **状态：** complete
- 用户反馈：正则/混合模式下有时程序认为识别对了（字段非空），但实际是错的——hybrid 只在关键字段**缺失**时才调 LLM 补空缺，正则解析出「非空但错误」的值时 LLM 永不介入。需求：每个识别结果加按钮，强制重新调用 LLM 识别该文件
- 执行的操作：
  1. **main.js**：新增 `reparseOneWithLlm(src)` —— 重新 parsePdf 取文本 → `llm.extractWithLlm` → **replaceAll 覆盖式**（LLM 有值即覆盖正则结果，LLM 空值保留原值）→ 重算 suggested/status/errors/llm_usage；新增 IPC `parse:one-llm` 返回 `{ item, usage }`
  2. **preload.js**：暴露 `reparseWithLlm(src)`；捕获时剥离 Electron invoke 包装前缀，只向渲染层透传真实错误（如 `LLM API 超时`）
  3. **renderer**：表格末列「移除」改「操作」列（竖排 🤖 LLM 重识别 + ✕ 移除）；按钮仅正则/混合模式显示（LLM 模式整行已是 LLM 结果，隐藏）；点击 loading 态（禁用+「识别中…」）→ 成功**只重建该行**（把行渲染抽成 buildRow 独立函数，`replaceRow` 只换当前行——其他行手改的新文件名不丢）→ `lastSummary` 累加 LLM 次数/tokens（meta 行同步）；失败保留原字段、行内红色错误 + toast
- 创建/修改的文件：electron/main.js、preload.js、renderer/index.html、scripts/verify-reparse.js（新）、tests/test_extractor.js、README.md、findings.md、task_plan.md
- 验证：
  - verify-reparse.js 27/27（按钮数量/标签/loading 禁用+文案/字段被覆盖/LLM 徽标+tokens/suggested 更新/单行更新手改保留/meta 累加/模式切换按钮显隐/失败保留原字段+行内错误+toast）+ 截图
  - extractor 回归 5/5、--smoke ALL_OK、verify-settings 19/19、verify-secret 14/14、verify-progress 30/30、verify-layout 无回归
  - 打包版 --smoke RESULT=ALL_OK（dist 已清理 win-unpacked）
- 遇到的问题：
  - **项目迁到 E 盘：回归测试与 smoke 仍指向旧 C 盘路径** → 全部改为相对路径（__dirname / app.getAppPath 解析）；打包版 asar 只含代码，测试发票经 extraResources 打进 `resources/test-fixtures` + `resources/samples`，smoke 用 existsSync 优先 resources、源目录兜底——开发版/打包版自检同一套逻辑
  - verify-reparse 初次断言反了：手改第 1 行后重识别第 1 行会覆盖该行（预期行为）——本应验证「重识别第 2 行时第 1 行手改不丢」；失败触发改用 src 内容判断而非调用计数（计数被前序调用打乱）

## 会话：2026-08-18（v2.7.1：LLM 用量统计——明确本次是否调用 LLM + token 消耗）

### 阶段 16 修正（识别进度交互 → 用户真实需求：知道本次调没调 LLM / 花了多少 token）
- **状态：** complete
- 用户反馈：光有进度条不够——本地正则很快，进度条一闪而过；混合/LLM 模式同样有进度条但看不出「到底调没调 LLM」。真正要的是：**明确本次识别是否调用了 LLM；调了的话有识别进度；最好显示本次 token 用量**
- 执行的操作：
  1. **llm.js**：`extractWithLlm` 响应里提取 OpenAI 兼容 usage（prompt/completion/total_tokens，缺失归零），返回 `{ fields, usage }`（不再裸返回 fields）
  2. **main.js `parseItems`**：累计批量统计 `summary = { total, llm_calls, tokens: {input, output, total} }`；每文件记录 `llm_usage`；scan:dir / parse:files 返回 `{ items, summary }`
  3. **renderer `finishParseProgress(count, summary)`**：完成态文案显示——`✓ 识别完成：共 N 个文件 · 🤖 调用 LLM M 次 · 消耗 X tokens（I 入 / O 出）`；未调用时显示 `· 全部本地正则，未调用 LLM`；显示时长 1.6s → 4.8s；`lastSummary` 存入全局
  4. **renderMeta**：结果区标题旁汇总 `共 N 个文件，完整识别 X 个 · 🤖 LLM M 次 · X tokens` 或 `· 未调用 LLM`
  5. **表格行徽标**：🤖 LLM补全 徽标附 token 数（hover title 显示 输入/输出/合计明细）
  6. **LLM 阶段进度条**：黄色渐变 + 流动条纹动画（`.pp-bar.llm`），阶段文案「🤖 LLM 补全中…」——一眼可见当前文件正在等 LLM 返回
- 创建/修改的文件：electron/lib/llm.js、main.js、renderer/index.html、scripts/verify-progress.js
- 验证：
  - verify-progress.js 30/30：新增 summary-llm-calls / summary-tokens / summary-tokens-detail / meta-llm / meta-tokens / row-badge-tokens / shot-prep-msg / no-llm-msg / no-llm-meta / no-llm-bar-not-animated 断言 10 项
  - 截图确认：绿色满条 + 完成文案含 LLM 次数与 tokens + 结果区汇总 + 行徽标含 token 数 + 布局无重叠
  - extractor 回归 5/5；--smoke ALL_OK；打包版冒烟 RESULT=ALL_OK（dist 已清理 win-unpacked）
- 遇到的问题：
  - `lastSummary` 在 mergeItems（内部调 renderMeta）之后才赋值 → meta 读不到汇总 → 赋值提前到 mergeItems 前
  - 截图像素停留在解析中旧帧（capturePage 抓旧帧）→ 截图前强制注入完成态文案并等待 350ms 渲染稳定
  - `--out=C:/...` 参数被 MSYS 路径转换破坏（变成 `=C:\...`）→ 用默认输出路径即可
  - 残留 electron 进程导致后续验证卡死（4 个 electron.exe 挂起）→ powershell Stop-Process 清理

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
  2. 测试发票迁移：uploads 的 2 张样例发票 + 水印发票 → `electron/tests/fixtures/`（水印发票改名为 水印发票_26453579152834615209.pdf），测试路径更新
  3. smoke 模式改为自包含：移除桌面 PDF 探测，改用 samples + fixtures
  4. 清理中间产物：.impeccable/review/、electron/build/concepts/、electron/dist/win-unpacked/、builder-debug.yml
  5. README 重写（移除 Web 版段落、更新字段表含 金额/税额、日期格式、项目结构）
- 验证：回归 5/5 + 冒烟 ALL_OK（3 张样例/合成发票）
- 剩余结构：electron/（完整桌面版）+ samples/ + 文档 + .git

## 会话：2026-08-16（v2.3：日期汉字格式 + Git 版本管理）

### 阶段 11（日期格式 + Git 初始化）
- **状态：** complete
- 执行的操作：
  1. **日期字段改为汉字年月日**：`2026-08-15` → `2026年08月15日`（月日补零）；extractor.js 归一化 + llm.js prompt 指示/返回兜底归一化（兼容 LLM 回 `2026-08-15`）；测试断言/demo 数据同步更新
  2. **Git 版本管理**：项目根初始化 git 仓库，.gitignore 排除 node_modules/dist/venv/uploads/config.yaml/undo_log.json；首次提交「初始存档：发票识别重命名（v2.2）」commit 5517259
- 验证：回归测试 5/5（水印发票路径已更新为合成重命名后的文件——用户使用中销售方识别正常）
- 遇到的问题：
  - main.js 两次被 asar extract-file 覆盖/误删（调试时提取到源目录）→ 从 app.asar 提取恢复 + 重建；教训：提取临时文件必须先 cd 到临时目录
  - 水印发票测试路径失效（用户已用程序重命名该文件）→ 更新路径

## 会话：2026-08-16（v2.2.1：水印发票 + LLM 补全修复）

### 阶段 10（防复制水印 PDF + hybrid 补全触发）
- **状态：** complete
- 执行的操作：
  1. **防复制水印 PDF（短语重复 3 遍）**：`名称：名称：名称：` 整短语重复 → 原 `dedup`（逐字 `(.)\1+`）无效 → 升级为短语折叠 `(.{1,12}?)\1{2,}`（只折叠 ≥3 次，保护合法叠字）；原始解析优先，仅补空值/「名称」类水印伪值
  2. **hybrid LLM 补全触发字段**：原 `KEY_FIELDS=*** date, amount]` 不含 seller/buyer → 销售方缺失不触发 LLM → 新增 `LLM_TRIGGER_FIELDS = [...KEY_FIELDS, 'seller', 'buyer']`
- 验证：回归测试 5/5（新增水印发票：销售方/购买方/金额/税额全对）
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
