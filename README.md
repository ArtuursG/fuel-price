# fuel-price

Latvijas degvielas un elektroauto uzlādes cenu salīdzinājums: lētākā cena šodien, cenu vēsture, staciju karte un kalkulatori.

| Mape | Saturs |
| --- | --- |
| `collector/` | Python kolektors, kas nolasa tīklu cenas |
| `apps/ingest/` | Cloudflare Worker, kas pieņem savāktos datus (`POST /ingest`) |
| `apps/web/` | Astro vietne |
| `db/migrations/` | D1 datubāzes shēma |

## Uzstādīšana

Vajag [uv](https://docs.astral.sh/uv/), Node.js LTS un [pnpm](https://pnpm.io/).

```bash
cd collector && uv sync && cd ..
pnpm install
```

## Pārbaudes

```bash
pnpm -r run typecheck && pnpm -r run test
cd collector && uv run ruff check . && uv run ruff format --check . && uv run pytest -q
```

## Lokāli

```bash
cd apps/web && pnpm run dev                                  # vietne
cd collector && uv run python -m collector run --all --dry-run   # cenu nolasīšana bez sūtīšanas
```
