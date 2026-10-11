-- Latvijas Nacionalais piekluves punkts (transportdata.gov.lv). Avots jau
-- bija iesets ka "investigate" ar norādi uz kartites lapu; tagad abonements
-- ir, un nolasisana strada.
--
-- Divas DATEX II 3.4 datu kopas ar CC0 licenci: infrastruktura dod vietas,
-- operatorus un savienotajus reizi diena, statuss -- cenas ik 15 minutes.
-- Tas savienojas pec EVSE identifikatora (sk. sources/ev/nap.py).
--
-- network_id paliek NULL: atskiriba no parejiem avotiem, sis viens nes
-- vairakus tiklus (Elektrum, Ignitis, Enefit, Eleport).
UPDATE sources
SET status = 'active',
    url = 'https://www.transportdata.gov.lv/api/v1/get/file/download-file',
    attribution = 'Latvijas Nacionalais piekluves punkts (transportdata.gov.lv), dati no Eco-Movement, CC0',
    freshness_hours = 26
WHERE id = 'nap-ev';
