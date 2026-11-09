import type { ApartmentContext, ChatRequest, Intent } from "../types";
import { normalize } from "./guardrail.service";

const priceFormat = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const OFF_TOPIC_REPLY =
  "Solo puedo responder consultas sobre los departamentos y sobre La Serena. ¿Querés que te cuente qué departamentos hay disponibles?";

function greeting(catalogUrl: string): string {
  return `Hola, soy el asistente virtual de La Serena. Podés ver el catálogo completo acá: ${catalogUrl}. ¿Buscás algo en particular?`;
}

function reservation(): string {
  return "Perfecto. Para iniciar la reserva, enviá una foto de tu DNI. Desde ahora te va a responder una persona del equipo para confirmar fechas y pago.";
}

function describeApartment(apartment: ApartmentContext): string {
  const features = apartment.features.join(", ") || "sin características cargadas";
  return `${apartment.title}: ${priceFormat.format(apartment.pricePerNight)} por noche, hasta ${apartment.capacity} personas. ${apartment.description} Características: ${features}.`;
}

function listBy(
  apartments: ApartmentContext[],
  value: (apartment: ApartmentContext) => string,
): string {
  return apartments
    .map((apartment) => `- ${apartment.title}: ${value(apartment)}`)
    .join("\n");
}

function answerQuestion(request: ChatRequest, catalogUrl: string): string {
  const text = normalize(request.message);
  const apartments = request.apartments;

  if (apartments.length === 0) {
    return "No hay departamentos publicados en este momento.";
  }

  const match = apartments.find((apartment) =>
    text.includes(normalize(apartment.title)),
  );
  if (match) {
    return describeApartment(match);
  }
  if (/precio|valor|cuanto|costo/.test(text)) {
    return `Precios por noche:\n${listBy(apartments, (item) => priceFormat.format(item.pricePerNight))}`;
  }
  if (/capacidad|personas|cuantas/.test(text)) {
    return `Capacidad por departamento:\n${listBy(apartments, (item) => `hasta ${item.capacity} personas`)}`;
  }
  if (/disponib|fecha|calendario/.test(text)) {
    return `La disponibilidad está en el calendario de cada departamento del catálogo: ${catalogUrl}. Si me decís fechas y departamento, lo revisamos con el equipo.`;
  }
  if (/caracteristica|incluye|comodidad/.test(text)) {
    return `Características:\n${listBy(apartments, (item) => item.features.join(", ") || "sin datos")}`;
  }
  return `En el catálogo hay ${apartments.length} departamentos: ${apartments.map((item) => item.title).join(", ")}. ¿Te interesa alguno en particular o querés consultar por precios y disponibilidad?`;
}

export function mockReply(
  request: ChatRequest,
  intent: Intent,
  catalogUrl: string,
): string {
  switch (intent) {
    case "greeting":
      return greeting(catalogUrl);
    case "reservation":
      return reservation();
    case "off_topic":
      return OFF_TOPIC_REPLY;
    default:
      return answerQuestion(request, catalogUrl);
  }
}
