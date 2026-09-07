/**
 * gemini-interactions-client.ts
 *
 * Lớp giao tiếp API với Google Gemini AI (Open/Closed Principle & Dependency Inversion).
 * Tuân thủ interface IProductInterestLlmClient:
 * Dễ dàng mock khi viết unit test hoặc đổi provider mà không chạm vào service nghiệp vụ.
 */
import { logger } from '../../../shared/utils/logger.js';

export interface IProductInterestLlmClient {
  analyzeChat(prompt: string): Promise<string>;
}

export class GeminiInteractionsClient implements IProductInterestLlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = 'https://generativelanguage.googleapis.com',
  ) {}

  async analyzeChat(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment.');
    }

    // 1. Gọi endpoint /v1beta/interactions theo tài liệu đặc tả
    const interactionsUrl = `${this.baseUrl}/v1beta/interactions`;
    logger.info(`[GeminiClient] Calling Interactions API: model=${this.model}`);

    try {
      const res = await fetch(interactionsUrl, {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: prompt,
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (res.ok) {
        const data: any = await res.json();
        // Bóc tách text linh hoạt từ response format của Gemini interactions
        let text =
          data.output ||
          data.text ||
          data.response ||
          data.candidates?.[0]?.content?.parts?.[0]?.text;

        // Cấu trúc trả về chuẩn của Google Interactions API: steps -> model_output -> content[].text
        if (!text && Array.isArray(data.steps)) {
          const modelStep = data.steps.find((s: any) => s.type === 'model_output');
          if (modelStep && Array.isArray(modelStep.content)) {
            const textPart = modelStep.content.find((c: any) => c.text);
            if (textPart?.text) {
              text = textPart.text;
            }
          }
        }

        if (typeof text === 'string') {
          return text;
        }
        return JSON.stringify(data);
      }

      // Nếu interactions trả về 404 (endpoint chưa enable hoặc dùng API key Google AI Studio chuẩn),
      // tự động fallback sang endpoint chuẩn :generateContent để đảm bảo hệ thống luôn hoạt động mượt mà
      if (res.status === 404) {
        logger.warn(`[GeminiClient] /v1beta/interactions returned 404, falling back to :generateContent`);
        return await this.fallbackGenerateContent(prompt);
      }

      const errText = await res.text();
      throw new Error(`Gemini Interactions API error (${res.status}): ${errText}`);
    } catch (err: any) {
      // Nếu có lỗi network hoặc lỗi khác với interactions, thử fallback generateContent nếu chưa thử
      if (!err.message?.includes('generateContent')) {
        logger.warn(`[GeminiClient] Interactions failed (${err.message}), trying generateContent fallback...`);
        try {
          return await this.fallbackGenerateContent(prompt);
        } catch (fallbackErr: any) {
          throw new Error(`Gemini API failed (Interactions: ${err.message}, Fallback: ${fallbackErr.message})`);
        }
      }
      throw err;
    }
  }

  private async fallbackGenerateContent(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`generateContent error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidateText) {
      return candidateText;
    }
    throw new Error('generateContent returned empty text response');
  }
}
