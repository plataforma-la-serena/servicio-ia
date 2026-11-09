import type { AppConfig } from "../config";
import type { ChatTurn } from "../types";

export interface LlmClient {
  readonly model: string;
  complete(system: string, message: string, history: ChatTurn[]): Promise<string>;
}

interface NimResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class NimLlmClient implements LlmClient {
  constructor(private readonly config: AppConfig) {}

  get model(): string {
    return this.config.nimModel;
  }

  async complete(
    system: string,
    message: string,
    history: ChatTurn[],
  ): Promise<string> {
    const response = await fetch(
      `${this.config.nimBaseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.nvidiaApiKey}`,
        },
        body: JSON.stringify({
          model: this.config.nimModel,
          temperature: 0.3,
          max_tokens: 400,
          messages: [
            { role: "system", content: system },
            ...history.slice(-12),
            { role: "user", content: message },
          ],
        }),
        signal: AbortSignal.timeout(this.config.nimTimeoutMs),
      },
    );

    if (!response.ok) {
      throw new Error(`NIM respondió ${response.status}`);
    }

    const payload = (await response.json()) as NimResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("NIM devolvió una respuesta vacía");
    }
    return content;
  }
}

export function createLlmClient(config: AppConfig): LlmClient | null {
  if (!config.nvidiaApiKey) {
    return null;
  }
  return new NimLlmClient(config);
}
