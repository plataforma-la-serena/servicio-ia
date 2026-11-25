import { describe, expect, it } from "vitest";
import { detectIntent, normalize } from "./guardrail.service";

describe("normalize", () => {
  it("quita acentos y pasa a minúsculas", () => {
    expect(normalize("  ¿DÓNDE Está el FARO?  ")).toBe("¿donde esta el faro?");
  });
});

describe("detectIntent", () => {
  it("detecta saludos", () => {
    expect(detectIntent("Hola, buenas tardes")).toBe("greeting");
    expect(detectIntent("holi")).toBe("greeting");
  });

  it("detecta intención de reserva", () => {
    expect(detectIntent("quiero reservar para enero")).toBe("reservation");
    expect(detectIntent("me interesa el departamento")).toBe("reservation");
    expect(detectIntent("te paso el dni")).toBe("reservation");
  });

  it("detecta temas ajenos", () => {
    expect(detectIntent("contame un chiste")).toBe("off_topic");
    expect(detectIntent("¿quién ganó las elecciones?")).toBe("off_topic");
  });

  it("el resto son consultas", () => {
    expect(detectIntent("¿tiene cocina?")).toBe("question");
    expect(detectIntent("¿dónde queda el faro?")).toBe("question");
  });
});
