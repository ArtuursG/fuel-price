-- KOOL cenu lapa nolasīta un parsētāja rezultāts pārbaudīts pret dzīvu
-- avotu (P95, P98, DSL, DSL_PLUS), tāpēc avots vairs nav izpētes stadijā.
UPDATE sources SET status = 'active' WHERE id = 'kool-fuel-web';
