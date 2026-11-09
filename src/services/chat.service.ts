import type { AppConfig } from "../config";
import type { ChatRequest, ChatResponse, Intent } from "../types";
import { detectIntent } from "./guardrail.service";
import type { LlmClient } from "./llm.service";
import { mockReply } from "./mock-reply.service";
import { buildSystemPrompt } from "./prompt.service";

const HANDOFF_SUFFIX =
  "Para iniciar la reserva, enviá una foto de tu DNI. Una persona del equipo va a continuar la conversación.";

function ensureHandoff(reply: string): string {
  if (/dni|documento/i.test(reply)) {
    return reply;
  }
  return `${reply}\n\n${HANDOFF_SUFFIX}`;
}

export class ChatService {
  constructor(
    private readonly llm: LlmClient | null,
    private readonly config: AppConfig,
  ) {}

  async reply(input: ChatRequest): Promise<ChatResponse> {
    const intent = detectIntent(input.message);
    const handoff = intent === "reservation";
    const reply = await this.generate(input, intent);

    return {
      reply: handoff ? ensureHandoff(reply) : reply,
      intent,
      handoff,
      model: this.llm?.model ?? "mock",
    };
  }

  private async generate(input: ChatRequest, intent: Intent): Promise<string> {
    if (!this.llm) {
      return mockReply(input, intent, this.config.catalogUrl);
    }

    try {
      const system = buildSystemPrompt(input.apartments, this.config.catalogUrl);
      return await this.llm.complete(system, input.message, input.history);
    } catch {
      // Si el proveedor falla, el bot sigue respondiendo con el motor mock.
      return mockReply(input, intent, this.config.catalogUrl);
    }
  }
}
