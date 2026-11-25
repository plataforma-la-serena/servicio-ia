# servicio-ia

Motor de respuestas del bot de Alquileres 4 Esquinas (Fastify + TypeScript).
Resuelve catálogo, precios, características y políticas de forma determinística
y usa el LLM solo cuando hace falta. También decide el handoff (verde = reserva,
amarillo = atención humana).

## Comandos

```bash
npm install
npm run dev        # desarrollo con tsx watch
npm run build      # compila a dist/
npm start          # ejecuta dist/
npm run typecheck  # tsc --noEmit
npm test           # pruebas (Vitest)
npm run coverage   # pruebas + coverage/coverage-summary.json
npm run simulate   # simulador de personas contra /chat
```

## Variables de entorno

`PORT`, `LOG_LEVEL`, `NVIDIA_API_KEY`, `NIM_BASE_URL`, `NIM_MODEL`,
`NIM_TIMEOUT_MS`, `CATALOG_URL`, `RATE_LIMIT_PER_PHONE`. Ver `.env.example`.

Sin `NVIDIA_API_KEY` el servicio responde con el motor mock, sin llamar al
proveedor externo.

## Calidad

CI en `.github/workflows/ci.yml`: install → typecheck → test + coverage → build
→ auditoría de dependencias.
