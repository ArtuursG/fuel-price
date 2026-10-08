-- Virši charging tariffs are read from the same page as the fuel prices
-- (robots.txt allows it), and the parser output was checked against the live
-- source: five CCS2 power tiers, one CHAdeMO.
UPDATE sources SET status = 'active' WHERE id = 'virsi-ev-web';
