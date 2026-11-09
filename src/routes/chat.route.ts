import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { PhoneRateLimiter } from "../lib/rate-limiter";
import type { ChatService } from "../services/chat.service";

const apartmentSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  description: z.string().max(2000),
  pricePerNight: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  features: z.array(z.string().max(120)).max(40),
});

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  phone: z.string().regex(/^\+?[0-9]{8,15}$/),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .default([]),
  apartments: z.array(apartmentSchema).max(50).default([]),
});

export interface ChatRouteDeps {
  chat: ChatService;
  limiter: PhoneRateLimiter;
}

export const chatRoutes: FastifyPluginAsync<ChatRouteDeps> = async (
  app,
  deps,
) => {
  app.post("/chat", async (request, reply) => {
    const parsed = chatSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Solicitud inválida",
        fields: parsed.error.issues.map((issue) => issue.path.join(".")),
      });
    }

    if (!deps.limiter.allow(parsed.data.phone)) {
      return reply
        .code(429)
        .send({ error: "Demasiadas consultas. Esperá un minuto." });
    }

    return deps.chat.reply(parsed.data);
  });
};
