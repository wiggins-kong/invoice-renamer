# 设计文档：发票识别重命名 Web 工具

日期：2026-08-15
状态：已获用户批准（唯一修改：命名模板改为可视化拼接器）

## 1. 目标
本地运行的 Web 工具：识别 PDF 发票内容，按用户可视化拼装的命名模板批量重命名。解析引擎可选纯本地正则 / 纯 LLM / 混合，LLM provider 可切换（DeepSeek 及任意 OpenAI 兼容端点）。

## 2. 架构
```
浏览器单页(static/index.html) ←HTTP/JSON→ FastAPI(app.py)
                                            ├─ config.py    配置读写(config.yaml)
                                            ├─ extractor.py pdfplumber文本提取 + 正则字段解析
                                            ├─ llm_extractor.py OpenAI兼容LLM结构化提取
                                            ├─ renamer.py   模板渲染/重命名/移动/撤销
                                            └─ uploads/     上传文件落地目录
```
运行：`python app.py`（内部起 uvicorn，默认 127.0.0.1:8600）

## 3. 核心数据模型
发票字段（字段键）：`invoice_no` 发票号码、`date` 开票日期(YYYY-MM-DD)、`seller` 销售方、`buyer` 购买方、`amount` 价税合计(数字)、`amount_cn` 金额大写、`type` 票种、`seller_tax_id` 销售方税号、`buyer_tax_id` 购买方税号。

命名模板 = 有序段列表：
```json
[{"t": "field", "v": "date"}, {"t": "sep", "v": "_"}, {"t": "field", "v": "invoice_no"}, ...]
```
前端拼接器生成此结构，后端渲染时缺失字段的 field 段自动省略（连续分隔符折叠为 1 个）。

## 4. 提取流程
1. pdfplumber 抽取全文（含页码）
2. 正则解析器（extractor.py）按票种规则提取字段：
   - 发票号码：20 位数字（`(?<!\d)(\d{20})(?!\d)`）
   - 开票日期：`2026年08月15日` 或 `2026-08-15` 等 → 归一化
   - 价税合计：`¥1,234.56` / 小写金额，取"价税合计"附近
   - 销售方/购买方：栏目标题后字段
   - 票种：标题行关键词（电子发票（普通）/（专用）/数电票…）
3. 若提取模式 = hybrid 且关键字段（invoice_no/date/amount）缺失 → 调 LLM 补全；模式 = llm → 全部字段走 LLM
4. LLM 返回严格 JSON（约束在 prompt 中），解析失败则保留正则结果

## 5. LLM 集成
- OpenAI 兼容：POST `{base_url}/chat/completions`，`model` 可配
- 默认 provider：deepseek（base_url=https://api.deepseek.com/v1，model=deepseek-chat）
- API key 存 config.yaml（本地），可在界面切换/修改
- 超时 60s，失败不阻塞批量流程（跳过 LLM，标记"提取不完整"）

## 6. 重命名
- 渲染模板 → 清理非法字符（`\/:*?"<>|`、首尾空格）→ 限制长度
- 冲突：目标名已存在 → 自动追加 `_1`、`_2`
- 输出行为：a) 原地重命名 b) 移入子文件夹（按月 `2026-08/` 或按销售方）
- 每次批量操作前写 `undo_log.json`（旧路径→新路径映射），支持一键撤销

## 7. API
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | / | 前端页面 |
| GET | /api/config | 读配置 |
| POST | /api/config | 存配置 |
| POST | /api/upload | 上传 PDF（多文件），落 uploads/，返回解析结果 |
| POST | /api/scan | 扫描服务器本地文件夹 |
| POST | /api/parse | 对文件列表解析（含 LLM 策略） |
| POST | /api/rename | 执行重命名（含手改后的文件名） |
| POST | /api/undo | 撤销最近一次批量重命名 |

## 8. 前端（static/index.html）
单页三区块：
- **配置**：提取模式（regex/llm/hybrid）、LLM provider/model/key、输出行为
- **模板拼接器**：字段下拉+添加按钮、分隔符（_ - 空格 自定义）、上移/下移/删除、预设格式、实时示例预览
- **文件与结果**：拖拽上传区 + 本地文件夹扫描输入；结果表格（原文件名 / 识别字段 / 新文件名可编辑 / 状态），批量重命名按钮 + 撤销按钮

## 9. 错误处理与安全
- 解析失败：不重命名，标红显示原因
- 非 PDF / 非发票文件：明确提示
- 重名自动加后缀，绝不覆盖已有文件
- 撤销日志防误操作
- 仅监听 127.0.0.1，不暴露公网

## 10. 测试
- reportlab 生成样例：电子普通发票、电子专用发票（含不同字段布局）
- 单元：extractor 对样例提取字段正确
- LLM 路径：mock 或真实 DeepSeek 调用一次验证 JSON 返回
- 端到端：起服务 → 上传 → 预览 → 重命名 → 撤销 → 验证文件名

## 11. 非目标（YAGNI）
- 不做 OCR（发票为文字型 PDF）
- 不做多用户/权限
- 不做发票验真
