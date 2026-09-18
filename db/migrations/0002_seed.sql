-- Sākuma dati: tīkli, produkti, avoti. Iegūti no docs/sources.yaml (v3, 2026-09-18).
-- Cenu/tarifu rindas šeit NAV -- tās raksta ingest Worker (3. fāze), ne migrācija.

INSERT INTO networks (id, name, country, kinds, website, publishes_prices, note) VALUES
  ('circlek', 'Circle K', 'LV', 'fuel,ev', 'https://www.circlek.lv', 1, NULL),
  ('virsi', 'Virši', 'LV', 'fuel,ev', 'https://www.virsi.lv', 1, NULL),
  ('viada', 'Viada', 'LV', 'fuel', 'https://www.viada.lv', 1, 'Cenas neatjauno brīvdienās/svētkos'),
  ('straujupite', 'Straujupīte', 'LV', 'fuel', 'https://straujupite.lv', 1, NULL),
  ('kool', 'KOOL', 'LV', 'fuel', 'https://kool.lv', 1, 'Cenu lapa nav atrasta (Olerex grupa)'),
  ('astarte', 'Astarte-nafta', 'LV', 'fuel', 'https://astarte.lv', 1, 'Cenu lapa nav atrasta'),
  ('gotika', 'Gotika', 'LV', 'fuel', 'https://www.gotikaauto.lv', 1, 'robots.txt aizliedz visu lapu'),
  ('neste', 'Neste', 'LV', 'fuel,ev', 'https://www.neste.lv', 0, 'Degvielas cenas nepublicē kopš 2026-08-10'),
  ('ignitis', 'Ignitis ON', 'LV', 'ev', 'https://ignitison.lv', 1, NULL),
  ('enefit', 'Enefit', 'LV', 'ev', 'https://www.enefit.lv', 1, NULL),
  ('eleport', 'Eleport', 'LV', 'ev', 'https://eleport.com', 1, NULL),
  ('emobi', 'e-mobi', 'LV', 'ev', 'https://e-mobi.lv', 1, 'CSDD tīkls'),
  ('elektrum', 'Elektrum Drive', 'LV', 'ev', 'https://www.elektrum.lv', 1, NULL);

INSERT INTO products (code, label_lv, label_en, unit, is_road_legal) VALUES
  ('P95', '95. markas benzīns', 'Petrol 95', 'litre', 1),
  ('P98', '98. markas benzīns', 'Petrol 98', 'litre', 1),
  ('DSL', 'Dīzeļdegviela', 'Diesel', 'litre', 1),
  ('DSL_PLUS', 'Premium dīzeļdegviela', 'Premium diesel', 'litre', 1),
  ('DSL_AGRO', 'Marķētā (agro) dīzeļdegviela', 'Marked (agricultural) diesel', 'litre', 0),
  ('LPG', 'Autogāze (LPG)', 'LPG', 'litre', 1),
  ('CNG', 'Saspiestā dabasgāze (CNG)', 'CNG', 'kg', 1),
  ('HVO', 'HVO (atjaunojamā dīzeļdegviela)', 'HVO renewable diesel', 'litre', 1),
  ('ADBLUE', 'AdBlue', 'AdBlue', 'litre', 1),
  ('E85', 'E85 (etanola degviela)', 'E85 ethanol fuel', 'litre', 1);

INSERT INTO sources (id, network_id, kind, source_type, attribution, url, status, freshness_hours, business_days_only) VALUES
  ('circlek-fuel-web', 'circlek', 'fuel', 'official_site', NULL, 'https://www.circlek.lv/degviela-miles/degvielas-cenas', 'todo', 36, 0),
  ('circlek-ev', 'circlek', 'ev', 'official_site', NULL, 'https://www.circlek.lv/elektrouzlade', 'disabled', 744, 0),
  ('virsi-fuel-web', 'virsi', 'fuel', 'official_site', NULL, 'https://www.virsi.lv/lv/privatpersonam/degviela/degvielas-un-elektrouzlades-cenas', 'todo', 36, 1),
  ('virsi-ev-web', 'virsi', 'ev', 'official_site', NULL, 'https://www.virsi.lv/lv/privatpersonam/degviela/degvielas-un-elektrouzlades-cenas', 'todo', 36, 0),
  ('viada-fuel-web', 'viada', 'fuel', 'official_site', NULL, 'https://www.viada.lv/zemakas-degvielas-cenas/', 'todo', 30, 1),
  ('straujupite-fuel-web', 'straujupite', 'fuel', 'official_site', NULL, 'https://straujupite.lv/degvielas-cenas/', 'todo', 36, 0),
  ('kool-fuel-web', 'kool', 'fuel', 'official_site', NULL, 'https://kool.lv/', 'investigate', 168, 0),
  ('astarte-fuel-web', 'astarte', 'fuel', 'official_site', NULL, 'https://astarte.lv', 'investigate', 168, 0),
  ('gotika-fuel-web', 'gotika', 'fuel', 'official_site', NULL, 'https://www.gotikaauto.lv', 'blocked', 168, 0),
  ('neste-fuel-web', 'neste', 'fuel', 'official_site', NULL, 'https://www.neste.lv/en/node/1177', 'unpublished', 168, 0),
  ('enefit-ev-web', 'enefit', 'ev', 'official_site', NULL, 'https://www.enefit.lv/lv/majai/elektroauto-uzlade/publiska-uzlade', 'blocked', 36, 0),
  ('ignitis-ev-web', 'ignitis', 'ev', 'official_site', NULL, 'https://ignitison.lv/cenas', 'todo', 36, 0),
  ('eleport-ev-web', 'eleport', 'ev', 'official_site', NULL, 'https://eleport.com/lv/', 'investigate', 36, 0),
  ('emobi-ev', 'emobi', 'ev', 'official_site', NULL, 'https://e-mobi.lv/api/stations', 'todo', 6, 0),
  ('neste-ev', 'neste', 'ev', 'official_site', NULL, 'https://www.neste.lv/', 'investigate', 36, 0),
  ('elektrum-ev', 'elektrum', 'ev', 'official_site', NULL, 'https://www.elektrum.lv/en/for-home/elektrum-drive/public-charging/', 'investigate', 36, 0),
  ('eva-weekly', NULL, 'official', 'official_aggregate', NULL, 'https://data.gov.lv/dati/dataset/videjas_cenas', 'investigate', 192, 0),
  ('csp-monthly', NULL, 'official', 'official_aggregate', NULL, 'https://stat.gov.lv/', 'investigate', 744, 0),
  ('em-monitoring', NULL, 'official', 'official_aggregate', NULL, 'https://www.em.gov.lv/lv/jaunums/ekonomikas-ministrija-izstradajusi-operativo-degvielas-cenu-monitoringa-riku', 'disabled', 744, 0),
  ('tax-rates', NULL, 'official', 'official_register', NULL, 'https://likumi.lv/ta/id/81066-par-akcizes-nodokli', 'todo', 8760, 0),
  ('lt-lea-stations', NULL, 'official', 'official_register', 'Avots: LEA; pirmavots: degvielas stacijas operators', 'https://degalukainos.ena.lt/', 'investigate', 24, 0),
  ('eu-weekly-oil-bulletin', NULL, 'official', 'official_aggregate', NULL, 'https://energy.ec.europa.eu/document/download/264c2d0f-f161-4ea3-a777-78faae59bea0_en?filename=Weekly%20Oil%20Bulletin%20Weekly%20prices%20with%20Taxes%20-%202024-02-19.xlsx', 'todo', 192, 0),
  ('elering-nps', NULL, 'electricity', 'official_register', NULL, 'https://dashboard.elering.ee/api/nps/price', 'investigate', 24, 0),
  ('entsoe-dayahead', NULL, 'electricity', 'official_register', NULL, 'https://transparency.entsoe.eu/', 'investigate', 24, 0),
  ('nap-ev', NULL, 'ev', 'official_register', NULL, 'https://www.transportdata.gov.lv/lv/card/978835ee-f55b-481c-9791-ba0395d3619a', 'investigate', 24, 0);
