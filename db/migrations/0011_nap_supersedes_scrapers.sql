-- NAP (nap-ev) tagad dod Ignitis un Eleport tarifus ar platāku parklajumu
-- neka to pasu lapu nolasisana, tapec tie avoti vairs netiek skraapeeti --
-- lieka slodze svesiem serveriem bez jebkada ieguvuma.
UPDATE sources
SET status = 'disabled',
    attribution = 'Aizstats ar nap-ev (Nacionalais piekluves punkts, CC0)'
WHERE id IN ('ignitis-ev-web', 'eleport-ev-web');

-- e-mobi no 2026-10-02 atbild 403 GitHub skrejeja adresem. No lietotaja
-- pasa tikla ta atbild 200, tatad tas ir IP limena bloks, ne robots.txt
-- lemums; pec projekta noteikuma to NEAPEJAM. NAP e-mobi tiklu nesatur,
-- tapec jau savaktie tarifi paliek ar savu isto vecumu, un lapa raada, ka
-- avots ir blokets.
UPDATE sources SET status = 'blocked' WHERE id = 'emobi-ev';
