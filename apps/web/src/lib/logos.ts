// Network brand images. The files are the networks' own logos, used only to
// recognise a network in the comparison. Most come from the network's own
// site where robots.txt allows it; the Gotika and KOOL files were provided by
// the site owner, since gotikaauto.lv answers with "Disallow: /" and nothing
// is taken from there.
//
// One list for both uses: the page component (by network id) and the map (by
// network name, since station sources have no id).

export const LOGO_BY_ID: Record<string, string> = {
	astarte: "/logos/astarte.png",
	circlek: "/logos/circlek.png",
	elektrum: "/logos/elektrum.png",
	eleport: "/logos/eleport.svg",
	emobi: "/logos/emobi.svg",
	enefit: "/logos/enefit.png",
	gotika: "/logos/gotika.png",
	ignitis: "/logos/ignitis.png",
	kool: "/logos/kool.png",
	neste: "/logos/neste.svg",
	straujupite: "/logos/straujupite.svg",
	viada: "/logos/viada.png",
	virsi: "/logos/virsi.png",
};

// Names as returned by canonicalNetwork() (see station-map.ts).
const ID_BY_NAME: Record<string, string> = {
	"circle k": "circlek",
	viada: "viada",
	virši: "virsi",
	kool: "kool",
	neste: "neste",
	straujupīte: "straujupite",
	"astarte-nafta": "astarte",
	astarte: "astarte",
	"e-mobi": "emobi",
	"elektrum drive": "elektrum",
	"ignitis on": "ignitis",
	eleport: "eleport",
	enefit: "enefit",
	gotika: "gotika",
	"gotika auto": "gotika",
};

export function logoForId(id: string): string | null {
	return LOGO_BY_ID[id] ?? null;
}

export function logoForNetworkName(name: string): string | null {
	const id = ID_BY_NAME[name.trim().toLocaleLowerCase("lv")];
	return id ? (LOGO_BY_ID[id] ?? null) : null;
}

export function networkIdForName(name: string): string | null {
	return ID_BY_NAME[name.trim().toLocaleLowerCase("lv")] ?? null;
}
