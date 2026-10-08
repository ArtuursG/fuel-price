-- Sources that have been collecting real prices since phase 3/4 were still
-- seeded with status='todo' -- 0002_seed.sql reflected the research stage,
-- not production. This migration aligns the status with what actually
-- happens (visible on the /avoti/ page and in the scrape_runs history).

UPDATE sources SET status = 'active'
WHERE id IN ('circlek-fuel-web', 'straujupite-fuel-web', 'virsi-fuel-web', 'viada-fuel-web');
