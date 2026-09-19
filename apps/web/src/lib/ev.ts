// EV uzlādes tarifu kopsavilkums. Katrs tīkls var rādīt SIMTIEM staciju ar
// vienādu vai ļoti līdzīgu cenu vienam savienotāja tipam (piem., e-mobi ir
// viena vienota cena visā tīklā), tāpēc MVP lapa rāda kopsavilkumu pa
// (tīkls, savienotājs, strāvas tips), NE katru staciju atsevišķi -- pilna
// staciju karte apzināti nav 6. fāzes darba kārtā (sk. docs/PLAN.md 5. fāze).

export interface EvTariffSummary {
	networkId: string;
	networkName: string;
	connector: string | null;
	currentType: "AC" | "DC";
	stationCount: number;
	minEnergyMilliPerKwh: number | null;
	minTimeMilliPerMin: number | null;
}

interface EvTariffQueryRow {
	network_id: string;
	network_name: string;
	connector: string | null;
	current_type: "AC" | "DC";
	station_count: number;
	min_energy_milli: number | null;
	min_time_milli: number | null;
}

export const CONNECTOR_LABELS: Record<string, string> = {
	CCS2: "CCS2",
	CHADEMO: "CHAdeMO",
	TYPE2: "Type 2",
};

// Katrai (network_id, station_id, current_type, connector, payment) "slotam"
// -- jaunākais tarifs (ADR-004 stila izmaiņu-tikai uzglabāšana, sk. ingest
// computeTariffHash) -- tad sagrupēts pa (tīkls, savienotājs, strāvas tips),
// lai iegūtu lētāko zināmo cenu un cik vietās tā pieejama.
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
	       MIN(r.time_milli_per_min) AS min_time_milli
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
	}));
}
