-- Initial schema. Based on the docs/IZPETE.md 7.4 sketch.
-- Difference from the sketch: a `products` table was added (ADR-007, docs/DECISIONS.md) --
-- the original sketch stored `product` as free text with no lookup table.

CREATE TABLE networks (
  id TEXT PRIMARY KEY,                -- 'circlek', 'virsi', 'viada', 'straujupite', 'neste', 'enefit' …
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'LV',  -- LV | LT | EE
  kinds TEXT NOT NULL,                 -- 'fuel' | 'ev' | 'fuel,ev'
  website TEXT,
  publishes_prices INTEGER NOT NULL DEFAULT 1,
  note TEXT                            -- e.g. Neste's announcement
);

-- ADR-007: product code lookup. `is_road_legal = 0` (DSL_AGRO) means the site
-- MUST NOT show this product in one list with P95/P98/DSL without a clear disclaimer.
CREATE TABLE products (
  code TEXT PRIMARY KEY,
  label_lv TEXT NOT NULL,
  label_en TEXT NOT NULL,
  unit TEXT NOT NULL,                  -- 'litre' | 'kg' | 'kwh'
  is_road_legal INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE stations (
  id TEXT PRIMARY KEY,                 -- '{network}:{source_id or address_hash}'
  network_id TEXT NOT NULL REFERENCES networks(id),
  country TEXT NOT NULL DEFAULT 'LV',
  name TEXT, address TEXT, city TEXT, municipality TEXT,
  lat REAL, lon REAL, osm_id TEXT,
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,                 -- 'circlek-fuel-web'
  network_id TEXT REFERENCES networks(id),
  kind TEXT NOT NULL,                  -- 'fuel' | 'ev' | 'official' | 'electricity'
  source_type TEXT NOT NULL,           -- official_site | official_register | official_aggregate | crowd
  attribution TEXT,                    -- e.g. 'LEA; primary source: station operator'
  url TEXT NOT NULL,
  status TEXT NOT NULL,                -- todo | investigate | active | blocked | unpublished | disabled
  freshness_hours INTEGER NOT NULL DEFAULT 6,
  business_days_only INTEGER NOT NULL DEFAULT 0
);

-- Every collection run (failed ones too) - the basis for freshness and the status page.
CREATE TABLE scrape_runs (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL,                -- ok | not_modified | partial | error | blocked | unpublished
  http_status INTEGER, items INTEGER,
  content_sha256 TEXT, parser_version TEXT, error TEXT
);
CREATE INDEX idx_runs_source_time ON scrape_runs(source_id, started_at DESC);

-- Fuel prices: a new row ONLY when the price changes (ADR-004).
CREATE TABLE fuel_prices (
  id INTEGER PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES networks(id),
  scope TEXT NOT NULL,                 -- 'network' | 'station' | 'cheapest_riga' | 'cheapest'
  station_id TEXT REFERENCES stations(id),
  product TEXT NOT NULL REFERENCES products(code),
  price_milli INTEGER NOT NULL,        -- 1969 = 1,969 €/l (ADR-003)
  where_text TEXT,
  valid_from TEXT,
  observed_at TEXT NOT NULL,           -- UTC, when this price was first seen
  local_date TEXT NOT NULL,            -- Europe/Riga date
  run_id INTEGER REFERENCES scrape_runs(id),
  flags TEXT                           -- 'jump', 'discount_day' … (ADR-006)
);
CREATE INDEX idx_fuel_latest ON fuel_prices(network_id, scope, product, observed_at DESC);
CREATE INDEX idx_fuel_date ON fuel_prices(local_date, product);

-- EV tariffs (inspired by OCPI, simplified).
CREATE TABLE ev_tariffs (
  id INTEGER PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES networks(id),
  station_id TEXT REFERENCES stations(id),   -- NULL = whole network
  current_type TEXT NOT NULL,          -- AC | DC
  power_min_kw REAL, power_max_kw REAL,
  connector TEXT,                      -- CCS2 | CHADEMO | TYPE2 | NULL
  payment TEXT NOT NULL,               -- adhoc | app | subscription
  energy_milli_per_kwh INTEGER,
  time_milli_per_min INTEGER,
  session_fee_milli INTEGER, min_fee_milli INTEGER,
  idle_fee_milli_per_min INTEGER, idle_after_min INTEGER,
  time_from TEXT, time_to TEXT, weekdays TEXT,
  vat_included INTEGER NOT NULL DEFAULT 1,
  tariff_hash TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  run_id INTEGER REFERENCES scrape_runs(id)
);

-- Official weekly averages (EVA).
CREATE TABLE official_weekly (
  week_monday TEXT NOT NULL, merchant TEXT NOT NULL, product TEXT NOT NULL REFERENCES products(code),
  avg_price_milli INTEGER NOT NULL, source_url TEXT NOT NULL,
  PRIMARY KEY (week_monday, merchant, product)
);

-- Day-ahead electricity prices (for home charging; a phase 6-7 feature).
CREATE TABLE electricity_prices (
  zone TEXT NOT NULL,                  -- 'LV' | 'LT' | 'EE'
  start_utc TEXT NOT NULL,
  resolution_min INTEGER NOT NULL,     -- 60 or 15
  price_milli_per_mwh INTEGER NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  PRIMARY KEY (zone, start_utc, resolution_min)
);

-- Daily summary: history and rankings without heavy queries.
CREATE TABLE daily_fuel (
  local_date TEXT NOT NULL, network_id TEXT NOT NULL, product TEXT NOT NULL REFERENCES products(code),
  open_milli INTEGER, close_milli INTEGER, min_milli INTEGER, max_milli INTEGER,
  is_cheapest INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (local_date, network_id, product)
);

-- Events for charts and a tax table for the price breakdown.
CREATE TABLE events (
  id INTEGER PRIMARY KEY, local_date TEXT NOT NULL,
  type TEXT NOT NULL,                  -- discount_day | tax_change | publishing_change | note
  network_id TEXT, title TEXT NOT NULL, url TEXT
);

CREATE TABLE tax_rates (
  product TEXT NOT NULL REFERENCES products(code),
  excise_cents_per_1000l INTEGER,
  vat_bp INTEGER,                      -- 2100 = 21%
  valid_from TEXT NOT NULL, valid_to TEXT,
  source_url TEXT NOT NULL,
  PRIMARY KEY (product, valid_from)
);
