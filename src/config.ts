export interface AppConfig {
  port: number;
  logLevel: string;
  nvidiaApiKey: string;
  nimBaseUrl: string;
  nimModel: string;
  nimTimeoutMs: number;
  catalogUrl: string;
  rateLimitPerPhone: number;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3002),
    logLevel: process.env.LOG_LEVEL ?? "info",
    nvidiaApiKey: process.env.NVIDIA_API_KEY ?? "",
    nimBaseUrl: process.env.NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
    nimModel: process.env.NIM_MODEL ?? "meta/llama-3.1-70b-instruct",
    nimTimeoutMs: Number(process.env.NIM_TIMEOUT_MS ?? 20000),
    catalogUrl: process.env.CATALOG_URL ?? "http://localhost:3000",
    rateLimitPerPhone: Number(process.env.RATE_LIMIT_PER_PHONE ?? 10),
  };
}
