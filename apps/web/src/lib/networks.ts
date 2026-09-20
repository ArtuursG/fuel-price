// Tīklu saraksts un pamatinformācija - pamats "tīklu lapām", kas ir
// obligāts rezultāts pēc docs/PROMPT_START.md "Galarezultāts" saraksta, bet
// vēl nebija uzbūvēts.

export interface NetworkInfo {
	id: string;
	name: string;
	website: string | null;
	kinds: string[];
	note: string | null;
	publishesPrices: boolean;
}

interface NetworkQueryRow {
	id: string;
	name: string;
	website: string | null;
	kinds: string;
	note: string | null;
	publishes_prices: number;
}

export async function getAllNetworks(db: D1Database): Promise<NetworkInfo[]> {
	const { results } = await db
		.prepare("SELECT id, name, website, kinds, note, publishes_prices FROM networks ORDER BY name")
		.all<NetworkQueryRow>();
	return results.map((row) => ({
		id: row.id,
		name: row.name,
		website: row.website,
		kinds: row.kinds.split(","),
		note: row.note,
		publishesPrices: row.publishes_prices === 1,
	}));
}

export async function getNetwork(db: D1Database, id: string): Promise<NetworkInfo | null> {
	const row = await db
		.prepare("SELECT id, name, website, kinds, note, publishes_prices FROM networks WHERE id = ?")
		.bind(id)
		.first<NetworkQueryRow>();
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		website: row.website,
		kinds: row.kinds.split(","),
		note: row.note,
		publishesPrices: row.publishes_prices === 1,
	};
}
