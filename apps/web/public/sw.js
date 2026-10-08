// Offline fallback. Pages always come from the network first, so prices are
// never older than they have to be; only when there is no connection is the
// last saved copy of the page shown, so the last known prices stay readable
// (the page then says it is offline). Build files under /_astro/ have hashed
// names and never change, so they are served from the cache once saved.

const PAGES = "pages-v1";
const ASSETS = "assets-v1";
const STATIC = "static-v1";
const MAX_ASSETS = 120;

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keep = new Set([PAGES, ASSETS, STATIC]);
			for (const key of await caches.keys()) {
				if (!keep.has(key)) await caches.delete(key);
			}
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (request.mode === "navigate") {
		event.respondWith(networkFirst(request));
	} else if (url.pathname.startsWith("/_astro/")) {
		event.respondWith(cacheFirst(request));
	} else if (url.pathname.startsWith("/logos/") || /^\/(favicon\.svg|icon-[\w-]+\.png)$/.test(url.pathname)) {
		event.respondWith(staleWhileRevalidate(request));
	}
});

async function networkFirst(request) {
	const cache = await caches.open(PAGES);
	try {
		const response = await fetch(request);
		if (response.ok) await cache.put(request, response.clone());
		return response;
	} catch (error) {
		const saved = (await cache.match(request)) ?? (await cache.match("/"));
		if (saved) return markSavedCopy(saved);
		throw error;
	}
}

// The page shows its offline notice when <html> carries this attribute, which
// also covers the site being unreachable while the device is online. A fresh
// Response with only Content-Type: the saved headers may name an encoding the
// stored (already decoded) body no longer has.
async function markSavedCopy(response) {
	const html = await response.text();
	return new Response(html.replace('<html lang="lv"', '<html lang="lv" data-saved-copy'), {
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

async function cacheFirst(request) {
	const cache = await caches.open(ASSETS);
	const saved = await cache.match(request);
	if (saved) return saved;
	const response = await fetch(request);
	if (response.ok) {
		await cache.put(request, response.clone());
		await trim(cache, MAX_ASSETS);
	}
	return response;
}

async function staleWhileRevalidate(request) {
	const cache = await caches.open(STATIC);
	const saved = await cache.match(request);
	const fresh = fetch(request)
		.then(async (response) => {
			if (response.ok) await cache.put(request, response.clone());
			return response;
		})
		.catch(() => saved ?? Response.error());
	return saved ?? fresh;
}

// Each deploy brings new hashed files; drop the oldest so the cache does not grow forever.
async function trim(cache, max) {
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}
