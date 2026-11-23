import type { AppConfig } from "../config";
import type { ChatRequest, ChatResponse, Intent } from "../types";
import { detectIntent, normalize } from "./guardrail.service";
import type { LlmClient } from "./llm.service";
import { mockReply } from "./mock-reply.service";
import { buildSystemPrompt } from "./prompt.service";

const CATALOG_REQUEST =
  /(departamento|depto|precio|valor|cuanto sale|reserv|disponib|catalogo|foto|alquil|arriend|enlace|link|whatsapp)/;

const PITCH =
  /(departamento|depto|catalogo|reserv|precio|whatsapp|enlace|carlo magno|te interesa|si queres ver|mira este)/;

const CITY_FALLBACK =
  "Contame qué querés saber de La Serena y te ayudo con gusto: playas, centro histórico, faro o paseos.";
const GENERIC_FALLBACK = "Contame un poco más y te ayudo con gusto.";

function isCatalogRequest(message: string): boolean {
  return CATALOG_REQUEST.test(normalize(message));
}

function isCityQuestion(message: string): boolean {
  return !isCatalogRequest(message) && normalize(message).includes("la serena");
}

const NAME_REQUEST_SUFFIX =
  "Para iniciar la reserva, enviá tu nombre completo. Una persona del equipo va a continuar la conversación.";

function extractCustomerName(
  message: string,
  history: ChatRequest["history"],
): string | null {
  const askedForName = history
    .slice(-6)
    .some(
      (turn) =>
        turn.role === "assistant" &&
        /(nombre|llam[aá]s|llam[ae]|c[oó]mo te llamas)/i.test(turn.content),
    );

  const text = message.trim();
  const explicit = text.match(
    /(?:me llamo|mi nombre es)\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü' -]{2,60})/i,
  );

  let candidate = explicit ? explicit[1] : askedForName ? text : null;
  if (!candidate) {
    return null;
  }

  candidate = candidate
    .replace(/[.,;!?].*$/s, "")
    .replace(/^(soy|me llamo|mi nombre es|es)\s+/i, "")
    .split(
      /\s+(?:y|e)\s+|\b(?:quiero|reserv\w*|departamento|depto|para|por|precio|disponib\w*)\b/i,
    )[0]
    .replace(/\s+/g, " ")
    .trim();

  if (candidate.length < 2 || candidate.length > 60) {
    return null;
  }
  if (!/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü' -]+$/.test(candidate)) {
    return null;
  }

  const words = candidate.split(" ");
  if (words.length > 4) {
    return null;
  }

  const normalized = normalize(candidate);
  if (
    /(\bhola\b|\bgracias\b|\bbuenas\b|\bdale\b|\bok\b|\bsi\b|\bno\b|\bdepartamento\b|\bprecio\b|\breserv\w*\b|\bquiero\b|\bcuanto\b|\bdonde\b|\bque\b|\bchile\b|\bargentina\b|\bserena\b)/.test(
      normalized,
    )
  ) {
    return null;
  }

  return candidate
    .replace(/\p{L}[\p{L}'’-]*/gu, (word) => {
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .trim();
}

function removePrematureHandoff(reply: string): string {
  return reply
    .split(/(?<=[.!?])\s+/)
    .filter(
      (sentence) =>
        !/(una persona del equipo|te paso con|te derivo|derivamos)/.test(
          normalize(sentence),
        ),
    )
    .join(" ")
    .trim();
}

function handoffReply(_reply: string, name: string): string {
  return `¡Perfecto, ${name}! Una persona del equipo va a continuar la conversación para coordinar la reserva.`;
}

/**
 * Para consultas que no son del catálogo, quita enlaces y frases que empujan
 * a ver departamentos o reservar. Así una pregunta sobre la ciudad recibe una
 * respuesta sobre la ciudad, sin publicidad.
 */
function stripPitch(reply: string): string {
  const withoutLinks = reply.replace(/https?:\/\/\S+/g, " ");
  const lines = withoutLinks.split(/\n+/);

  const kept = lines
    .map((line) => {
      const sentences = line.split(/(?<=[.!?])\s+/);
      return sentences
        .filter(
          (sentence) =>
            !PITCH.test(normalize(sentence)) && !sentence.includes("$"),
        )
        .join(" ")
        .trim();
    })
    .filter(Boolean);

  return kept
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
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
    const customerNameFromMessage = extractCustomerName(
      input.message,
      input.history,
    );
    let customerName = customerNameFromMessage;

    if (!customerName) {
      const fromReply = rawReply.match(
        /(?:gracias|hola)[, ]+([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+)/,
      );
      if (fromReply) {
        customerName = fromReply[1];
      }
    }

    const wantsReservation =
      intent === "reservation" || asksForName || customerName !== null;
    const handoff = customerName !== null && wantsReservation;

    let withHandoff = rawReply;

    if (handoff && customerName) {
      withHandoff = handoffReply(rawReply, customerName);
    } else if (wantsReservation) {
      withHandoff = asksForName
        ? removePrematureHandoff(rawReply)
        : `${removePrematureHandoff(rawReply)}\n\n${NAME_REQUEST_SUFFIX}`;
    }

    const reply =
      isCatalogRequest(input.message) || wantsReservation
        ? withHandoff
        : stripPitch(withHandoff) ||
          (isCityQuestion(input.message) ? CITY_FALLBACK : GENERIC_FALLBACK);

    return {
      reply,
      intent,
      handoff,
      model: this.llm?.model ?? "mock",
      apartmentIds: mentionedApartmentIds(reply, input.apartments),
      customerName,
      wantsReservation,
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
