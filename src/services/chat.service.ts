import type { AppConfig } from "../config";
import type { ChatRequest, ChatResponse, Intent } from "../types";
import { detectIntent, normalize } from "./guardrail.service";
import type { LlmClient } from "./llm.service";
import { mockReply } from "./mock-reply.service";
import { buildSystemPrompt } from "./prompt.service";

const CATALOG_REQUEST =
  /(departamento|depto|precio|valor|cuanto sale|reserv|disponib|catalogo|foto|alquil|arriend|enlace|link|whatsapp)/;

const APARTMENT_REQUEST =
  /(departamento|depto|carlo|precio|valor|cuanto sale|capacidad|personas|dormitorio|bano|cocina|balcon|estacionamiento|wifi|wi-fi|lavarropa|quincho|seguridad|mascota|pileta|aire|sabana|toalla|limpieza|deposito|cancel|descuento|minimo|check|fumar|ascensor|silla|vista|ropa de cama|secador|cochera|portero|reserv|disponib|catalogo|foto)/;

const PITCH =
  /(departamento|depto|catalogo|reserv|precio|whatsapp|enlace|carlo magno|te interesa|si queres ver|mira este|detalles|fotos|(m[aá]s|ver|todas las|las) opciones|ver m[aá]s|escribime|contactame|consultame|nuestro equipo|nuestra web|nuestra p[aá]gina)/;

const CITY_FALLBACK =
  "Contame qué querés saber de La Serena y te ayudo con gusto: playas, centro histórico, faro o paseos.";
const GENERIC_FALLBACK = "Contame un poco más y te ayudo con gusto.";

const CITY_TOPIC =
  /(cafe|restaurant|centro historico|centro de la ciudad|ciudad|playa|museo|supermercado|\bmercado|feria|faro|transporte|micro|colectivo|tour|paseo|valle|coquimbo|elqui|isla damas|observatorio|artesani)/;

function isCatalogRequest(message: string): boolean {
  return CATALOG_REQUEST.test(normalize(message));
}

function isApartmentRequest(message: string): boolean {
  return APARTMENT_REQUEST.test(normalize(message));
}

function isCityQuestion(message: string): boolean {
  const text = normalize(message);
  return CITY_TOPIC.test(text) && !isCatalogRequest(message);
}

const HUMAN_REQUEST = new RegExp(
  [
    "(hablar|comunicar(me)?|pas(ar|ame)|deriv\\w*|transferir(me)?)\\s+(con|a)\\s+(alguien|una persona|un humano|un asesor|un agente|una asesora|una agente|una persona real|el equipo)",
    "(quiero|necesito|prefiero)\\s+(una persona|un humano|un asesor|un agente|hablar con alguien|atencion humana)",
    "(me )?atienda\\s+(una|un)\\s+(persona|humano|asesor|agente)",
    "(atencion|soporte|ayuda) humana",
  ].join("|"),
  "i",
);

const HUMAN_CONFIRMATION =
  /(le avise a una persona|aviso a una persona|avisar a una persona|persona del equipo)/;

const AFFIRMATIVE =
  /^(si|dale|ok|okay|de una|por favor|confirmo|claro|listo|obvio|perfecto|hacelo|hacelo ya)\b/;

const HUMAN_REQUEST_REPLY =
  "Claro. ¿Querés que le avise a una persona del equipo para que te escriba por acá?";

const HUMAN_CONFIRMED_REPLY =
  "Listo, ya avisé a una persona del equipo. En breve te escriben por acá 😊";

function isHumanRequest(message: string): boolean {
  return HUMAN_REQUEST.test(normalize(message));
}

function isHumanConfirmation(
  message: string,
  history: ChatRequest["history"],
): boolean {
  const lastAssistant = [...history]
    .reverse()
    .find((turn) => turn.role === "assistant");

  if (!lastAssistant || !HUMAN_CONFIRMATION.test(normalize(lastAssistant.content))) {
    return false;
  }

  return AFFIRMATIVE.test(normalize(message).trim());
}

const CATALOG_PHRASE =
  "Acá te dejo el catálogo para que veas los departamentos y su disponibilidad";

function catalogLine(originalReply: string, catalogUrl: string): string {
  const hasEmoji = /\p{Extended_Pictographic}/u.test(originalReply);
  return `${CATALOG_PHRASE}: ${catalogUrl}${hasEmoji ? "" : " 😊"}`;
}

/**
 * Deja el enlace del catálogo siempre presentado con la misma frase.
 * - Si la respuesta ya lo presenta, no la toca.
 * - Si trae el link suelto, lo reemplaza por la presentación completa.
 * - Si `addIfMissing`, agrega la presentación cuando no hay ningún enlace.
 */
const CATALOG_CTA =
  /(pod[eé]s|puedes|mir[aá]|revis[aá]|visit[aá]|conoc[eé]|entr[aá]|te dejo|te comparto|encontr[aá]s)\s+(ver\s+|mirar\s+|revisar\s+|visitar\s+|conocer\s+|entrar\s+)?(todos\s+)?(los\s+)?(detalles|departamentos|apartamentos|opciones|precios|fotos|informaci[oó]n|catalogo|web|p[aá]gina|enlace|link)/;

function isCatalogCta(sentence: string): boolean {
  const norm = normalize(sentence);

  if (/catalogo/.test(norm)) {
    return true;
  }

  if (CATALOG_CTA.test(norm)) {
    return true;
  }

  const words = norm.split(/\s+/).filter(Boolean);

  if (
    words.length <= 12 &&
    /(detalles|opciones|informacion|fotos|precios|departamentos|apartamentos)\s+(en|aca|aqui)?\s*[:.]?$/.test(
      norm,
    )
  ) {
    return true;
  }

  return words.length <= 8 && /(^|\s)(en|aca|aqui)\s*[:.]?$/.test(norm);
}

function removeCatalogMentions(text: string): string {
  return text
    .split(/\n+/)
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !isCatalogCta(sentence))
        .join(" ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function withCatalogLink(
  reply: string,
  catalogUrl: string,
  addIfMissing: boolean,
): string {
  const trimmed = reply.trim();
  const hasUrl = /https?:\/\//.test(trimmed);
  const mentionsCatalog = /catalogo/.test(normalize(trimmed));

  if (!hasUrl && !mentionsCatalog && !addIfMissing) {
    return trimmed;
  }

  if (mentionsCatalog) {
    const withoutStandard = trimmed.split(CATALOG_PHRASE).join(" ");
    const remainingHasCatalog = /catalogo/.test(normalize(withoutStandard));
    const remainingHasCta = withoutStandard
      .split(/\n+/)
      .some((line) =>
        line
          .split(/(?<=[.!?])\s+/)
          .some((sentence) => sentence.trim().length > 0 && isCatalogCta(sentence)),
      );

    // Solo está la presentación estándar: no hace falta reescribir nada.
    if (!remainingHasCatalog && !remainingHasCta) {
      return trimmed;
    }
  }

  // Se quita cualquier presentación previa del catálogo y se deja una sola.
  const withoutCatalog = removeCatalogMentions(trimmed);
  const base = withoutCatalog
    .split(/\n+/)
    .map((line) => line.replace(/https?:\/\/\S+/g, "").trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return base
    ? `${base}\n\n${catalogLine(trimmed, catalogUrl)}`
    : catalogLine(trimmed, catalogUrl);
}

const GREETING_PREFIX =
  /^(?:¡)?(?:hola|holis|holi|buenas(?:\s+(?:tardes|noches|d[ií]as))?|buen d[ií]a|buenos d[ií]as|qu[eé] tal|hey)\b(?:\s+(?:de nuevo|nuevamente))?/i;

/**
 * Quita el saludo inicial cuando la conversación ya venía hablando. El bot no
 * debe volver a saludar en cada respuesta.
 */
function stripLeadingGreeting(reply: string): string {
  const lines = reply.split("\n");
  const firstIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstIndex < 0) {
    return reply;
  }

  const line = lines[firstIndex];
  const sentences = line.split(/(?<=[.!?])\s+/);
  const first = sentences[0] ?? "";
  const normalizedFirst = normalize(first)
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const greetingOnly =
    /^(hola|holis|holi|buenas|buenas tardes|buenas noches|buen dia|buenos dias|que tal|hey)( de nuevo| nuevamente)?( que gusto saludarte| como estas| como andas| todo bien| bienvenido| bienvenida)?$/.test(
      normalizedFirst,
    );

  if (greetingOnly) {
    sentences.shift();
  } else {
    sentences[0] = first.replace(GREETING_PREFIX, "").trim();
  }

  lines[firstIndex] = sentences
    .filter((sentence) => sentence.trim().length > 0)
    .join(" ")
    .trim();

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizePrices(reply: string): string {
  return reply
    .replace(/(?<!\$)(\b\d{1,3}(?:\.\d{3})+)\s*CLP\b/g, "$$$1 CLP")
    .replace(/\bCLP\s*(\d{1,3}(?:\.\d{3})+)/g, "CLP $$$1");
}

const NAME_REQUEST_SUFFIX =
  "Para iniciar la reserva, enviame tu nombre completo 😊 Una persona del equipo va a continuar la conversación.";

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

function extractPendingName(
  history: ChatRequest["history"],
): string | null {
  const lastAssistant = [...history]
    .reverse()
    .find((turn) => turn.role === "assistant");
  const match = lastAssistant?.content.match(/Escuché «([^»]+)»/);
  return match?.[1]?.trim() || null;
}

function extractCorrectionName(message: string): string | null {
  const text = message.trim();
  let candidate: string | null = null;

  const explicit = text.match(
    /(?:no,?\s*)?(?:es|soy|me llamo|mi nombre es)\s+([A-Za-zÁÉÍÓÚÑÜáéíóúñü' -]{2,60})/i,
  );

  if (explicit) {
    candidate = explicit[1];
  } else {
    const rest = text.replace(/^no[,.;\s]+/i, "").trim();
    if (
      rest &&
      rest.split(/\s+/).length <= 4 &&
      /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü' -]+$/.test(rest)
    ) {
      candidate = rest;
    }
  }

  if (!candidate) {
    return null;
  }

  candidate = candidate
    .replace(/[.,;!?].*$/s, "")
    .replace(/\s+/g, " ")
    .trim();

  if (candidate.length < 2 || candidate.length > 60) {
    return null;
  }
  if (!/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü' -]+$/.test(candidate)) {
    return null;
  }
  if (candidate.split(" ").length > 4) {
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
    .map((line) =>
      line
        .replace(/\s+(?:en|aqu[ií]|ac[aá]|por|desde)\s*[:.]?\s*$/i, "")
        .replace(/[\p{Extended_Pictographic}\uFE0F\s]+$/gu, "")
        .replace(/[ \t]{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean);

  const text = kept
    .join("\n")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();

  // Si el filtro dejó solo un fragmento, es preferible no responder eso.
  return text.length >= 25 && /[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{3,}/.test(text)
    ? text
    : "";
}

const FEATURE_QUESTIONS: Array<{
  ask: RegExp;
  feature: RegExp;
  label: string;
}> = [
  {
    ask: /(estacionamiento|cochera|garage)/,
    feature: /(estacionamiento|cochera|garage)/,
    label: "estacionamiento",
  },
  { ask: /(wifi|wi-fi|internet)/, feature: /(wi-?fi|internet)/, label: "Wi-Fi" },
  { ask: /(lavarropas?|lavadora)/, feature: /lavarrop/, label: "lavarropa" },
  {
    ask: /(quincho|parrilla|asador)/,
    feature: /(quincho|parrilla|asador)/,
    label: "quincho",
  },
  {
    ask: /(seguridad|seguro|vigilancia|portero|guardia)/,
    feature: /(seguridad|vigilancia|portero|guardia)/,
    label: "seguridad",
  },
  {
    ask: /(juegos?|parque infantil|espacio para jugar)/,
    feature: /(juegos|infantil|espacio amplio para jugar)/,
    label: "juegos infantiles",
  },
  { ask: /(balcon)/, feature: /balcon/, label: "balcón" },
  { ask: /(cocina)/, feature: /cocina/, label: "cocina" },
  { ask: /(pileta|piscina)/, feature: /(pileta|piscina)/, label: "pileta" },
  {
    ask: /(aire acondicionado|climatizacion)/,
    feature: /(aire acondicionado|climatizacion)/,
    label: "aire acondicionado",
  },
  { ask: /(calefaccion)/, feature: /calefaccion/, label: "calefacción" },
  { ask: /(ascensor)/, feature: /ascensor/, label: "ascensor" },
];

function featureName(value: string): string {
  const normalized = normalize(value);
  if (normalized.includes("wi") && normalized.includes("fi")) {
    return "Wi-Fi";
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * Responde características que están cargadas en el catálogo sin depender del
 * modelo, para que no invente ni niegue datos que sí existen.
 */
function featureReply(
  message: string,
  apartments: ChatRequest["apartments"],
): string | null {
  if (apartments.length !== 1) {
    return null;
  }

  const text = normalize(message);
  const isFeatureQuestion =
    /^(?:\u00bf)?(?:tiene|hay|cuenta con|incluye|es|el depto|el departamento)\b/.test(
      text,
    );

  if (!isFeatureQuestion) {
    return null;
  }

  if (
    /(cafe|restaurant|centro|ciudad|playa)/.test(text)
  ) {
    return null;
  }

  const apartment = apartments[0];
  const description = normalize(apartment.description);
  const asked = FEATURE_QUESTIONS.filter(({ ask }) => ask.test(text));

  if (asked.length === 0) {
    return policyFallback(message, apartment);
  }

  const asksAboutCost = /(pagar|costo|precio|incluye|gratis)/.test(text);
  const asksForDetail = /(cubierta|techad|privad)/.test(text);

  // Si preguntan por varias características, responder todas.
  if (asked.length > 1 && !asksAboutCost && !asksForDetail) {
    const present: string[] = [];
    const missing: string[] = [];

    for (const { feature, label } of asked) {
      const match = apartment.features.find((item) =>
        feature.test(normalize(item)),
      );
      if (match || feature.test(description)) {
        present.push(featureName(match ?? label));
      } else {
        missing.push(label);
      }
    }

    const parts: string[] = [];
    if (present.length > 0) {
      parts.push(`Sí, *${apartment.title}* tiene ${joinEs(present)}.`);
    }
    if (missing.length > 0) {
      parts.push(
        `La ficha no detalla ${joinEs(missing)}. El equipo lo confirma por WhatsApp 😊`,
      );
    }
    return parts.join(" ");
  }

  const { feature, label } = asked[0];
  const match = apartment.features.find((item) =>
    feature.test(normalize(item)),
  );
  const inDescription = feature.test(description);

  if (match || inDescription) {
    const detail = match ?? label;

    if (asksAboutCost) {
      return `La ficha de *${apartment.title}* indica ${label}, pero no detalla si tiene costo. El equipo lo confirma por WhatsApp 😊`;
    }

    if (asksForDetail && !/(cubierta|techad|privad)/.test(normalize(detail))) {
      return `La ficha de *${apartment.title}* indica ${label}, pero no detalla esa variante. El equipo lo confirma por WhatsApp 😊`;
    }

    return `Sí, *${apartment.title}* tiene ${featureName(detail)}.`;
  }

  return `La ficha de *${apartment.title}* no detalla ${label}. El equipo lo confirma por WhatsApp 😊`;

  return null;
}

function policyFallback(
  message: string,
  apartment: ChatRequest["apartments"][number],
): string | null {
  const noun = message.trim().match(
    /^(?:\u00bf)?(?:tiene|hay|cuenta con|incluye)\s+(?:un|una|el|la|los|las|que)?\s*([a-záéíóúñü ]{3,40})/i,
  );

  if (!noun) {
    return null;
  }

  const term = noun[1].replace(/\s+/g, " ").trim();
  if (
    /(algo|opcion|opciones|disponib|lugar|habitacion|economico|barato|otra cosa|tour|playa|centro|ciudad|restaurant|restaurante|cafe|faro|museo|mercado|feria|transporte|bus|taxi|aeropuerto|paseo|valle|coquimbo|elqui|artesani|shopping|mall|comercial|banco|cajero|farmacia|hospital|salud|clinica|super|clima|evento|observatorio|isla|punta|terminal|universidad|colegio)/.test(
      normalize(term),
    )
  ) {
    return null;
  }

  return `La ficha de *${apartment.title}* no detalla ${term}. El equipo lo confirma por WhatsApp 😊`;
}

function joinEs(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  const last = items[items.length - 1];
  const separator = /^[ei]/i.test(last) ? "e" : "y";
  return `${items.slice(0, -1).join(", ")} ${separator} ${last}`;
}

const POLICY_REPLIES: Array<{ ask: RegExp; reply: string }> = [
  {
    ask: /(deposito|sena|garantia)/,
    reply:
      "No tengo el detalle del depósito o la seña. El equipo lo confirma por WhatsApp 😊",
  },
  {
    ask: /(cancelacion|cancelar)/,
    reply:
      "No tengo el detalle de las políticas de cancelación. El equipo lo confirma por WhatsApp 😊",
  },
  {
    ask: /(mascota)/,
    reply:
      "No tengo cargado si aceptan mascotas. El equipo lo confirma por WhatsApp 😊",
  },
  {
    ask: /(sabana|toalla|ropa de cama)/,
    reply:
      "No tengo el detalle de sábanas y toallas. El equipo lo confirma por WhatsApp 😊",
  },
  {
    ask: /(limpieza)/,
    reply:
      "No tengo el detalle de limpieza. El equipo lo confirma por WhatsApp 😊",
  },
  {
    ask: /(check.?in|check.?out|horario de ingreso|horario de salida)/,
    reply:
      "No tengo el horario exacto de check-in y check-out. El equipo lo confirma por WhatsApp 😊",
  },
  {
    ask: /(descuento|minimo de noches)/,
    reply:
      "No tengo el detalle de descuentos o mínimo de noches. El equipo lo confirma por WhatsApp 😊",
  },
  {
    ask: /(fumar)/,
    reply:
      "No tengo el detalle sobre fumar en el departamento. El equipo lo confirma por WhatsApp 😊",
  },
  {
    ask: /(ascensor|silla de ruedas|accesib)/,
    reply:
      "No tengo el detalle de accesibilidad o ascensor. El equipo lo confirma por WhatsApp 😊",
  },
  {
    ask: /(secador|portero|cochera|vista al mar)/,
    reply: "No tengo ese detalle. El equipo lo confirma por WhatsApp 😊",
  },
];

function policyReply(message: string): string | null {
  const text = normalize(message);
  return POLICY_REPLIES.find(({ ask }) => ask.test(text))?.reply ?? null;
}

const CATALOG_LIST_REQUEST =
  /((que|cu[aá]les|cuantos|cuantas)\s+(apartamentos|departamentos|deptos|dptos|opciones)\s+(tienen|hay|estan|quedan|disponibles))|((apartamentos|departamentos|deptos|dptos)\s+disponibles)|(que\s+(tienen|ofrecen|hay)\s+disponible)|(mostrame\s+(los|el)\s+(apartamentos|departamentos|deptos))/;

function catalogListReply(
  message: string,
  apartments: ChatRequest["apartments"],
  catalogUrl: string,
): string | null {
  if (!CATALOG_LIST_REQUEST.test(normalize(message))) {
    return null;
  }

  if (apartments.length === 0) {
    return "No hay departamentos disponibles en este momento.";
  }

  const intro =
    apartments.length === 1
      ? "Tenemos este departamento disponible:"
      : "Tenemos estos departamentos disponibles:";

  const lines = apartments.map(
    (apartment) =>
      `- *${apartment.title}*: ${PRICE_FORMAT.format(apartment.pricePerNight)} CLP por noche, hasta ${apartment.capacity} personas.`,
  );

  return `${intro}\n\n${lines.join("\n")}\n\n${CATALOG_PHRASE}: ${catalogUrl} 😊`;
}

const PRICE_FORMAT = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Responde búsquedas de algo más económico con las opciones reales cargadas.
 */
function supermarketReply(message: string): string | null {
  const text = normalize(message);

  if (!/(supermercado|minimarket|almacen)/.test(text)) {
    return null;
  }

  if (!/(cerca|hay|queda)/.test(text)) {
    return null;
  }

  return "En la zona hay supermercados y minimarkets. El equipo te confirma cuál te queda más cerca 😊";
}

function priceReply(
  message: string,
  apartments: ChatRequest["apartments"],
): string | null {
  if (apartments.length !== 1) {
    return null;
  }

  const text = normalize(message);
  const asksCheaper =
    /(mas economico|mas barato|algo barato|algo economico|otra opcion|opciones mas|algo mas barato|presupuesto)/.test(
      text,
    );

  if (!asksCheaper) {
    return null;
  }

  const apartment = apartments[0];
  const price = PRICE_FORMAT.format(apartment.pricePerNight);

  return `Por ahora el único departamento disponible es *${apartment.title}*, a *${price} CLP por noche*. No tengo cargada otra opción más económica 😊`;
}

/**
 * Responde medios de pago sin inventar: el equipo los confirma por WhatsApp.
 */
function paymentReply(message: string): string | null {
  const text = normalize(message);
  const asksAboutPayment =
    /(medios? de pago|formas? de pago|como se paga|aceptan (tarjeta|transferencia|efectivo)|pago con (tarjeta|transferencia|efectivo)|tarjeta o transferencia|se paga con)/.test(
      text,
    );

  if (!asksAboutPayment) {
    return null;
  }

  return "No tengo cargado el detalle de los medios de pago. El equipo te lo confirma por WhatsApp 😊";
}

/**
 * Responde ubicación usando la descripción cargada del departamento, sin que
 * el modelo invente distancias.
 */
function locationReply(
  message: string,
  apartments: ChatRequest["apartments"],
): string | null {
  if (apartments.length !== 1) {
    return null;
  }

  const text = normalize(message);
  const asksLocation = /(cerca|distancia|queda|ubicad|lejos)/.test(text);

  if (!asksLocation) {
    return null;
  }

  const topics: Array<{ ask: RegExp; match: RegExp }> = [
    { ask: /(playa|mar)/, match: /(playa|mar|cuadra)/ },
    { ask: /(centro)/, match: /(centro)/ },
    { ask: /(super|minimarket|almacen)/, match: /(minimarket|super|almacen)/ },
    { ask: /(comer|restaurant|panader)/, match: /(comer|restaurant|panader)/ },
  ];

  const topic = topics.find(({ ask }) => ask.test(text));
  if (!topic) {
    return null;
  }

  // No cortar en abreviaturas como "Av. del Mar".
  const sentences = apartments[0].description
    .split(/\n+/)
    .flatMap((line) => line.split(/[.!?](?=\s+[A-ZÁÉÍÓÚÑ])/))
    .map((sentence) => sentence.replace(/^[-•]\s*/, "").trim())
    .filter((sentence) => sentence.length > 12);

  const relevant = sentences.find((sentence) =>
    topic.match.test(normalize(sentence)),
  );

  return relevant
    ? `${relevant.replace(/[.!?]+$/, "").replace(/^Departamento en /i, "")}.`
    : null;
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
    if (isHumanRequest(input.message)) {
      return {
        reply: HUMAN_REQUEST_REPLY,
        intent: "question",
        handoff: false,
        model: this.llm?.model ?? "mock",
        apartmentIds: [],
        customerName: null,
        wantsReservation: false,
        wantsHuman: false,
      };
    }

    if (isHumanConfirmation(input.message, input.history)) {
      return {
        reply: HUMAN_CONFIRMED_REPLY,
        intent: "question",
        handoff: false,
        model: this.llm?.model ?? "mock",
        apartmentIds: [],
        customerName: null,
        wantsReservation: false,
        wantsHuman: true,
      };
    }

    const pendingName = extractPendingName(input.history);

    if (pendingName) {
      const answer = normalize(input.message).trim();
      const affirmative =
        /^(si|dale|correcto|esta bien|asi esta bien|confirmo|ok|claro)\b/.test(
          answer,
        );
      const corrected = affirmative
        ? null
        : extractCorrectionName(input.message);
      const finalName = corrected ?? (affirmative ? pendingName : null);

      if (finalName) {
        return {
          reply: handoffReply("", finalName),
          intent: "question",
          handoff: true,
          model: this.llm?.model ?? "mock",
          apartmentIds: [],
          customerName: finalName,
          wantsReservation: true,
          wantsHuman: false,
        };
      }

      if (/^no\b/.test(answer)) {
        return {
          reply: "Escribime tu nombre completo, por favor.",
          intent: "question",
          handoff: false,
          model: this.llm?.model ?? "mock",
          apartmentIds: [],
          customerName: pendingName,
          wantsReservation: true,
          wantsHuman: false,
        };
      }
    }

    const intent = detectIntent(input.message);
    const catalogAnswer = catalogListReply(
      input.message,
      input.apartments,
      this.config.catalogUrl,
    );
    const locationAnswer = catalogAnswer
      ? null
      : locationReply(input.message, input.apartments);
    const supermarketAnswer =
      catalogAnswer || locationAnswer
        ? null
        : supermarketReply(input.message);
    const priceAnswer =
      catalogAnswer || locationAnswer || supermarketAnswer
        ? null
        : priceReply(input.message, input.apartments);
    const paymentAnswer =
      catalogAnswer || locationAnswer || supermarketAnswer || priceAnswer
        ? null
        : paymentReply(input.message);
    const policyAnswer =
      catalogAnswer ||
      locationAnswer ||
      supermarketAnswer ||
      priceAnswer ||
      paymentAnswer
        ? null
        : policyReply(input.message);
    const featureAnswer =
      catalogAnswer ||
      locationAnswer ||
      supermarketAnswer ||
      priceAnswer ||
      paymentAnswer ||
      policyAnswer
        ? null
        : featureReply(input.message, input.apartments);
    const directAnswer =
      catalogAnswer ??
      locationAnswer ??
      supermarketAnswer ??
      priceAnswer ??
      paymentAnswer ??
      policyAnswer ??
      featureAnswer;
    const rawReply = directAnswer ?? (await this.generate(input, intent));
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

    if (input.source === "audio" && customerName) {
      return {
        reply: `Escuché «${customerName}». ¿Está bien tu nombre? Si es correcto, decime «sí». Si no, escribilo de nuevo.`,
        intent,
        handoff: false,
        model: this.llm?.model ?? "mock",
        apartmentIds: [],
        customerName,
        wantsReservation: true,
        wantsHuman: false,
      };
    }

    const handoff = customerName !== null && wantsReservation;

    let withHandoff = rawReply;

    if (handoff && customerName) {
      withHandoff = handoffReply(rawReply, customerName);
    } else if (wantsReservation) {
      const cleaned = removePrematureHandoff(rawReply);
      const alreadyAsksForName =
        /\b(nombre completo|nombre y apellido|tu nombre)\b/i.test(cleaned);

      withHandoff = [cleaned, alreadyAsksForName ? "" : NAME_REQUEST_SUFFIX]
        .filter(Boolean)
        .join("\n\n");
    }

    let reply =
      intent === "greeting" ||
      wantsReservation ||
      directAnswer !== null ||
      (!isCityQuestion(input.message) &&
        (isCatalogRequest(input.message) || isApartmentRequest(input.message)))
        ? withHandoff
        : stripPitch(withHandoff) ||
          (isCityQuestion(input.message) ? CITY_FALLBACK : GENERIC_FALLBACK);

    if (!reply.trim()) {
      reply = isCityQuestion(input.message) ? CITY_FALLBACK : GENERIC_FALLBACK;
    }

    // Solo el saludo inicial agrega el catálogo. En el resto de las respuestas
    // con enlace, se normaliza la presentación para no dejar el link suelto.
    reply = withCatalogLink(
      reply,
      this.config.catalogUrl,
      intent === "greeting" && input.history.length === 0,
    );

    if (input.history.length > 0) {
      reply = stripLeadingGreeting(reply) || GENERIC_FALLBACK;

      const [firstLine, ...rest] = reply.split("\n");
      if (rest.length > 0 && !/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{3,}/.test(firstLine)) {
        reply = ["¿En qué te puedo ayudar?", ...rest].join("\n").trim();
      } else if (!/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{3,}/.test(reply)) {
        reply = "¿En qué te puedo ayudar?";
      }
    }

    reply = normalizePrices(reply);

    return {
      reply,
      intent,
      handoff,
      model: this.llm?.model ?? "mock",
      apartmentIds: mentionedApartmentIds(reply, input.apartments),
      customerName,
      wantsReservation,
      wantsHuman: false,
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
