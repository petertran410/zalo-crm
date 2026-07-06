/**
 * Shared handler for OpenAI-compatible chat/completions API.
 * Works with: OpenAI, Qwen (dashscope compat mode), Kimi (Moonshot).
 */
export async function generateWithOpenaiCompat(
  url: string,
  apiKey: string,
  model: string,
  system: string,
  prompt: string,
  maxTokens = 600,
  // OpenAI thế hệ mới (gpt-5.x / o-series) bỏ `max_tokens`, đòi `max_completion_tokens`.
  // Qwen/Kimi (compat mode cũ) vẫn dùng `max_tokens` → cho phép caller chọn tên tham số.
  tokenParam: 'max_tokens' | 'max_completion_tokens' = 'max_tokens',
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        // stream:false → ép trả JSON một lần. Một số gateway (vd Ramclouds) mặc định
        // stream SSE (`data: {...}`) khiến response.json() parse fail nếu không tắt.
        stream: false,
        [tokenParam]: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const status = response.status;
      throw new Error(`OpenAI-compat request failed with status ${status}`);
    }

    const rawBody = await response.text();
    const text = extractContent(rawBody);
    if (!text) throw new Error('OpenAI-compat returned empty content');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Trích content từ body OpenAI-compat. Hỗ trợ 2 dạng:
 *   1. JSON một lần: { choices:[{ message:{ content } }] }
 *   2. SSE stream (data: {...}\n\n …): vài gateway (Ramclouds) stream kể cả khi
 *      stream:false → ghép các delta.content lại.
 */
function extractContent(body: string): string {
  const trimmed = body.trim();
  // Dạng JSON thường.
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed) as {
        choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
      };
      const msg = data.choices?.[0]?.message;
      // content chuẩn; nếu rỗng (reasoning model chưa sinh content) → fallback reasoning.
      return (msg?.content || msg?.reasoning || '').trim();
    } catch {
      /* rơi xuống parse SSE bên dưới */
    }
  }
  // Dạng SSE: nhiều dòng "data: {json}", kết thúc bằng "data: [DONE]".
  let acc = '';
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l.startsWith('data:')) continue;
    const payload = l.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const chunk = JSON.parse(payload) as {
        choices?: Array<{
          delta?: { content?: string | null; reasoning?: string | null };
          message?: { content?: string | null; reasoning?: string | null };
        }>;
      };
      const c = chunk.choices?.[0];
      const piece = c?.delta?.content ?? c?.message?.content ?? c?.delta?.reasoning ?? c?.message?.reasoning ?? '';
      acc += piece;
    } catch {
      /* bỏ qua dòng lỗi */
    }
  }
  return acc.trim();
}
