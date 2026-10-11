-- Elektrum tarifi tagad nak no nap-ev (882 no 1927 tiklas rindam), tapec
-- atsevisks avots vairs nav petams. Ta pasa API, ko agrak izmantoja blakus
-- projekts, no 2026-10-11 atbild 451 ari no Latvijas.
UPDATE sources
SET status = 'disabled',
    attribution = 'Aizstats ar nap-ev (Nacionalais piekluves punkts, CC0)'
WHERE id = 'elektrum-ev';
