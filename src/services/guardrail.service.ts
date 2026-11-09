import type { Intent } from "../types";

const RESERVATION_PATTERNS = [
  /\breserv/,
  /\bquiero (arrendar|alquilar|tomar)\b/,
  /\bquiero (el|ese|este) (departamento|depto|dpto)\b/,
  /\b(hacer|concretar) la reserva\b/,
  /\bpagar\b/,
  /\btransferen/,
  /\bdni\b/,
  /\bdocumento\b/,
];

const GREETING_PATTERNS = [
  /^hola\b/,
  /^buenas\b/,
  /^buen(os|as) (dias|tardes|noches)\b/,
  /^que tal\b/,
  /^hey\b/,
];

const OFF_TOPIC_PATTERNS = [
  /\bfutbol\b/,
  /\bpolitica\b/,
  /\belecciones\b/,
  /\bclima\b/,
  /\bchiste\b/,
  /\breceta\b/,
  /\bprograma(r|cion)\b/,
];

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function detectIntent(message: string): Intent {
  const text = normalize(message);

  if (RESERVATION_PATTERNS.some((pattern) => pattern.test(text))) {
    return "reservation";
  }
  if (GREETING_PATTERNS.some((pattern) => pattern.test(text))) {
    return "greeting";
  }
  if (OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(text))) {
    return "off_topic";
  }
  return "question";
}
