-- eu-weekly-oil-bulletin verified working in production 2026-09-19 (9 rows
-- written to official_weekly on first run) -- same staleness as 0003, this
-- source was still seeded with status='todo'.

UPDATE sources SET status = 'active' WHERE id = 'eu-weekly-oil-bulletin';
