#!/usr/bin/env node
/**
 * Simulador de 100 personas contra servicio-ia (/chat).
 * NO usa WhatsApp: solo llama al endpoint interno de la IA.
 *
 * Uso: node scripts/simulate-personas.mjs
 * Variables: IA_URL, API_CENTRAL_URL, API_CENTRAL_ENV, SIMULATION_OUTPUT
 * Salida: JSON con cada turno y sus fallos + resumen por consola.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const IA_URL = process.env.IA_URL ?? "http://localhost:3102/chat";
const API_URL = process.env.API_CENTRAL_URL ?? "http://localhost:3101";
const ENV_PATH =
  process.env.API_CENTRAL_ENV ??
  fileURLToPath(new URL("../../api-central/.env", import.meta.url));
const OUTPUT =
  process.env.SIMULATION_OUTPUT ?? "/tmp/opencode/bot-simulation.json";

const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const APT = "Carlo Magno Piso 1";

const PEOPLE = [1, 2, 2, 3, 4, 5, 2, 1, 6, 2, 4, 3, 2, 2, 5, 1, 4, 2, 3, 2];
const PEOPLE_LABEL = ["una", "dos", "tres", "cuatro", "cinco", "seis"];

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
];

const APARTMENT_QUESTIONS = [
  (n) => `Hola, busco un departamento para ${PEOPLE_LABEL[n - 1]} personas. ¿Qué tenés?`,
  () => `¿Cuánto sale ${APT} por noche?`,
  () => `¿Cuántas personas entran en ${APT}?`,
  () => `¿Qué características tiene ${APT}?`,
  () => `¿Tiene estacionamiento?`,
  () => `¿Tiene balcón?`,
  () => `¿Tiene cocina?`,
  () => `¿Tiene Wi-Fi?`,
  () => `¿Tiene lavarropa?`,
  () => `¿Tiene quincho?`,
  () => `¿Es seguro el condominio?`,
  () => `¿Hay juegos para chicos?`,
  () => `¿Aceptan mascotas?`,
  () => `¿Tiene pileta?`,
  () => `¿Tiene aire acondicionado?`,
  () => `¿Hay sábanas y toallas?`,
  () => `¿El precio incluye limpieza?`,
  () => `¿Hay que dejar depósito?`,
  () => `¿Se puede cancelar?`,
  () => `¿Hay descuento por semana?`,
  () => `¿Cuál es el mínimo de noches?`,
  () => `¿Cómo se paga, tarjeta o transferencia?`,
  () => `¿A qué hora es el check-in y el check-out?`,
  () => `¿Está cerca de la playa?`,
  () => `¿Tiene calefacción?`,
  () => `¿Se puede fumar?`,
  () => `¿Hay ascensor?`,
  () => `¿Es apto para silla de ruedas?`,
  () => `¿Hay supermercado cerca?`,
  () => `¿Hay farmacia cerca?`,
  () => `¿Hay hospital cerca?`,
  () => `¿Qué hay para hacer cerca?`,
  () => `¿Se puede hacer check-in tarde?`,
  () => `¿El departamento tiene vista al mar?`,
  () => `¿Hay que llevar ropa de cama?`,
  () => `¿Tiene secador de pelo?`,
  () => `¿Hay cochera cubierta?`,
  () => `¿Se puede usar el quincho siempre?`,
  () => `¿Hay que pagar por el estacionamiento?`,
  () => `¿El edificio tiene portero?`,
];

const CITY_QUESTIONS = [
  "¿Qué playas me recomendás?",
  "¿Qué puedo visitar en el centro histórico?",
  "¿Dónde está el Faro Monumental?",
  "¿Qué clima hace en enero?",
  "¿Cómo llego desde Santiago?",
  "¿Cómo llego desde el aeropuerto?",
  "¿Hay shopping?",
  "¿Qué actividades hay con niños?",
  "¿A qué distancia está el aeropuerto?",
  "¿Me recomendás un restaurante?",
  "¿Qué se puede hacer en Coquimbo?",
  "¿Vale la pena el Valle del Elqui?",
  "¿Hay tours a Isla Damas?",
  "¿Es segura La Serena?",
  "¿Qué eventos hay en enero?",
  "¿Dónde compro artesanías?",
  "¿Hay observatorios cerca?",
  "¿Qué playas son aptas para niños?",
  "¿Hay transporte público?",
  "¿Dónde se puede estacionar en el centro?",
  "¿Hay cajeros o banco cerca?",
  "¿Qué hacer un día de lluvia?",
  "¿Hay museos?",
  "¿Qué comida típica hay?",
  "¿Cómo es la noche en La Serena?",
  "¿Hay farmacias de turno?",
  "¿Dónde hay un hospital?",
  "¿Hay ferias o mercados?",
  "¿Qué se puede hacer gratis?",
  "¿Hay wifi en los cafés?",
];

const RESERVATION_MESSAGES = [
  "Me interesa, ¿cómo reservo?",
  "Quiero reservar para dos personas del 20 al 27 de diciembre.",
  "¿Puedo reservar ahora?",
  `Quiero reservar el ${APT}.`,
  "Me interesa el departamento para enero.",
  "¿Cómo hago para señar una reserva?",
  "Quiero reservar para Año Nuevo.",
  "Me gustaría reservar una semana en febrero.",
  "¿Hay disponibilidad para reservar en enero?",
  "Quiero reservar y pagar por transferencia.",
];

const CITY_KEYWORDS =
  /(playa|faro|centro|clima|santiago|aeropuerto|shopping|ni[nñ]o|familia|restaurante|coquimbo|elqui|isla damas|seguridad|evento|artesan|observatorio|transporte|estacion|cajero|banco|lluvia|museo|comida|noche|farmacia|hospital|feria|mercado|gratis|caf[eé]|turismo|visitar|pasear|ciudad)/;

const APARTMENT_KEYWORDS =
  /(departamento|depto|precio|valor|cu[aá]nto sale|capacidad|personas|dormitorio|ba[nñ]o|cocina|balc[oó]n|estacionamiento|wifi|lavarropa|quincho|seguridad|mascota|pileta|aire|s[aá]bana|toalla|limpieza|dep[oó]sito|cancel|descuento|m[ií]nimo|check|fumar|ascensor|silla|vista|ropa de cama|secador|cochera|portero|reserv)/;

const PRESENTATION = "¿Otra consulta?";
const UNKNOWN_POLICY =
  /(mascota|pileta|aire acondicionado|calefacci[oó]n|s[aá]bana|toalla|limpieza|dep[oó]sito|se[nñ]a|cancel|descuento|m[ií]nimo|check-in|check-out|fumar|ascensor|silla de ruedas|vista al mar|ropa de cama|secador|portero|cochera)/;

function personaFor(index) {
  const people = PEOPLE[index % PEOPLE.length];
  const name = NAMES[index % NAMES.length];
  const apartmentQuestion = APARTMENT_QUESTIONS[index % APARTMENT_QUESTIONS.length](people);
  const cityQuestion = CITY_QUESTIONS[index % CITY_QUESTIONS.length];
  const reservation = RESERVATION_MESSAGES[index % RESERVATION_MESSAGES.length];

  const messages =
    index % 3 === 0
      ? [cityQuestion, apartmentQuestion]
      : [apartmentQuestion, cityQuestion];

  if (index % 10 === 0) {
    messages.push(reservation);
  }

  if (index % 20 === 0) {
    messages.push(`Me llamo ${name}`);
  }

  return {
    id: index + 1,
    phone: `54900000${String(10000 + index)}`,
    people,
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
  if (/(reserv|me interesa|quiero (el|un|una) (departamento|depto)|se[nñ]ar|pagar por (transferencia|tarjeta|efectivo))/.test(text)) {
    return "reservation";
  }
  if (/(caf[eé]|restaurant|centro|ciudad|playa|museo|mercado|feria)/.test(text) && CITY_KEYWORDS.test(text)) {
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

function evaluate(turn, data, previousWasNameRequest) {
  const flags = [];
  const reply = String(data.reply ?? "");
  const text = normalize(reply.toString());
  const type = classify(turn.message);

  if (!reply || reply.length < 15) {
    flags.push("empty_reply");
  }
  if (reply.split(/\s+/).length > 140) {
    flags.push("too_long");
  }

  if (type === "city") {
    if (/https?:\/\//.test(reply)) flags.push("city_url");
    if (/(departamento|depto|carlo magno|reserva|precio)/.test(text)) flags.push("city_pitch");
    if (
      /^(solo puedo|no puedo ayudar|no tengo informaci[oó]n)/.test(text) &&
      !/(agenda municipal|municipalidad|temporada alta|fuentes oficiales)/.test(text)
    ) {
      flags.push("city_refusal");
    }
  }

  if (type === "apartment") {
    const knownFeatures = [
      "cocina",
      "balcon",
      "estacionamiento",
      "wifi",
      "wi-fi",
      "quincho",
      "seguridad",
      "lavarropa",
      "juegos",
    ];
    const messageText = normalize(turn.message);
    const isExistenceQuestion =
      /^(¿)?(tiene|hay|cuenta con)/.test(messageText) &&
      !/(siempre|uso|pol[ií]tica|costo|pagar|incluye|cubierta|cuando)/.test(messageText);
    const repliesNoData = /(no detalla|no tengo|no figura|no incluye)/.test(text);
    if (
      isExistenceQuestion &&
      repliesNoData &&
      knownFeatures.some((f) => messageText.includes(f))
    ) {
      flags.push("denied_known_feature");
    }
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
    if (/cuantas personas|capacidad/.test(normalize(turn.message)) && !/\b5\b|cinco/.test(text)) {
      flags.push("capacity_missing");
    }
    for (const feature of [
      "estacionamiento",
      "balcon",
      "cocina",
      "wifi",
      "lavarropa",
      "quincho",
      "seguridad",
      "juegos",
    ]) {
      if (normalize(turn.message).includes(feature) && !text.includes(feature)) {
        flags.push(`feature_missing:${feature}`);
      }
    }
    if (
      UNKNOWN_POLICY.test(normalize(turn.message)) &&
      !/(no tengo|no se|consult|equipo|confirm|depende)/.test(text)
    ) {
      flags.push("policy_answer_without_data");
    }
  }

  if (type === "reservation" && !data.wantsReservation) {
    flags.push("reservation_not_flagged");
  }

  if (
    (type === "name" || previousWasNameRequest) &&
    !data.customerName &&
    turn.message.split(" ").length <= 4 &&
    type !== "apartment" &&
    type !== "city" &&
    type !== "reservation"
  ) {
    flags.push("name_not_stored");
  }

  if (data.handoff && !data.customerName) {
    flags.push("handoff_without_name");
  }

  return { type, flags };
}

async function callChat(message, history, apartments, phone) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
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
        await new Promise((resolve) => setTimeout(resolve, 35_000));
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
    const previousAssistant = [...history].reverse().find((turn) => turn.role === "assistant");
    const previousWasNameRequest =
      previousAssistant && /nombre|llam/i.test(previousAssistant.content);

    const { status, data, error } = await callChat(
      message,
      history.slice(-20),
      apartments,
      persona.phone,
    );

    const turn = { message, status, data, error };
    const { type, flags } = data
      ? evaluate(turn, data, Boolean(previousWasNameRequest))
      : { type: classify(message), flags: ["http_error"] };

    results.push({
      persona: persona.id,
      phone: persona.phone,
      type,
      message,
      reply: data?.reply ?? null,
      intent: data?.intent ?? null,
      handoff: data?.handoff ?? null,
      wantsReservation: data?.wantsReservation ?? null,
      customerName: data?.customerName ?? null,
      status,
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

async function main() {
  const contextResponse = await fetch(`${API_URL}/internal/context`, {
    headers: { "x-service-token": env.INTERNAL_API_TOKEN },
  });
  const apartments = await contextResponse.json();
  console.log(`Contexto: ${apartments.length} departamento(s) activo(s)`);

  const personas = Array.from({ length: 100 }, (_, index) => personaFor(index));
  const allResults = [];
  const concurrency = 3;

  for (let index = 0; index < personas.length; index += concurrency) {
    const chunk = personas.slice(index, index + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((persona) => runPersona(persona, apartments)),
    );
    for (const results of chunkResults) {
      allResults.push(...results);
    }
    console.log(`Personas ${index + 1}-${index + chunk.length} completadas`);
  }

  const failures = allResults.filter((result) => result.flags.length > 0);
  const byFlag = {};
  for (const result of failures) {
    for (const flag of result.flags) {
      byFlag[flag] = (byFlag[flag] ?? 0) + 1;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apartments: apartments.length,
    personas: personas.length,
    calls: allResults.length,
    failures: failures.length,
    byFlag,
    results: allResults,
  };

  writeFileSync(OUTPUT, JSON.stringify(report, null, 2));

  console.log(`\nReporte: ${OUTPUT}`);
  console.log(`Llamadas: ${allResults.length}`);
  console.log(`Fallos: ${failures.length}`);
  console.log("Por tipo:");
  for (const [flag, count] of Object.entries(byFlag).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${flag}: ${count}`);
  }

  console.log("\nEjemplos:");
  const seen = new Set();
  for (const result of failures) {
    const flag = result.flags[0];
    if (seen.has(flag)) continue;
    seen.add(flag);
    console.log(`\n[${flag}] persona ${result.persona} (${result.type})`);
    console.log("  >", result.message);
    console.log("  <", String(result.reply ?? "").replace(/\n/g, " ").slice(0, 260));
    if (seen.size >= 12) break;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
