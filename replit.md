# Inventario Familiar

Una aplicación privada y sencilla en español para administrar productos, inventario, ventas y reportes de un pequeño negocio familiar.

## Run & Operate

- `supabase start` — levanta Supabase local (Postgres + Auth) vía Docker
- `pnpm --filter @workspace/api-server run dev` — API server (puerto 5000, ver `.env`)
- `pnpm --filter @workspace/inventario-familiar run dev` — web (Vite, ver `.env`)
- `pnpm run typecheck` — typecheck de todos los paquetes
- `pnpm run build` — typecheck + build de todos los paquetes

Cada artifact lee su propia `.env` (copia desde `.env.example`).
El schema de DB se pushea con `pnpm --filter @workspace/db run push` usando `DATABASE_URL`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React 19 + Vite + Tailwind 4 + React Query (wouter para rutas)
- API: Express 5
- Auth: Supabase Auth (JWKS), la API valida el JWT de acceso
- DB: PostgreSQL vía Supabase + Drizzle ORM
- Validación: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (desde OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server` — API Express; `src/middlewares/requireAuth.ts` valida el token de Supabase
- `artifacts/inventario-familiar` — app web React; `src/lib/supabase.ts` y `src/lib/auth.tsx` manejan la sesión
- `lib/db` — schema de Drizzle (fuente de verdad de la DB)
- `lib/api-spec/openapi.yaml` — contrato de la API
- `lib/api-client-react` — clientes React generados (Orval)
- `lib/api-zod` — schemas Zod generados
- `supabase/config.toml` — configuración de Supabase local

## Product

- Autenticación con correo/contraseña (Supabase Auth)
- Registro de productos con costo, precio, stock y aviso de surtido
- Movimientos de inventario y ventas con actualización de existencias
- Dashboard con métricas del negocio y reportes de inventario y ventas

## Gotchas

- Supabase local firma los JWT de acceso con ES256 vía JWKS; la API verifica contra
  `SUPABASE_URL/auth/v1/.well-known/jwks.json`, no contra un secret estático.
- La web en dev usa un proxy Vite para `/api` (ver `API_PROXY_TARGET` en el `.env` del frontend).
- `pnpm-workspace.yaml` mantiene los binarios nativos `darwin-arm64` para correr en macOS.

## Pointers

- Ver el `pnpm-workspace` skill para la estructura del workspace.
