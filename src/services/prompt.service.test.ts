import { describe, expect, it } from "vitest";
import type { ApartmentContext } from "../types";
import { buildSystemPrompt } from "./prompt.service";

const apartments: ApartmentContext[] = [
  {
    id: "a1",
    title: "Carlo Magno Piso 1",
    description: "Con cocina equipada.",
    pricePerNight: 66000,
    capacity: 5,
    features: ["Wi-Fi", "Balcón"],
  },
];

describe("buildSystemPrompt", () => {
  it("incluye los departamentos reales con precio y capacidad", () => {
    const prompt = buildSystemPrompt(apartments, "https://sitio.test");

    expect(prompt).toContain("Alquileres 4 Esquinas");
    expect(prompt).toContain("Carlo Magno Piso 1");
    expect(prompt).toContain("66.000");
    expect(prompt).toContain("hasta 5 personas");
  });

  it("avisa cuando no hay departamentos publicados", () => {
    const prompt = buildSystemPrompt([], "https://sitio.test");
    expect(prompt).toContain("No hay departamentos publicados");
  });
});
