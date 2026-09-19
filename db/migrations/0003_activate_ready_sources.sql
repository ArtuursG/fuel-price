-- Avoti, kas jau kopš 3./4. fāzes veiksmīgi savāc reālas cenas, joprojām bija
-- iesēti ar status='todo' -- 0002_seed.sql atspoguļoja izpētes brīdi, ne
-- produkcijas realitāti. Šis migrācijas skripts pieskaņo statusu tam, kas
-- faktiski notiek (redzams /avoti/ lapā un scrape_runs vēsturē).

UPDATE sources SET status = 'active'
WHERE id IN ('circlek-fuel-web', 'straujupite-fuel-web', 'virsi-fuel-web', 'viada-fuel-web');
