#!/usr/bin/env node
/**
 * Simulador de personas contra servicio-ia (/chat).
 * NO usa WhatsApp: solo llama al endpoint interno de la IA.
 *
 * Uso:
 *   node scripts/simulate-personas.mjs --personas 1000
 *   CONCURRENCY=8 node scripts/simulate-personas.mjs --personas 100
 *
 * Variables: IA_URL, API_CENTRAL_URL, API_CENTRAL_ENV, SIMULATION_OUTPUT,
 * CONCURRENCY.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const IA_URL = process.env.IA_URL ?? "http://localhost:3102/chat";
const API_URL = process.env.API_CENTRAL_URL ?? "http://localhost:3101";
const ENV_PATH =
  process.env.API_CENTRAL_ENV ??
  fileURLToPath(new URL("../../api-central/.env", import.meta.url));
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);

const argPersonas = process.argv.findIndex((arg) => arg === "--personas");
const PERSONAS =
  argPersonas >= 0
    ? Number(process.argv[argPersonas + 1])
    : Number(process.env.PERSONAS ?? 1000);

const OUTPUT =
  process.env.SIMULATION_OUTPUT ??
  (PERSONAS >= 1000
    ? "/tmp/opencode/bot-simulation-1000.json"
    : "/tmp/opencode/bot-simulation.json");
const REQUEST_BUDGET = Number(process.env.REQUEST_BUDGET ?? 100);

// La IA limita los pedidos por minuto: el simulador se auto-regula para no
// provocar 429 ni afectar el servicio real.
let bucketStart = Date.now();
let bucketCount = 0;

async function pace() {
  for (;;) {
    const now = Date.now();
    if (now - bucketStart >= 60_000) {
      bucketStart = now;
      bucketCount = 0;
    }
    if (bucketCount < REQUEST_BUDGET) {
      bucketCount += 1;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const NAMES = [
  "Bruno Levatino",
  "Ana Gómez",
  "Juan Pérez",
  "María López",
  "Pedro Silva",
  "Carla Fernández",
  "Diego Rojas",
  "Sofía Martínez",
  "Martín Acosta",
  "Valentina Díaz",
  "Lucas Herrera",
  "Camila Torres",
  "Federico Suárez",
  "Julieta Benítez",
  "Nicolás Castro",
  "Agustina Romero",
  "Tomás Álvarez",
  "Florencia Medina",
  "Ramiro Ortiz",
  "Micaela Vargas",
];

const NAME_PREFIXES = [
  "Me llamo",
  "Soy",
  "Mi nombre es",
];

/**
 * Cada arquetipo representa una personalidad con su propio objetivo:
 * alquilar rápido, venir con familia, conocer la ciudad antes de reservar, etc.
 */
const ARCHETYPES = {
  joven_apuro: {
    label: "joven que solo quiere alquilar",
    plans: [
      [
        "Hola, ¿tenés algo para 2 personas?",
        "¿Cuánto sale?",
        "Dale, quiero reservar",
      ],
      [
        "Buenas, buscamos depto para el finde, somos 2",
        "¿Qué precio tiene?",
        "Me interesa, ¿cómo reservo?",
      ],
      [
        "Hola! ¿Hay lugar para 2?",
        "¿Tiene wifi?",
        "Quiero reservar para el 20",
      ],
      [
        "Hola, ¿tenés disponibilidad para dos?",
        "¿Cuánto sale la noche?",
        "Listo, quiero reservar",
      ],
    ],
  },
  familia: {
    label: "familia con niños",
    plans: [
      [
        "Hola, somos 5 con dos nenes, ¿tienen depto?",
        "¿Tiene cocina y balcón?",
        "¿Hay juegos para chicos?",
      ],
      [
        "Buenas, viajamos con dos nenes de 6 y 9 años",
        "¿Cuántas personas entran?",
        "¿Tiene estacionamiento?",
      ],
      [
        "Hola, buscamos algo para 5 personas",
        "¿Tiene lavarropa?",
        "¿Hay supermercado cerca?",
      ],
      [
        "Hola, vamos en familia con chicos",
        "¿Tiene quincho?",
        "¿Qué actividades hay con niños?",
      ],
    ],
  },
  pareja: {
    label: "pareja que busca escapada",
    plans: [
      [
        "Hola, buscamos algo tranquilo cerca de la playa",
        "¿A qué distancia está el mar?",
        "¿Cuánto sale por noche?",
      ],
      [
        "Buenas, queremos una escapada en pareja",
        "¿Tiene balcón?",
        "¿Qué playas me recomendás?",
      ],
      [
        "Hola, ¿el depto es lindo para dos?",
        "¿Tiene cocina?",
        "¿Se puede reservar para febrero?",
      ],
      [
        "Hola, buscamos algo romántico",
        "¿Tiene vista al mar?",
        "¿Cuánto sale?",
      ],
    ],
  },
  adulto_formal: {
    label: "adulto formal y cuidadoso",
    plans: [
      [
        "Buenas tardes, quisiera consultar por el departamento",
        "¿Cuál es la capacidad máxima?",
        "¿Podría indicarme el precio por noche?",
      ],
      [
        "Buenos días, necesito información del alojamiento",
        "¿Tiene estacionamiento?",
        "¿Qué medios de pago aceptan?",
      ],
      [
        "Buenas, deseo consultar disponibilidad para enero",
        "¿El precio incluye limpieza?",
        "¿Hay que dejar depósito?",
      ],
      [
        "Buenas tardes, ¿me podría dar detalles del departamento?",
        "¿Tiene ascensor?",
        "¿Cómo se llega desde el aeropuerto?",
      ],
    ],
  },
  argentino: {
    label: "turista argentino",
    plans: [
      [
        "Che, ¿tenés algo cerca de la playa?",
        "¿Cuánto sale por noche?",
        "Quiero reservar",
      ],
      [
        "Hola, vengo desde Argentina, ¿me recomendás playas?",
        "¿Se puede ir a Coquimbo?",
        "¿Cuánto sale el depto?",
      ],
      [
        "Buenas, ¿hay algo para dos?",
        "¿Tiene wifi?",
        "Dale, me interesa reservar",
      ],
      [
        "Che, ¿qué me recomendás para comer?",
        "¿Y para salir de noche?",
        "¿Tenés deptos disponibles?",
      ],
    ],
  },
  curioso_ciudad: {
    label: "quiere conocer La Serena antes de alquilar",
    plans: [
      [
        "Hola, nunca fui a La Serena, ¿qué me recomendás?",
        "¿Qué playas hay?",
        "¿Vale la pena el Valle del Elqui?",
        "¿Y tenés departamentos?",
      ],
      [
        "Buenas, quiero conocer la ciudad antes de reservar",
        "¿Qué hay en el centro histórico?",
        "¿Hay museos?",
        "¿Cuánto sale el depto?",
      ],
      [
        "Hola, ¿qué se puede hacer en La Serena?",
        "¿Cómo llego desde Santiago?",
        "¿Qué clima hace en enero?",
        "¿Me mostrás los departamentos?",
      ],
      [
        "Hola, planeo viajar en febrero",
        "¿Qué eventos hay en enero?",
        "¿Hay tours a Isla Damas?",
        "¿Qué precio tiene el depto?",
      ],
    ],
  },
  detallista: {
    label: "desconfiado que pregunta todo",
    plans: [
      [
        "Hola, antes de reservar quiero saber las políticas",
        "¿Se puede cancelar?",
        "¿Hay depósito o seña?",
        "¿Aceptan mascotas?",
      ],
      [
        "Buenas, necesito asegurarme de algunas cosas",
        "¿Hay que llevar ropa de cama?",
        "¿Tiene secador de pelo?",
        "¿Hay toallas?",
      ],
      [
        "Hola, ¿el edificio tiene portero?",
        "¿Hay ascensor?",
        "¿Es apto para silla de ruedas?",
        "¿Se puede fumar?",
      ],
      [
        "Buenas, ¿cuál es el mínimo de noches?",
        "¿Hay descuento por semana?",
        "¿Cómo se paga, tarjeta o transferencia?",
      ],
    ],
  },
  ejecutivo: {
    label: "ejecutivo que va al grano",
    plans: [
      [
        "Buenas, necesito disponibilidad para enero",
        "Precio final por noche",
        "Quiero reservar",
      ],
      [
        "Hola, ¿tenés disponibilidad esta semana?",
        "¿Cuánto sale?",
        "Reservo, ¿qué necesitás?",
      ],
      [
        "Buenas, viaje de trabajo, ¿hay wifi?",
        "¿Tiene estacionamiento?",
        "Pasame el precio",
      ],
      [
        "Hola, necesito reservar para 3 noches",
        "¿Cuánto sale en total?",
        "¿Se puede hacer check-in tarde?",
      ],
    ],
  },
  mochilero: {
    label: "mochilero con presupuesto",
    plans: [
      [
        "Hola, ando con presupuesto, ¿cuánto sale?",
        "¿Hay buses desde Santiago?",
        "¿Hay algo más económico?",
      ],
      [
        "Buenas, busco algo barato para 1 persona",
        "¿Tiene cocina?",
        "¿Hay supermercado cerca?",
      ],
      [
        "Hola, ¿se puede llegar en bus desde el aeropuerto?",
        "¿Qué se puede hacer gratis?",
        "¿Cuánto sale la noche?",
      ],
      [
        "Buenas, viajo con mochila, ¿tienen algo para uno?",
        "¿Hay transporte público?",
        "¿Qué playas me recomendás?",
      ],
    ],
  },
  grupo_amigos: {
    label: "grupo de amigos",
    plans: [
      [
        "Hola, somos 5 amigos, ¿tienen depto?",
        "¿Tiene quincho o parrilla?",
        "¿Se puede reservar para fin de año?",
      ],
      [
        "Buenas, vamos 5 personas",
        "¿Hay espacio para jugar?",
        "¿Cuánto sale por noche?",
      ],
      [
        "Hola, ¿entran 5 en el depto?",
        "¿Tiene estacionamiento para dos autos?",
        "Queremos reservar",
      ],
      [
        "Buenas, grupo de amigos para el finde",
        "¿Se puede usar el quincho?",
        "¿Hay que pagar por el estacionamiento?",
      ],
    ],
  },
};

const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

const CITY_KEYWORDS =
  /(playa|faro|centro|clima|santiago|aeropuerto|shopping|actividades|restaurante|coquimbo|elqui|isla damas|seguridad|evento|artesan|observatorio|transporte|estacion|cajero|banco|lluvia|museo|comida|noche|farmacia|hospital|feria|mercado|gratis|caf[eé]|turismo|visitar|pasear|ciudad)/;

const APARTMENT_KEYWORDS =
  /(departamento|depto|precio|valor|cu[aá]nto sale|capacidad|personas|dormitorio|ba[nñ]o|cocina|balc[oó]n|estacionamiento|wifi|lavarropa|quincho|seguridad|mascota|pileta|aire|s[aá]bana|toalla|limpieza|dep[oó]sito|cancel|descuento|m[ií]nimo|check|fumar|ascensor|silla|vista|ropa de cama|secador|cochera|portero|reserv|quincho|juegos|busco|buscamos|alojamiento|quedarme)/;

const UNKNOWN_POLICY =
  /(mascota|pileta|aire acondicionado|calefacci[oó]n|s[aá]bana|toalla|limpieza|dep[oó]sito|se[nñ]a|cancel|descuento|m[ií]nimo|check-in|check-out|fumar|ascensor|silla de ruedas|vista al mar|ropa de cama|secador|portero|cochera|tarjeta|transferencia|pago)/;

const KNOWN_FEATURES = [
  "cocina",
  "balcon",
  "estacionamiento",
  "wifi",
  "wi-fi",
  "quincho",
  "lavarropa",
  "seguridad",
  "juegos",
];

function personaFor(index) {
  const archetype = ARCHETYPE_KEYS[index % ARCHETYPE_KEYS.length];
  const config = ARCHETYPES[archetype];
  const plan = config.plans[Math.floor(index / ARCHETYPE_KEYS.length) % config.plans.length];
  const name = NAMES[index % NAMES.length];
  const messages = [...plan];

  // Una parte entrega el nombre para probar el handoff.
  if (
    index % 5 === 0 &&
    /(reserv|interesa|dale|listo)/i.test(messages[messages.length - 1])
  ) {
    const prefix = NAME_PREFIXES[index % NAME_PREFIXES.length];
    messages.push(`${prefix} ${name}`);
  }

  return {
    id: index + 1,
    archetype,
    archetypeLabel: config.label,
    phone: `5491${String(1000000 + index).padStart(8, "0")}`,
    name,
    messages,
  };
}

function normalize(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function classify(message) {
  const text = normalize(message);
  if (
    /(reserv|me interesa|quiero (el|un|una) (departamento|depto)|se[nñ]ar|pagar por (transferencia|tarjeta|efectivo))/.test(
      text,
    )
  ) {
    return "reservation";
  }
  if (
    /(caf[eé]|restaurant|centro|ciudad|playa|museo|mercado|feria)/.test(text) &&
    CITY_KEYWORDS.test(text)
  ) {
    return "city";
  }
  if (APARTMENT_KEYWORDS.test(text)) {
    return "apartment";
  }
  if (CITY_KEYWORDS.test(text)) {
    return "city";
  }
  if (/^(me llamo |soy |mi nombre es )/.test(text)) {
    return "name";
  }
  return "other";
}

function toneMetrics(reply) {
  const text = String(reply ?? "");
  const norm = normalize(text);
  const emojis = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const exclamations = (text.match(/!/g) ?? []).length;
  const warm = (
    norm.match(
      /\b(hola|gracias|claro|dale|genial|perfecto|ideal|hermosa?|lind[oa]s?|disfrut\w*|recomiendo|podes|queres|contame|avisame|suerte|gusto|buenisimo|excelente|encantad\w*)\b/g,
    ) ?? []
  ).length;
  const sober = (
    norm.match(
      /\b(estimado|usted|a continuacion|cabe destacar|lamentablemente|debera|corresponde|se informa)\b/g,
    ) ?? []
  ).length;
  const slang = (
    norm.match(/\b(che|boludo|copado|zarpado|joya|de una|alta onda)\b/g) ?? []
  ).length;
  const caps = (text.match(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g) ?? []).filter(
    (word) => !/^(CLP|LSC|DNI|IVA)$/i.test(word),
  ).length;

  let bucket = "neutral";
  if (emojis >= 3 || exclamations >= 3 || slang > 0 || caps >= 2) {
    bucket = "colorido";
  } else if (emojis >= 1 || warm > 0) {
    bucket = "amable";
  } else if (text.length >= 90) {
    bucket = "sobrio";
  }

  return { emojis, exclamations, warm, sober, slang, caps, bucket, length: text.length };
}

function evaluate(turn, data, previousWasNameRequest) {
  const flags = [];
  const reply = String(data.reply ?? "");
  const text = normalize(reply.toString());
  const type = classify(turn.message);
  const tone = toneMetrics(reply);

  if (!reply || reply.length < 15) {
    flags.push("empty_reply");
  }
  if (reply.split(/\s+/).length > 140) {
    flags.push("too_long");
  }
  if (tone.bucket === "colorido") {
    flags.push("tone_colorido");
  }
  if (tone.bucket === "sobrio") {
    flags.push("tone_sobrio");
  }
  if (data.model === "mock") {
    flags.push("mock_fallback");
  }

  const catalogMentions = (reply.match(/cat[aá]logo/gi) ?? []).length;
  const links = (reply.match(/https?:\/\//g) ?? []).length;
  if (catalogMentions > 1) {
    flags.push("duplicate_catalog");
  }
  if (links > 1) {
    flags.push("duplicate_link");
  }

  const isGreeting =
    /^(hola|holis|holi|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal|hey)\b/.test(
      normalize(turn.message),
    );

  if (type === "city" && !isGreeting) {
    if (/https?:\/\//.test(reply)) flags.push("city_url");
    if (/(departamento|depto|carlo magno|reserva|precio)/.test(text)) {
      flags.push("city_pitch");
    }
    if (
      /^(solo puedo|no puedo ayudar|no tengo informaci[oó]n)/.test(text) &&
      !/(agenda municipal|municipalidad|temporada alta|fuentes oficiales|lo mas directo|te sugiero|recomiendo|podes)/.test(
        text,
      )
    ) {
      flags.push("city_refusal");
    }
  }

  if (type === "apartment") {
    const policyQuestion =
      /(incluye|limpieza|dep[oó]sito|se[nñ]a|cancel|descuento|m[ií]nimo|mascota|fumar|accesib|silla)/.test(
        normalize(turn.message),
      );
    if (
      !policyQuestion &&
      /precio|cuanto sale/.test(normalize(turn.message)) &&
      !/CLP|\$/.test(reply)
    ) {
      flags.push("price_missing");
    }
    if (
      /cuantas personas|capacidad/.test(normalize(turn.message)) &&
      !/\b5\b|cinco/.test(text)
    ) {
      flags.push("capacity_missing");
    }
    const messageText = normalize(turn.message);
    const flat = (value) => normalize(value).replace(/[-\s]/g, "");
    const usageQuestion =
      /(usar|uso|siempre|reservar el|puedo usar|pol[ií]tica)/.test(messageText);
    if (!usageQuestion) {
      for (const feature of KNOWN_FEATURES) {
        if (
          flat(turn.message).includes(flat(feature)) &&
          !flat(reply).includes(flat(feature))
        ) {
          flags.push(`feature_missing:${feature}`);
        }
      }
    }
    if (
      UNKNOWN_POLICY.test(normalize(turn.message)) &&
      !/(no tengo|no se|consult|equipo|confirm|depende|ficha)/.test(text)
    ) {
      flags.push("policy_answer_without_data");
    }
    const isExistenceQuestion =
      /^(¿)?(tiene|hay|cuenta con)/.test(messageText) &&
      !/(siempre|uso|pol[ií]tica|costo|pagar|incluye|cubierta|cuando)/.test(
        messageText,
      );
    const repliesNoData = /(no detalla|no tengo|no figura|no incluye)/.test(text);
    if (
      isExistenceQuestion &&
      repliesNoData &&
      KNOWN_FEATURES.some((feature) => messageText.includes(feature))
    ) {
      flags.push("denied_known_feature");
    }
  }

  if (type === "reservation" && !data.wantsReservation) {
    flags.push("reservation_not_flagged");
  }

  if (
    (type === "name" || previousWasNameRequest) &&
    !data.customerName &&
    turn.message.split(" ").length <= 4 &&
    !turn.message.includes("?") &&
    !/^(que|como|cuanto|cuanta|donde|hay|tiene|puedo|se puede|me recomend)/.test(
      normalize(turn.message),
    ) &&
    !["apartment", "city", "reservation"].includes(type)
  ) {
    flags.push("name_not_stored");
  }

  if (data.handoff && !data.customerName) {
    flags.push("handoff_without_name");
  }

  return { type, flags, tone };
}

async function callChat(message, history, apartments, phone) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await pace();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(IA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, phone, history, apartments }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 15);
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(retryAfter, 10) * 1_000 + 2_000),
        );
        continue;
      }
      return { status: response.status, data: body };
    } catch (error) {
      return { status: 0, data: null, error: String(error) };
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: 429, data: null };
}

async function runPersona(persona, apartments) {
  const history = [];
  const results = [];

  for (const message of persona.messages) {
    const previousAssistant = [...history]
      .reverse()
      .find((turn) => turn.role === "assistant");
    const previousWasNameRequest =
      previousAssistant && /nombre|llam/i.test(previousAssistant.content);

    const { status, data, error } = await callChat(
      message,
      history.slice(-20),
      apartments,
      persona.phone,
    );

    const turn = { message, status, data, error };
    const { type, flags, tone } = data
      ? evaluate(turn, data, Boolean(previousWasNameRequest))
      : {
          type: classify(message),
          flags: ["http_error"],
          tone: toneMetrics(""),
        };

    results.push({
      persona: persona.id,
      archetype: persona.archetype,
      archetypeLabel: persona.archetypeLabel,
      phone: persona.phone,
      type,
      message,
      reply: data?.reply ?? null,
      intent: data?.intent ?? null,
      handoff: data?.handoff ?? null,
      wantsReservation: data?.wantsReservation ?? null,
      customerName: data?.customerName ?? null,
      status,
      model: data?.model ?? null,
      tone,
      flags,
    });

    if (data?.reply) {
      history.push({ role: "user", content: message });
      history.push({ role: "assistant", content: data.reply });
    }

    if (status !== 200) {
      break;
    }
  }

  return results;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function summarize(results) {
  const withReply = results.filter((result) => result.reply);
  const toneCounts = { amable: 0, neutral: 0, sobrio: 0, colorido: 0 };
  for (const result of withReply) {
    toneCounts[result.tone.bucket] += 1;
  }

  const byArchetype = {};
  for (const result of results) {
    if (!byArchetype[result.archetype]) {
      byArchetype[result.archetype] = {
        label: result.archetypeLabel,
        turns: 0,
        replies: 0,
        emojis: 0,
        exposedEmoji: 0,
        warm: 0,
        sobrio: 0,
        colorido: 0,
        length: [],
      };
    }
    const entry = byArchetype[result.archetype];
    entry.turns += 1;
    if (!result.reply) continue;
    entry.replies += 1;
    entry.emojis += result.tone.emojis;
    entry.exposedEmoji += result.tone.emojis > 0 ? 1 : 0;
    entry.warm += result.tone.warm > 0 ? 1 : 0;
    entry.sobrio += result.tone.bucket === "sobrio" ? 1 : 0;
    entry.colorido += result.tone.bucket === "colorido" ? 1 : 0;
    entry.length.push(result.tone.length);
  }

  for (const entry of Object.values(byArchetype)) {
    entry.avgLength = entry.replies
      ? Math.round(entry.length.reduce((a, b) => a + b, 0) / entry.replies)
      : 0;
    entry.emojiRate = entry.replies ? entry.exposedEmoji / entry.replies : 0;
    entry.warmRate = entry.replies ? entry.warm / entry.replies : 0;
    entry.sobrioRate = entry.replies ? entry.sobrio / entry.replies : 0;
    entry.coloridoRate = entry.replies ? entry.colorido / entry.replies : 0;
    delete entry.length;
  }

  return {
    toneCounts,
    toneRate: Object.fromEntries(
      Object.entries(toneCounts).map(([key, value]) => [
        key,
        withReply.length ? value / withReply.length : 0,
      ]),
    ),
    avgLength: withReply.length
      ? Math.round(
          withReply.reduce((sum, result) => sum + result.tone.length, 0) /
            withReply.length,
        )
      : 0,
    p95Length: percentile(
      withReply.map((result) => result.tone.length),
      95,
    ),
    byArchetype,
  };
}

function sample(results, predicate, count) {
  const matches = results.filter(predicate);
  const step = Math.max(1, Math.floor(matches.length / count));
  return matches.filter((_, index) => index % step === 0).slice(0, count);
}

async function main() {
  const contextResponse = await fetch(`${API_URL}/internal/context`, {
    headers: { "x-service-token": env.INTERNAL_API_TOKEN },
  });
  const apartments = await contextResponse.json();
  console.log(`Contexto: ${apartments.length} departamento(s) activo(s)`);
  console.log(
    `Personas: ${PERSONAS} | mensajes estimados: ${Math.round(PERSONAS * 3.3)} | concurrencia: ${CONCURRENCY}`,
  );

  const personas = Array.from({ length: PERSONAS }, (_, index) =>
    personaFor(index),
  );
  const allResults = [];
  const startedAt = Date.now();
  let done = 0;

  for (let index = 0; index < personas.length; index += CONCURRENCY) {
    const chunk = personas.slice(index, index + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((persona) => runPersona(persona, apartments)),
    );
    for (const results of chunkResults) {
      allResults.push(...results);
    }
    done += chunk.length;
    const minutes = (Date.now() - startedAt) / 60000;
    const rate = allResults.length / Math.max(minutes, 0.1);
    if (done % (CONCURRENCY * 5) === 0 || done === personas.length) {
      console.log(
        `Personas ${done}/${personas.length} | ${allResults.length} llamadas | ${rate.toFixed(0)}/min`,
      );
    }
  }

  const failures = allResults.filter((result) => result.flags.length > 0);
  const byFlag = {};
  for (const result of failures) {
    for (const flag of result.flags) {
      byFlag[flag] = (byFlag[flag] ?? 0) + 1;
    }
  }

  const summary = summarize(allResults);

  const report = {
    generatedAt: new Date().toISOString(),
    apartments: apartments.length,
    personas: personas.length,
    calls: allResults.length,
    failures: failures.length,
    byFlag,
    summary,
    results: allResults,
  };

  writeFileSync(OUTPUT, JSON.stringify(report, null, 2));

  console.log(`\nReporte: ${OUTPUT}`);
  console.log(`Llamadas: ${allResults.length} | Fallos: ${failures.length}`);
  console.log("Por tipo:");
  for (const [flag, count] of Object.entries(byFlag).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${flag}: ${count}`);
  }

  console.log("\nTono:");
  console.log(
    `  amable ${(summary.toneRate.amable * 100).toFixed(1)}% | neutral ${(
      summary.toneRate.neutral * 100
    ).toFixed(1)}% | sobrio ${(summary.toneRate.sobrio * 100).toFixed(
      1,
    )}% | colorido ${(summary.toneRate.colorido * 100).toFixed(1)}%`,
  );
  console.log(
    `  largo promedio ${summary.avgLength} caracteres | p95 ${summary.p95Length}`,
  );
  console.log("\nPor personalidad:");
  for (const [key, entry] of Object.entries(summary.byArchetype)) {
    console.log(
      `  ${key} (${entry.turns} turnos): largo ${entry.avgLength} | emoji ${(
        entry.emojiRate * 100
      ).toFixed(0)}% | calidez ${(entry.warmRate * 100).toFixed(0)}% | sobrio ${(
        entry.sobrioRate * 100
      ).toFixed(0)}% | colorido ${(entry.coloridoRate * 100).toFixed(0)}%`,
    );
  }

  console.log("\nEjemplos sobrios:");
  for (const result of sample(
    allResults,
    (item) => item.tone.bucket === "sobrio",
    6,
  )) {
    console.log(`\n[${result.archetype}] ${result.message}`);
    console.log(`  < ${String(result.reply).replace(/\n/g, " ").slice(0, 300)}`);
  }

  console.log("\nEjemplos coloridos:");
  for (const result of sample(
    allResults,
    (item) => item.tone.bucket === "colorido",
    6,
  )) {
    console.log(`\n[${result.archetype}] ${result.message}`);
    console.log(`  < ${String(result.reply).replace(/\n/g, " ").slice(0, 300)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
