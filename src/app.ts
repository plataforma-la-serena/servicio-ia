import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config";
import { PhoneRateLimiter } from "./lib/rate-limiter";
import { chatRoutes } from "./routes/chat.route";
import { ChatService } from "./services/chat.service";
import { createLlmClient } from "./services/llm.service";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.logLevel } });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  const llm = createLlmClient(config);
  const chat = new ChatService(llm, config);
  const limiter = new PhoneRateLimiter(config.rateLimitPerPhone);

  app.get("/health", async () => ({
    ok: true,
    service: "servicio-ia",
    model: llm?.model ?? "mock",
  }));

  await app.register(chatRoutes, { chat, limiter });
  return app;
}
