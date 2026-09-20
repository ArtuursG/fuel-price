// Tīklu zīmolu attēli. Faili ir tīklu pašu logo, izmantoti tikai tīkla
// atpazīšanai salīdzinājumā. Katrs ņemts no attiecīgā tīkla lapas, kur
// robots.txt to atļauj; Gotikas lapa ir "Disallow: /", tāpēc tai logo nav
// un paliek burtu plāksnīte.
//
// Viens saraksts abām vietām: lapas komponentei (pēc tīkla id) un kartei
// (pēc tīkla nosaukuma, jo staciju avotos id nav).

export const LOGO_BY_ID: Record<string, string> = {
	astarte: "/logos/astarte.png",
	circlek: "/logos/circlek.png",
	elektrum: "/logos/elektrum.png",
	eleport: "/logos/eleport.svg",
	emobi: "/logos/emobi.svg",
	enefit: "/logos/enefit.png",
	ignitis: "/logos/ignitis.png",
	kool: "/logos/kool.png",
	neste: "/logos/neste.svg",
	straujupite: "/logos/straujupite.svg",
	viada: "/logos/viada.png",
	virsi: "/logos/virsi.png",
};

// Nosaukumi tādi, kādus atgriež canonicalNetwork() (sk. station-map.ts).
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
