import type { ApartmentContext, ChatRequest, Intent } from "../types";
import { normalize } from "./guardrail.service";

const priceFormat = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const OFF_TOPIC_REPLY =
  "Me encantaría ayudarte con eso, pero solo puedo responder sobre los departamentos y sobre La Serena. ¿Querés que te cuente qué hay disponible?";

function greeting(catalogUrl: string): string {
  return `¡Hola! Soy el asistente de Alquileres 4 Esquinas 😊 Podés ver el catálogo completo acá: ${catalogUrl}. ¿Te ayudo a encontrar tu departamento ideal?`;
}

function reservation(): string {
  return "¡Perfecto! Para iniciar la reserva, enviá tu nombre completo. Desde ahora te va a responder una persona del equipo para confirmar fechas y pago.";
}

function describeApartment(apartment: ApartmentContext): string {
  const features = apartment.features.join(", ") || "sin características cargadas";
  return `*${apartment.title}*\n- Precio: ${priceFormat.format(apartment.pricePerNight)} CLP por noche\n- Capacidad: hasta ${apartment.capacity} personas\n- ${apartment.description}\n- Características: ${features}`;
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
    return `Precios por noche:\n${listBy(apartments, (item) => `${priceFormat.format(item.pricePerNight)} CLP`)}`;
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
  return `Tenemos ${apartments.length} departamentos:\n${apartments
    .map((item) => `- ${item.title}: hasta ${item.capacity} personas`)
    .join("\n")}\n\n¿Te interesa alguno en particular o querés que te cuente precios y disponibilidad?`;
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
