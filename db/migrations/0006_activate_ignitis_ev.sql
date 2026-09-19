-- ignitis-ev-web verified working in production 2026-09-19 (220 LV stations,
-- 337 ev_tariffs rows written on first run). Same staleness as 0003-0005.

UPDATE sources SET status = 'active' WHERE id = 'ignitis-ev-web';
