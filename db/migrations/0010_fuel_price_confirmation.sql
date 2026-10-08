-- A price row is still written only when the price changes (ADR-004). These
-- two columns record when a later run found the same price again, and the
-- date the source itself gave for it at that time, so the site can tell
-- "unchanged and checked today" from "not seen for weeks" without adding rows.
ALTER TABLE fuel_prices ADD COLUMN confirmed_at TEXT;
ALTER TABLE fuel_prices ADD COLUMN confirmed_valid_from TEXT;
