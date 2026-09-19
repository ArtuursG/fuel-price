-- eleport-ev-web verified working in production 2026-09-19 (2 network-wide
-- ev_tariffs rows written: AC 0.320 EUR/kWh, DC+ 0.390 EUR/kWh). Same
-- staleness as 0003-0006.

UPDATE sources SET status = 'active' WHERE id = 'eleport-ev-web';
