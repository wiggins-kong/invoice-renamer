// LLM 结构化字段提取（OpenAI 兼容协议，主进程 fetch 调用）
const { FIELD_LABELS } = require('./extractor');

const FIELD_KEYS = Object.keys(FIELD_LABELS);

const SYSTEM_PROMPT =
  '你是发票信息提取助手。用户会提供增值税发票/数电票的文本内容，' +
  '请提取字段并只返回一个 JSON 对象，不要输出任何解释或 Markdown。';

function buildUserPrompt(text) {
  return (
    `从以下发票文本中提取字段。返回严格 JSON，只能包含这些键：${FIELD_KEYS.join('、')}。\n` +
    'date 格式为 YYYY年MM月DD日（如 2026年08月15日）；amount 为数字（如 100.00）；' +
    '识别不到的字段用空字符串 ""。\n\n发票文本：\n' + text.slice(0, 8000)
  );
}

// 归一化 LLM 返回的日期：兼容 '2026-08-15' / '2026/08/15' / '2026年8月15日' → '2026年08月15日'
function normalizeDate(s) {
  const m = String(s || '').match(/(\d{4})[年\-/.年](\d{1,2})[月\-/.月](\d{1,2})/);
  if (!m) return s;
  const [, y, mo, d] = m;
  return `${y}年${String(+mo).padStart(2, '0')}月${String(+d).padStart(2, '0')}日`;
}

function parseJson(content) {
  let s = String(content).trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('LLM 返回中没有 JSON 对象');
  const data = JSON.parse(s.slice(start, end + 1));
  const out = {};
  for (const k of FIELD_KEYS) {
    const v = data[k] !== undefined ? data[k] : data[k.toLowerCase()];
    let sv = v !== null && v !== undefined ? String(v).trim() : '';
    if (k === 'date') sv = normalizeDate(sv); // 统一为 汉字年月日 格式
    out[k] = sv;
  }
  return out;
}

async function extractWithLlm(text, llmCfg) {
  const base = (llmCfg.base_url || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const apiKey = llmCfg.api_key || '';
  const model = llmCfg.model || 'deepseek-chat';
  const timeout = Math.max(10, parseInt(llmCfg.timeout, 10) || 60);
  if (!apiKey) throw new Error('未配置 LLM API key');

  const url = `${base}/chat/completions`;
  const payload = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(text) },
    ],
    temperature: 0,
  };

  const call = async (body) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout * 1000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (resp.status === 400 || resp.status === 422) return { retry: true, resp: null };
      if (!resp.ok) throw new Error(`LLM 返回 HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      return { retry: false, resp };
    } finally {
      clearTimeout(timer);
    }
  };

  // 部分服务不支持 response_format，400/422 时去掉重试
  let { retry, resp } = await call({ ...payload, response_format: { type: 'json_object' } });
  if (retry) {
    delete payload.response_format;
    ({ retry, resp } = await call(payload));
    if (retry || !resp) throw new Error('LLM 请求失败');
  }
  const data = await resp.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (content === undefined) throw new Error('LLM 响应格式异常');
  // 用量统计（OpenAI 兼容响应标准字段；缺失时归零不影响识别）
  const u = data.usage || {};
  const usage = {
    input: Number(u.prompt_tokens) || 0,
    output: Number(u.completion_tokens) || 0,
    total: Number(u.total_tokens) || (Number(u.prompt_tokens) || 0) + (Number(u.completion_tokens) || 0),
  };
  return { fields: parseJson(content), usage };
}

function fillMissing(fields, llmFields) {
  const out = { ...fields };
  for (const k of FIELD_KEYS) {
    if (!out[k] && llmFields[k]) out[k] = llmFields[k];
  }
  return out;
}

function replaceAll(fields, llmFields) {
  const out = { ...fields };
  for (const k of FIELD_KEYS) {
    if (llmFields[k]) out[k] = llmFields[k];
  }
  return out;
}

module.exports = { extractWithLlm, fillMissing, replaceAll };
