# Repo Map

## Packages

- web-application: Next.js 14 app (name: web-starter-pack)
- internal-tools: Next.js 15 app (name: internal-tools)
- server/control-plane: Fastify service (name: rn-web-control-plane)
- server/build-workers: Fastify worker (name: rn-web-build-worker)

## Commands (from repo root)

- Install all: `npm install`
- Build all: `npm run build`
- Dev web: `npm run dev:web`
- Dev internal tools: `npm run dev:internal`
- Dev control plane: `npm run dev:cp`
- Dev worker: `npm run dev:worker`
- Typecheck all: `npm run typecheck`
- Lint all: `npm run lint`

## Env

Each app/service expects its own .env. Provide `.env.example` in:

- web-application/.env.example
- internal-tools/.env.example
- server/control-plane/.env.example
- server/build-workers/.env.example

Codex: use the root scripts above.
