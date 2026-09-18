-- Sākotnējā shēma. Pamatā docs/IZPETE.md 7.4 skice.
-- Atšķirība no skices: `products` tabula pievienota (ADR-007, docs/DECISIONS.md) --
-- oriģinālā skice glabāja `product` kā brīvu tekstu bez uzziņas tabulas.

CREATE TABLE networks (
  id TEXT PRIMARY KEY,                -- 'circlek', 'virsi', 'viada', 'straujupite', 'neste', 'enefit' …
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'LV',  -- LV | LT | EE
  kinds TEXT NOT NULL,                 -- 'fuel' | 'ev' | 'fuel,ev'
  website TEXT,
  publishes_prices INTEGER NOT NULL DEFAULT 1,
  note TEXT                            -- piem., Neste paziņojums
);

-- ADR-007: produktu kodu uzziņa. `is_road_legal = 0` (DSL_AGRO) nozīmē, ka lapā
-- šo produktu NEDRĪKST rādīt vienā sarakstā ar P95/P98/DSL bez skaidras atrunas.
CREATE TABLE products (
  code TEXT PRIMARY KEY,
  label_lv TEXT NOT NULL,
  label_en TEXT NOT NULL,
  unit TEXT NOT NULL,                  -- 'litre' | 'kg' | 'kwh'
  is_road_legal INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE stations (
  id TEXT PRIMARY KEY,                 -- '{network}:{avota_id vai adreses_hash}'
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
  attribution TEXT,                    -- piem., 'LEA; pirmavots: stacijas operators'
  url TEXT NOT NULL,
  status TEXT NOT NULL,                -- todo | investigate | active | blocked | unpublished | disabled
  freshness_hours INTEGER NOT NULL DEFAULT 6,
  business_days_only INTEGER NOT NULL DEFAULT 0
);

-- Katrs nolasījums (arī neveiksmīgs) - svaiguma un statusa lapas pamats.
CREATE TABLE scrape_runs (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL,                -- ok | not_modified | partial | error | blocked | unpublished
  http_status INTEGER, items INTEGER,
  content_sha256 TEXT, parser_version TEXT, error TEXT
);
CREATE INDEX idx_runs_source_time ON scrape_runs(source_id, started_at DESC);

-- Degvielas cenas: jauna rinda TIKAI tad, kad cena mainās (ADR-004).
CREATE TABLE fuel_prices (
  id INTEGER PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES networks(id),
  scope TEXT NOT NULL,                 -- 'network' | 'station' | 'cheapest_riga' | 'cheapest'
  station_id TEXT REFERENCES stations(id),
  product TEXT NOT NULL REFERENCES products(code),
  price_milli INTEGER NOT NULL,        -- 1969 = 1,969 €/l (ADR-003)
  where_text TEXT,
  valid_from TEXT,
  observed_at TEXT NOT NULL,           -- UTC, kad šī cena redzēta pirmoreiz
  local_date TEXT NOT NULL,            -- Europe/Riga datums
  run_id INTEGER REFERENCES scrape_runs(id),
  flags TEXT                           -- 'jump', 'discount_day' … (ADR-006)
);
CREATE INDEX idx_fuel_latest ON fuel_prices(network_id, scope, product, observed_at DESC);
CREATE INDEX idx_fuel_date ON fuel_prices(local_date, product);

-- EV tarifi (OCPI iedvesmots, vienkāršots).
CREATE TABLE ev_tariffs (
  id INTEGER PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES networks(id),
  station_id TEXT REFERENCES stations(id),   -- NULL = viss tīkls
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

-- Oficiālie nedēļas vidējie (EVA).
CREATE TABLE official_weekly (
  week_monday TEXT NOT NULL, merchant TEXT NOT NULL, product TEXT NOT NULL REFERENCES products(code),
  avg_price_milli INTEGER NOT NULL, source_url TEXT NOT NULL,
  PRIMARY KEY (week_monday, merchant, product)
);

-- Elektrības dienas tirgus cenas (uzlādei mājās; 6.-7. fāzes funkcija).
CREATE TABLE electricity_prices (
  zone TEXT NOT NULL,                  -- 'LV' | 'LT' | 'EE'
  start_utc TEXT NOT NULL,
  resolution_min INTEGER NOT NULL,     -- 60 vai 15
  price_milli_per_mwh INTEGER NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  PRIMARY KEY (zone, start_utc, resolution_min)
);

-- Dienas kopsavilkums: vēsture un čempionāts bez smagiem vaicājumiem.
CREATE TABLE daily_fuel (
  local_date TEXT NOT NULL, network_id TEXT NOT NULL, product TEXT NOT NULL REFERENCES products(code),
  open_milli INTEGER, close_milli INTEGER, min_milli INTEGER, max_milli INTEGER,
  is_cheapest INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (local_date, network_id, product)
);

-- Notikumi grafikiem un nodokļu tabula cenu anatomijai.
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
