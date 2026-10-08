// Summary of EV charging tariffs. A network can list HUNDREDS of stations
// with the same or very similar price for one connector type (e.g. e-mobi
// has one uniform price across the network), so the MVP page shows a summary
// per (network, connector, current type), NOT every station separately - a
// full station map was deliberately left out of phase 6 (see docs/PLAN.md
// phase 5).

export interface EvTariffSummary {
	networkId: string;
	networkName: string;
	connector: string | null;
	currentType: "AC" | "DC";
	stationCount: number;
	minEnergyMilliPerKwh: number | null;
	minTimeMilliPerMin: number | null;
	// Only meaningful (and only used) alongside minTimeMilliPerMin, to convert
	// a per-minute tariff to a per-100km cost - see lib/calculator.ts. Power
	// is usually constant within a (network, connector, current_type) group,
	// but not always (e.g. emobi TYPE2 spans 22-43 kW); this is an average,
	// not an exact figure, and the calculator page says so.
	avgPowerKw: number | null;
}

interface EvTariffQueryRow {
	network_id: string;
	network_name: string;
	connector: string | null;
	current_type: "AC" | "DC";
	station_count: number;
	min_energy_milli: number | null;
	min_time_milli: number | null;
	avg_power_kw: number | null;
}

export const CONNECTOR_LABELS: Record<string, string> = {
	CCS2: "CCS2",
	CHADEMO: "CHAdeMO",
	TYPE2: "Type 2",
};

// For each (network_id, station_id, current_type, connector, payment) "slot"
// - the latest tariff (ADR-004 style change-only storage, see ingest
// computeTariffHash) - then grouped by (network, connector, current type) to
// get the cheapest known price and how many places offer it.
const QUERY = `
	WITH ranked AS (
		SELECT *,
			ROW_NUMBER() OVER (
				PARTITION BY network_id, station_id, current_type, connector, payment
				ORDER BY observed_at DESC
			) AS rn
		FROM ev_tariffs
	)
	SELECT r.network_id, n.name AS network_name, r.connector, r.current_type,
	       COUNT(*) AS station_count,
	       MIN(r.energy_milli_per_kwh) AS min_energy_milli,
	       MIN(r.time_milli_per_min) AS min_time_milli,
	       AVG(r.power_max_kw) AS avg_power_kw
	FROM ranked r
	JOIN networks n ON n.id = r.network_id
	WHERE r.rn = 1
	GROUP BY r.network_id, r.connector, r.current_type
	ORDER BY n.name, r.connector
`;

export async function getEvTariffSummary(db: D1Database): Promise<EvTariffSummary[]> {
	const { results } = await db.prepare(QUERY).all<EvTariffQueryRow>();
	return results.map((row) => ({
		networkId: row.network_id,
		networkName: row.network_name,
		connector: row.connector,
		currentType: row.current_type,
		stationCount: row.station_count,
		minEnergyMilliPerKwh: row.min_energy_milli,
		minTimeMilliPerMin: row.min_time_milli,
		avgPowerKw: row.avg_power_kw,
	}));
}
