// Starts the GitHub "Collect" workflow from a Cloudflare Cron Trigger.
//
// GitHub runs scheduled workflows of a free repository late or not at all:
// the "every 30 minutes" schedule in collect.yml fired only every 4-5 hours.
// Cloudflare's cron is on time, so it asks GitHub to run the workflow now
// (workflow_dispatch); the GitHub schedule stays in place as a fallback.

export const COLLECT_DISPATCH_URL =
	"https://api.github.com/repos/ArtuursG/fuel-price/actions/workflows/collect.yml/dispatches";

/** What one run collects; matches the `scope` input of collect.yml. */
export type CollectScope = "fuel" | "all";

// Fuel prices every run; EV tariffs and the EU bulletin are large and change
// rarely, so they ride along once a day, on the run in the 04:00 UTC hour.
export function scopeForTime(scheduledTime: number): CollectScope {
	const time = new Date(scheduledTime);
	return time.getUTCHours() === 4 && time.getUTCMinutes() < 30 ? "all" : "fuel";
}

export function collectDispatchRequest(token: string, scope: CollectScope): Request {
	return new Request(COLLECT_DISPATCH_URL, {
		method: "POST",
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			"User-Agent": "fuel-price-ingest",
			"X-GitHub-Api-Version": "2022-11-28",
		},
		body: JSON.stringify({ ref: "main", inputs: { scope } }),
	});
}

export type TriggerResult = "triggered" | "no_token" | "failed";

export async function triggerCollect(
	scheduledTime: number,
	token: string | undefined,
	fetcher: (request: Request) => Promise<Response> = (request) => fetch(request),
): Promise<TriggerResult> {
	if (!token) {
		console.warn("GITHUB_DISPATCH_TOKEN is not set, so collection was not started");
		return "no_token";
	}
	const response = await fetcher(collectDispatchRequest(token, scopeForTime(scheduledTime)));
	// GitHub answers 204 No Content when the run has been queued.
	if (response.status !== 204) {
		console.error(`Starting the Collect workflow failed: HTTP ${response.status} ${await response.text()}`);
		return "failed";
	}
	return "triggered";
}
