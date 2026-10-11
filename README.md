# fuel-price

Fuel and EV charging price comparison for Latvia: today's cheapest price per
product, price history, a station map and cost calculators.

**Live: [fuel-price-web.jkedainis.workers.dev](https://fuel-price-web.jkedainis.workers.dev)**

## Layout

| Path | Contents |
| --- | --- |
| `collector/` | Python collector; one module per source, pure parsers plus a CLI |
| `apps/ingest/` | Cloudflare Worker accepting collected data (`POST /ingest`) |
| `apps/web/` | Astro site, server-rendered on Workers |
| `db/migrations/` | D1 schema and data migrations, applied in filename order |

Data flows one way: the collector parses a source, posts a signed batch to the
ingest Worker, and the Worker writes to D1. The site only reads D1.

## Requirements

- [uv](https://docs.astral.sh/uv/) (Python 3.12 toolchain)
- Node.js LTS and [pnpm](https://pnpm.io/)
- A Cloudflare account with Workers and D1, and `wrangler` authenticated

## Setup

```bash
cd collector && uv sync && cd ..
pnpm install
```

## Configuration

Copy `.dev.vars.example` to `.dev.vars` and fill it in. The file is gitignored
and is read from either the repository root or `collector/`, the latter taking
precedence. Real environment variables always win over the file.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `INGEST_URL` | collector | Where to post batches |
| `INGEST_SECRET` | collector, ingest | HMAC signing key for `POST /ingest` |
| `NAP_EV_INFRA_ECO_KEY` | collector | National access point, charging infrastructure dataset |
| `NAP_EV_STATUS_KEY` | collector | National access point, status and price dataset |
| `TELEGRAM_BOT_TOKEN` | monitor | Optional; without it alerts go to the log |
| `TELEGRAM_CHAT_ID` | monitor | Optional, as above |

In production the Worker secrets are set with `wrangler secret put <NAME>`, and
the collector reads the same names from GitHub Actions secrets. Never commit
values.

The two `NAP_*` keys come from a free subscription at
[transportdata.gov.lv](https://www.transportdata.gov.lv): register, subscribe to
the two charging datasets, and each one issues its own key.

## Checks

```bash
pnpm -r run typecheck && pnpm -r run test
cd collector && uv run ruff check . && uv run ruff format --check . && uv run pytest -q
```

Both run in CI on every push; the same commands are what CI executes.

## Local development

```bash
cd apps/web && pnpm run dev
cd collector && uv run python -m collector run --all --dry-run
```

`--dry-run` prints the batch as JSON and sends nothing. Replace it with `--push`
to post to `INGEST_URL`.

Note: `wrangler dev` and the Workers vitest pool need the `workerd` binary,
which some Windows installations block through Application Control. Where that
applies, Worker routes are verified against a deployment rather than locally.

## Database

```bash
cd apps/ingest && pnpm exec wrangler d1 migrations apply fuel-price-db --remote
```

Migrations are numbered and applied in order; already applied files are skipped.
Prices are stored only when they change, so a row in `fuel_prices` or
`ev_tariffs` marks a change, not a check. Every run, successful or not, writes a
row to `scrape_runs`, which is what the freshness indicators and the sources
page read.

## Collection

| Command | Source |
| --- | --- |
| `run --all` | All active fuel sources |
| `official-weekly` | EU weekly oil bulletin |
| `nap-ev` | National access point: charging stations and prices |
| `virsi-ev` | Virsi charging tariffs |

Each takes `--dry-run` or `--push`. The `Collect` workflow runs fuel sources
every 30 minutes and the rest once a day. Each source is a separate step that
cannot stop the others, and a final step fails the job naming whichever source
failed.

## Data sources

Fuel prices come from each network's own public price page. EV charging comes
from the national access point, which publishes DATEX II 3.4 under CC0 and
covers Elektrum Drive, Ignitis ON, Enefit Volt and Eleport in one feed; Virsi
charging tariffs come from their own page, as that feed does not price them.

`docs/sources.yaml` is the registry: every source with its URL, licence,
robots.txt status, access method and current state. It is kept out of version
control and is the first place to look before adding or changing a source.

Sources that block automated access are marked and left alone. Nothing in this
repository works around robots.txt, bot protection or address level blocks.

## Station map

`/karte/` combines OpenStreetMap fuel locations with EV stations from D1. It
offers search, network and fuel filters, EV connector and power filters,
clustered markers and a matching station list.

A price is attached to a specific station only where the operator names an exact
address and it matches an OSM street, house number and city. A network minimum
is never attributed to an individual station. EV tariffs are observations with
source links, units and extra charges, not live availability.

Without JavaScript the first 30 stations remain as a list, and if the map fails
to load search and the list still work. MapLibre 5.9.0 loads from a CDN and
tiles come from OpenFreeMap, so the interactive map depends on those being
reachable.

Fuel locations live in `apps/web/public/data/fuel-stations.json` under ODbL,
with the source reference and retrieval date. To refresh from the repository
root:

```bash
uv run --project collector python collector/scripts/update_fuel_map.py
```

This rewrites the location file locally only; an empty or malformed result does
not replace the previous file. The refreshed file reaches the public site on the
next deployment.

## Deployment

```bash
cd apps/web && pnpm exec wrangler deploy
cd apps/ingest && pnpm exec wrangler deploy
```

Pushing to the default branch also deploys through the `Deploy` workflow.
