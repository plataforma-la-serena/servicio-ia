import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config";
import type { ApartmentContext, ChatRequest } from "../types";
import { ChatService } from "./chat.service";

const config: AppConfig = {
  port: 3002,
  logLevel: "silent",
  nvidiaApiKey: "",
  nimBaseUrl: "https://integrate.api.nvidia.com/v1",
  nimModel: "mock",
  nimTimeoutMs: 1000,
  catalogUrl: "https://alquileres4esquinas.com",
  rateLimitPerPhone: 10,
};

const apartments: ApartmentContext[] = [
  {
    id: "a1",
    title: "Carlo Magno Piso 1",
    description: "Departamento con cocina equipada y balcón.",
    pricePerNight: 66000,
    capacity: 5,
    features: ["Wi-Fi", "Cocina equipada", "Balcón"],
  },
  {
    id: "a2",
    title: "Dto. Bernarda",
    description: "Luminoso y con estacionamiento.",
    pricePerNight: 60000,
    capacity: 4,
    features: ["Wi-Fi", "Estacionamiento"],
  },
];

function request(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    message: "hola",
    phone: "+5492615555555",
    history: [],
    apartments,
    source: "text",
    ...overrides,
  };
}

const chat = new ChatService(null, config);

describe("ChatService.reply", () => {
  it("saluda y comparte el catálogo", async () => {
    const result = await chat.reply(request());
    expect(result.intent).toBe("greeting");
    expect(result.reply).toContain(config.catalogUrl);
  });

  it("pide confirmación antes de derivar a una persona", async () => {
    const result = await chat.reply(
      request({ message: "quiero hablar con una persona" }),
    );
    expect(result.wantsHuman).toBe(false);
    expect(result.reply).toContain("¿Querés que le avise a una persona");
  });

  it("marca wantsHuman cuando el cliente confirma la derivación", async () => {
    const result = await chat.reply(
      request({
        message: "sí",
        history: [
          {
            role: "assistant",
            content:
              "Claro. ¿Querés que le avise a una persona del equipo para que te escriba por acá?",
          },
        ],
      }),
    );
    expect(result.wantsHuman).toBe(true);
  });

  it("detecta intención de reserva y pide el nombre", async () => {
    const result = await chat.reply(request({ message: "quiero reservar" }));
    expect(result.wantsReservation).toBe(true);
    expect(result.handoff).toBe(false);
    expect(result.reply.toLowerCase()).toContain("nombre");
  });

  it("responde precios desde el catálogo sin inventar", async () => {
    const result = await chat.reply(
      request({ message: "¿cuánto sale la noche?" }),
    );
    expect(result.reply).toContain("66.000");
    expect(result.reply).toContain("Carlo Magno");
  });

  it("incluye el enlace del catálogo cuando piden departamentos", async () => {
    const result = await chat.reply(
      request({ message: "mostrame los departamentos" }),
    );
    expect(result.reply).toContain(config.catalogUrl);
  });

  it("no inventa políticas: deriva al equipo", async () => {
    const result = await chat.reply(
      request({ message: "¿cuánto es el depósito?" }),
    );
    expect(result.reply).toContain("El equipo lo confirma");
  });

  it("extrae el nombre explícito y deriva la reserva", async () => {
    const result = await chat.reply(
      request({
        message: "me llamo Juan Pérez",
        history: [
          {
            role: "assistant",
            content: "Para la reserva necesito tu nombre completo.",
          },
        ],
      }),
    );
    expect(result.customerName).toBe("Juan Pérez");
    expect(result.wantsReservation).toBe(true);
    expect(result.handoff).toBe(true);
  });

  it("pide confirmación del nombre cuando llega por audio", async () => {
    const result = await chat.reply(
      request({
        message: "me llamo Ana Díaz",
        source: "audio",
        history: [
          {
            role: "assistant",
            content: "Para la reserva necesito tu nombre completo.",
          },
        ],
      }),
    );
    expect(result.customerName).toBe("Ana Díaz");
    expect(result.reply).toContain("Escuché «Ana Díaz»");
    expect(result.handoff).toBe(false);
  });

  it("confirma el nombre pendiente cuando el cliente dice que sí", async () => {
    const result = await chat.reply(
      request({
        message: "sí",
        history: [
          {
            role: "assistant",
            content:
              "Escuché «Ana Diaz». ¿Está bien tu nombre? Si es correcto, decime «sí».",
          },
        ],
      }),
    );
    expect(result.customerName).toBe("Ana Diaz");
    expect(result.handoff).toBe(true);
  });

  it("acepta la corrección del nombre pendiente", async () => {
    const result = await chat.reply(
      request({
        message: "no, es Ana Díaz",
        history: [
          {
            role: "assistant",
            content: "Escuché «Ana Diaz». ¿Está bien tu nombre?",
          },
        ],
      }),
    );
    expect(result.customerName).toBe("Ana Díaz");
    expect(result.handoff).toBe(true);
  });

  it("vuelve a pedir el nombre si el cliente niega", async () => {
    const result = await chat.reply(
      request({
        message: "no",
        history: [
          {
            role: "assistant",
            content: "Escuché «Ana Diaz». ¿Está bien tu nombre?",
          },
        ],
      }),
    );
    expect(result.reply).toBe("Escribime tu nombre completo, por favor.");
    expect(result.customerName).toBe("Ana Diaz");
  });

  it("clasifica temas ajenos al negocio", async () => {
    const result = await chat.reply(
      request({ message: "¿quién ganó el partido de fútbol?" }),
    );
    expect(result.intent).toBe("off_topic");
  });
});
