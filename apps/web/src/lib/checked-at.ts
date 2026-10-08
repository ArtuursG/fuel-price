// "pirms 12 min" or "šodien 09:37" says at a glance how fresh the prices are;
// a full date and time is only needed for older checks. Used on the server
// and again in the browser, so a page that stays open (or is shown offline
// from the saved copy) does not keep saying "pirms 7 min" for hours.

const rigaDay = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Europe/Riga" });
const rigaTime = (date: Date) =>
	date.toLocaleTimeString("lv-LV", { timeZone: "Europe/Riga", hour: "2-digit", minute: "2-digit" });

export function formatCheckedAt(iso: string, now: Date = new Date()): string {
	if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T00:00:00Z`).toLocaleDateString("lv-LV");
	const date = new Date(iso);
	if (!Number.isFinite(date.getTime())) return iso;
	const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
	if (minutes >= 0 && minutes < 2) return "tikko";
	if (minutes >= 0 && minutes < 60) return `pirms ${minutes} min`;
	if (rigaDay(date) === rigaDay(now)) return `šodien ${rigaTime(date)}`;
	const yesterday = new Date(now.getTime() - 86_400_000);
	if (rigaDay(date) === rigaDay(yesterday)) return `vakar ${rigaTime(date)}`;
	return date.toLocaleString("lv-LV", { timeZone: "Europe/Riga", dateStyle: "short", timeStyle: "short" });
}
