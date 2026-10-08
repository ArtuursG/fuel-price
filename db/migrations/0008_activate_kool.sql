-- The KOOL price page is collected and the parser output was checked against
-- the live source (P95, P98, DSL, DSL_PLUS), so the source is past the research stage.
UPDATE sources SET status = 'active' WHERE id = 'kool-fuel-web';
