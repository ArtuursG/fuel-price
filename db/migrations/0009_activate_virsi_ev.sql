-- Viršu uzlādes tarifi nolasīti no tās pašas lapas, kas degvielas cenas
-- (robots.txt atļauj), un parsētāja rezultāts pārbaudīts pret dzīvu avotu:
-- CCS2 piecas jaudas pakāpes, CHAdeMO viena.
UPDATE sources SET status = 'active' WHERE id = 'virsi-ev-web';
