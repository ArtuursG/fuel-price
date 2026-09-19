export interface MapTariff {
  connector: string | null;
  power: number | null;
  current: string;
  payment: string;
  energy: number | null;
  time: number | null;
  session: number | null;
  minimum: number | null;
  idle: number | null;
  idleAfter: number | null;
  timeFrom: string | null;
  timeTo: string | null;
  weekdays: string | null;
  vatIncluded: boolean;
  observedAt: string;
  checkedAt: string | null;
  sourceUrl: string | null;
}

export interface MapStation {
  id: string;
  kind: "fuel" | "ev";
  network: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  products: string[];
  sourceUrl: string | null;
  updatedAt: string | null;
  tariffs: MapTariff[];
}

export interface StationFilters {
  kind: string;
  network: string;
  query: string;
  product: string;
  connector: string;
  power: number;
}

const searchText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("lv");

export function filterStations(stations: MapStation[], filters: StationFilters): MapStation[] {
  const query = searchText(filters.query.trim());
  return stations.filter((station) => {
    if (filters.kind && station.kind !== filters.kind) return false;
    if (filters.network && station.network !== filters.network) return false;
    if (query && !searchText(`${station.name} ${station.network} ${station.address}`).includes(query)) return false;
    if (filters.product && (station.kind !== "fuel" || !station.products.includes(filters.product))) return false;
    // Both connector and power must match the SAME outlet, not different outlets at a site.
    if (filters.connector || filters.power > 0) {
      if (station.kind !== "ev" || !station.tariffs.some((tariff) =>
        (!filters.connector || tariff.connector === filters.connector) &&
        (filters.power <= 0 || (tariff.power !== null && tariff.power >= filters.power)))) return false;
    }
    return true;
  });
}

export function validCoordinates(lat: unknown, lon: unknown): boolean {
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

export function safeSourceUrl(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; }
  catch { return null; }
}

export const euro = (milli: number) => (milli / 1000).toFixed(3).replace(".", ",");
export const connectorLabel = (connector: string | null) => ({CCS2: "CCS2", CHADEMO: "CHAdeMO", TYPE2: "Type 2"}[connector ?? ""] ?? "Savienotājs nav norādīts");

export function tariffText(tariff: MapTariff): string {
  const parts: string[] = [];
  if (tariff.energy !== null) parts.push(`${euro(tariff.energy)} €/kWh`);
  if (tariff.time !== null) parts.push(`${euro(tariff.time)} €/min`);
  if (!parts.length) parts.push("Cena nav zināma");
  if (tariff.session !== null && tariff.session > 0) parts.push(`sesija ${euro(tariff.session)} €`);
  if (tariff.minimum !== null && tariff.minimum > 0) parts.push(`minimums ${euro(tariff.minimum)} €`);
  if (tariff.idle !== null && tariff.idle > 0) parts.push(`dīkstāve ${euro(tariff.idle)} €/min${tariff.idleAfter !== null ? ` pēc ${tariff.idleAfter} min` : ""}`);
  if (tariff.timeFrom || tariff.timeTo) parts.push(`laiks ${tariff.timeFrom ?? "?"}-${tariff.timeTo ?? "?"}`);
  if (tariff.weekdays) parts.push(`dienas ${tariff.weekdays}`);
  parts.push(tariff.vatIncluded ? "ar PVN" : "bez PVN");
  return parts.join("; ");
}

export function routeUrl(station: Pick<MapStation, "lat" | "lon">): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}`;
}

interface EvRow {
  id: string; network: string; name: string | null; address: string | null; city: string | null;
  lat: number; lon: number; last_seen_at: string;
  connector: string | null; power_max_kw: number | null; current_type: string;
  payment: string; energy_milli_per_kwh: number | null; time_milli_per_min: number | null;
  session_fee_milli: number | null; min_fee_milli: number | null; idle_fee_milli_per_min: number | null;
  idle_after_min: number | null; time_from: string | null; time_to: string | null; weekdays: string | null;
  vat_included: number; observed_at: string | null; source_url: string | null; checked_at: string | null;
}

// Only station-specific tariffs. Network minima never become station prices.
// The database contains historical observations, not live outlet availability.
export const EV_MAP_QUERY = `
  WITH ranked AS (
    SELECT t.*, ROW_NUMBER() OVER (
      PARTITION BY t.network_id, t.station_id, t.current_type, t.connector, t.payment
      ORDER BY t.observed_at DESC, t.id DESC
    ) AS rn
    FROM ev_tariffs t WHERE t.station_id IS NOT NULL
  ), checked AS (
    SELECT source_id, MAX(started_at) AS checked_at FROM scrape_runs
    WHERE status IN ('ok', 'not_modified') GROUP BY source_id
  )
  SELECT s.id, n.name AS network, s.name, s.address, s.city, s.lat, s.lon, s.last_seen_at,
         t.connector, t.power_max_kw, t.current_type, t.payment,
         t.energy_milli_per_kwh, t.time_milli_per_min, t.session_fee_milli, t.min_fee_milli,
         t.idle_fee_milli_per_min, t.idle_after_min, t.time_from, t.time_to, t.weekdays,
         t.vat_included, t.observed_at, COALESCE(src.url, n.website) AS source_url, c.checked_at
  FROM stations s
  JOIN networks n ON n.id = s.network_id
  LEFT JOIN ranked t ON t.station_id = s.id AND t.network_id = s.network_id AND t.rn = 1
  LEFT JOIN scrape_runs r ON r.id = t.run_id
  LEFT JOIN sources src ON src.id = r.source_id
  LEFT JOIN checked c ON c.source_id = src.id
  WHERE s.country = 'LV' AND n.kinds LIKE '%ev%' AND s.lat IS NOT NULL AND s.lon IS NOT NULL
  ORDER BY n.name, s.id, t.current_type, t.power_max_kw
`;

export async function getEvMapStations(db: D1Database): Promise<MapStation[]> {
  const {results} = await db.prepare(EV_MAP_QUERY).all<EvRow>();
  const stations = new Map<string, MapStation>();
  for (const row of results) {
    if (!validCoordinates(row.lat, row.lon)) continue;
    let station = stations.get(row.id);
    if (!station) {
      station = {
        id: row.id, kind: "ev", network: row.network,
        name: row.name ?? row.network, address: [row.address, row.city].filter(Boolean).join(", "),
        lat: row.lat, lon: row.lon, products: [], sourceUrl: safeSourceUrl(row.source_url),
        updatedAt: row.last_seen_at, tariffs: [],
      };
      stations.set(row.id, station);
    }
    if (row.observed_at === null) continue;
    station.tariffs.push({
      connector: row.connector, power: row.power_max_kw, current: row.current_type, payment: row.payment,
      energy: row.energy_milli_per_kwh, time: row.time_milli_per_min,
      session: row.session_fee_milli, minimum: row.min_fee_milli, idle: row.idle_fee_milli_per_min,
      idleAfter: row.idle_after_min, timeFrom: row.time_from, timeTo: row.time_to, weekdays: row.weekdays,
      vatIncluded: row.vat_included === 1, observedAt: row.observed_at,
      checkedAt: row.checked_at, sourceUrl: safeSourceUrl(row.source_url),
    });
  }
  return [...stations.values()];
}
