-- emobi-ev verified working in production 2026-09-19 (370 stations, 1239
-- ev_tariffs rows written on first run, split correctly between the emobi
-- and elektrum networks). Same staleness as 0003/0004.

UPDATE sources SET status = 'active' WHERE id = 'emobi-ev';
