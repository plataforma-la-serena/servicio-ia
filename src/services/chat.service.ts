import type { AppConfig } from "../config";
import type { ChatRequest, ChatResponse, Intent } from "../types";
import { detectIntent, normalize } from "./guardrail.service";
import type { LlmClient } from "./llm.service";
import { mockReply } from "./mock-reply.service";
import { buildSystemPrompt } from "./prompt.service";

const HANDOFF_SUFFIX =
  "Para iniciar la reserva, enviá tu nombre completo. Una persona del equipo va a continuar la conversación.";

function ensureHandoff(reply: string): string {
  if (/nombre/i.test(reply)) {
    return reply;
  }
  return `${reply}\n\n${HANDOFF_SUFFIX}`;
}

function mentionedApartmentIds(
  reply: string,
  apartments: ChatRequest["apartments"],
): string[] {
  const text = normalize(reply);
  return apartments
    .filter((apartment) => text.includes(normalize(apartment.title)))
    .map((apartment) => apartment.id);
}

export class ChatService {
  constructor(
    private readonly llm: LlmClient | null,
    private readonly config: AppConfig,
  ) {}

  async reply(input: ChatRequest): Promise<ChatResponse> {
    const intent = detectIntent(input.message);
    const rawReply = await this.generate(input, intent);
    const asksForName = /\b(nombre completo|nombre y apellido|tu nombre)\b/i.test(
      rawReply,
    );
    const handoff = intent === "reservation" || asksForName;
    const reply = handoff ? ensureHandoff(rawReply) : rawReply;

    return {
      reply,
      intent,
      handoff,
      model: this.llm?.model ?? "mock",
      apartmentIds: mentionedApartmentIds(reply, input.apartments),
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
