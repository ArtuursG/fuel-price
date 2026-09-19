# fuel-price

Latvijas degvielas un elektroauto uzlādes cenu monitors.

## Priekšnosacījumi

- [uv](https://docs.astral.sh/uv/) (Python 3.12+ pārvaldībai)
- Node.js LTS un [pnpm](https://pnpm.io/) (`npm install -g pnpm`, ja nav)
- Git

## Uzstādīšana

```bash
# Python kolektors
cd collector && uv sync && cd ..

# TypeScript daļa (apps/ingest, apps/web)
pnpm install
```

## Testi un linteri

```bash
# Python
cd collector
uv run pytest -q
uv run ruff check .
uv run ruff format --check .

# TypeScript (no repo saknes)
pnpm -r run typecheck
pnpm -r run test
```

## Kolektora CLI

```bash
uv run python -m collector run --all --dry-run
uv run python -m collector check --source <avota-id>
uv run python -m collector snapshot --source <avota-id>
```

Ieviesti Circle K, Straujupītes, Viršu un Viadas degvielas kolektori, e-mobi, Ignitis ON un Eleport EV kolektori, kā arī EK Weekly Oil Bulletin imports.

## Lokālā izstrāde (Cloudflare Workers/D1)

```bash
cd apps/ingest && pnpm run dev   # wrangler dev
cd apps/web && pnpm run dev      # astro dev
```

**Zināma problēma uz Windows:** `wrangler dev`, `wrangler d1 migrations apply --local` un
`@cloudflare/vitest-pool-workers` visi spawnē native `workerd` bināro failu. Uz vairākiem Windows datoriem
Application Control politika (Smart App Control vai līdzīga) šo bloķē. Ja tas skar arī tavu vidi, D1/Workers-
vides pārbaudes notiek CI (`.github/workflows/ci.yml`, Ubuntu skrējēji).

## Struktūra

```
collector/       Python kolektors (uv projekts)
apps/ingest/      TypeScript Worker: POST /ingest, cron, uzraugs (Hono)
apps/web/         Astro lapa + publiskais API
db/migrations/    D1 SQL migrācijas (kopīgas abiem Workers)
```
