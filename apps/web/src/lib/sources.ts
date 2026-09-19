// Avotu statusa lapas datu slānis. Reāli dati no `sources` + katra avota
// jaunākais `scrape_runs` ieraksts -- nekādi izdomāti/placeholder statusi.

export type SourceStatus = "todo" | "investigate" | "active" | "blocked" | "unpublished" | "disabled";
export type RunStatus = "ok" | "not_modified" | "partial" | "error" | "blocked" | "unpublished";

export interface SourceRow {
	id: string;
	networkName: string | null;
	kind: string;
	url: string;
	status: SourceStatus;
	attribution: string | null;
	lastRunAt: string | null;
	lastRunStatus: RunStatus | null;
	lastRunItems: number | null;
}

interface SourceQueryRow {
	id: string;
	network_name: string | null;
	kind: string;
	url: string;
	status: SourceStatus;
	attribution: string | null;
	last_run_at: string | null;
	last_run_status: RunStatus | null;
	last_run_items: number | null;
}

const QUERY = `
	SELECT s.id, n.name AS network_name, s.kind, s.url, s.status, s.attribution,
	       r.started_at AS last_run_at, r.status AS last_run_status, r.items AS last_run_items
	FROM sources s
	LEFT JOIN networks n ON n.id = s.network_id
	LEFT JOIN (
		SELECT source_id, started_at, status, items,
		       ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY started_at DESC) AS rn
		FROM scrape_runs
	) r ON r.source_id = s.id AND r.rn = 1
	ORDER BY (r.started_at IS NOT NULL) DESC, s.kind, s.id
`;

export async function getSourceStatuses(db: D1Database): Promise<SourceRow[]> {
	const { results } = await db.prepare(QUERY).all<SourceQueryRow>();
	return results.map((row) => ({
		id: row.id,
		networkName: row.network_name,
		kind: row.kind,
		url: row.url,
		status: row.status,
		attribution: row.attribution,
		lastRunAt: row.last_run_at,
		lastRunStatus: row.last_run_status,
		lastRunItems: row.last_run_items,
	}));
}

export const STATUS_LABELS: Record<SourceStatus, string> = {
	todo: "vēl nav ieviests",
	investigate: "tiek pētīts",
	active: "aktīvs",
	blocked: "bloķēts",
	unpublished: "cenas nepublicē",
	disabled: "izslēgts",
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
	ok: "veiksmīgs",
	not_modified: "nav izmaiņu",
	partial: "daļējs",
	error: "kļūda",
	blocked: "bloķēts",
	unpublished: "nepublicē",
};
