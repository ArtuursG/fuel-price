// MapLibre nāk no CDN kā globāls skripts (sk. karte/index.astro), NEVIS caur
// bundli. Iemesls: sapakota v6 karte klusi uzkārās -- konstruktors izdevās,
// neviena kļūda netika izmesta, bet "load" nekad nenotika, kas ir tipiska
// pazīme, ka MapLibre Web Worker (ko bundleris ieliek kā blob) nomirst, un
// worker kļūdas neizplatās līdz kartes "error" notikumam. Tā pati versija
// un piegādes veids jau strādā blakus projektā ev-charge-lv.
// Tipi joprojām nāk no npm pakotnes (tikai devDependency), tāpēc pārbaude
// paliek pilnvērtīga.
import type {GeoJSONSource, Map as MapLibreMap, Marker as MapLibreMarker} from "maplibre-gl";
import type {FeatureCollection, Point} from "geojson";
import {filterStations, euro, connectorLabel, routeUrl, wazeUrl, safeSourceUrl, tariffText, canonicalNetwork, type MapStation, type StationFilters} from "../lib/station-map";
import {logoForNetworkName} from "../lib/logos";

declare const maplibregl: typeof import("maplibre-gl");

const stations: MapStation[] = JSON.parse(document.getElementById("map-stations")!.textContent!);
const input = <T = HTMLDivElement>(id: string) => document.getElementById(id) as T;
const search = input<HTMLInputElement>("station-search");
const kind = input<HTMLSelectElement>("station-kind");
const network = input<HTMLSelectElement>("station-network");
const product = input<HTMLSelectElement>("station-product");
const connector = input<HTMLSelectElement>("station-connector");
const power = input<HTMLSelectElement>("station-power");
const visibleOnly = input<HTMLInputElement>("visible-only");
const list = input<HTMLDivElement>("station-list");
const detail = input<HTMLDivElement>("station-detail");
const message = input<HTMLParagraphElement>("map-message");
const more = input<HTMLButtonElement>("more-stations");
const byId = new Map(stations.map((station) => [station.id, station]));
let map: MapLibreMap | null = null;
let mapReady = false;
let filtered = stations;
let limit = 50;
let selectedId: string | null = null;
let locationMarker: MapLibreMarker | null = null;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// Cloudflare's Workers types (worker-configuration.d.ts) declare their own
// global `Element` interface for HTMLRewriter, with an `append(content,
// options?)` method -- since it shares the DOM's `Element` interface name,
// TypeScript merges the two declarations and corrupts `.append()`'s real
// overload for every DOM element in this project. `appendChild` isn't part
// of HTMLRewriter's Element, so it stays unaffected; used here instead.
function appendAll(parent: Node, ...children: Node[]): void {
  for (const child of children) parent.appendChild(child);
}

function link(text: string, url: string): HTMLAnchorElement {
  const node = element("a", text);
  node.href = url; node.target = "_blank"; node.rel = "noopener noreferrer";
  return node;
}

// Navigācijas pogas ar ikonām, nevis teksta saitēm.
//
// Ikonas ir mūsu pašu zīmētas (kartes pilons un navigācijas bulta) lietotņu
// firmas krāsās -- APZINĀTI nav pārzīmēts Google Maps vai Waze oriģinālais
// logotips, jo tās ir preču zīmes ar savām lietošanas prasībām. Nosaukums
// paliek pieejams ar aria-label un title, tāpēc ekrānlasītājs un kursora
// palīgteksts joprojām pasaka, uz kurieni saite ved.
const NAV_ICONS: Record<string, string> = {
  google:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  waze:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12 2.5 20.5 21 12 17.2 3.5 21z"/></svg>',
};

function navButton(kind: "google" | "waze", label: string, url: string): HTMLAnchorElement {
  const node = element("a", undefined, `nav-button nav-button--${kind}`);
  node.href = url; node.target = "_blank"; node.rel = "noopener noreferrer";
  node.setAttribute("aria-label", label); node.title = label;
  node.innerHTML = NAV_ICONS[kind];
  return node;
}

function navButtons(station: MapStation): HTMLDivElement {
  const wrap = element("div", undefined, "nav-buttons");
  appendAll(
    wrap,
    navButton("google", "Atvērt Google Maps", routeUrl(station)),
    navButton("waze", "Atvērt Waze", wazeUrl(station)),
  );
  return wrap;
}

function dateLabel(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "nav zināms";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`).toLocaleDateString("lv-LV", {timeZone:"Europe/Riga"});
  return new Date(value).toLocaleString("lv-LV", {timeZone:"Europe/Riga",dateStyle:"short",timeStyle:"short"});
}

// These are compact network labels, not official operator artwork.
function networkMark(station: MapStation): string {
  const known: Record<string,string> = {"Circle K":"CK", "Viada":"VI", "Virši":"V", "Neste":"N", "KOOL":"KO", "Latvijas Nafta":"LN", "Latvijas Propāna Gāze":"LPG", "Gotika":"G", "Shell":"SH", "Astarte":"AS", "e-mobi":"e", "Elektrum Drive":"ED", "Ignitis ON":"ON"};
  return known[station.network] ?? station.network.replace(/[^\p{L}\p{N}]/gu, "").slice(0,2).toLocaleUpperCase("lv");
}
function badge(station: MapStation) {
  const logo = logoForNetworkName(canonicalNetwork(station.network));
  if (logo) {
    const img = document.createElement("img");
    img.src = logo; img.alt = ""; img.loading = "lazy";
    img.className = `network-mark network-mark--logo network-mark--${station.kind}`;
    img.title = station.network;
    return img;
  }
  const mark = element("span", networkMark(station) || "D", `network-mark network-mark--${station.kind}`);
  mark.title = station.network; mark.setAttribute("aria-hidden", "true");
  return mark;
}

// Kartes marķieriem logo jābūt reģistrētam MapLibre attēlu reģistrā. PNG un
// SVG abus ielasām caur <img> un uzzīmējam uz audekla, lai iegūtu pikseļus;
// map.loadImage() ar SVG nestrādā.
const MARKER_PX = 64;
async function registerLogoImages(target: MapLibreMap): Promise<void> {
  const names = [...new Set(stations.map(station => canonicalNetwork(station.network)))];
  await Promise.all(names.map(async name => {
    const url = logoForNetworkName(name);
    const id = markerImageId(name);
    if (!url || target.hasImage(id)) return;
    try {
      const bitmap = await loadBitmap(url);
      if (!target.hasImage(id)) target.addImage(id, bitmap, {pixelRatio: 2});
    } catch {
      // Logo neielādējās -- marķieris paliek ar burtiem, karte strādā tālāk.
    }
  }));
}
function markerImageId(networkName: string): string {
  return `logo-${networkName.toLocaleLowerCase("lv").replace(/[^a-z0-9]/g, "")}`;
}
function loadBitmap(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = MARKER_PX; canvas.height = MARKER_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("nav 2d konteksta")); return; }
      // Ietilpinām kvadrātā, saglabājot proporcijas -- logo ir dažādu formu.
      const scale = Math.min(MARKER_PX / img.width, MARKER_PX / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (MARKER_PX - w) / 2, (MARKER_PX - h) / 2, w, h);
      resolve(ctx.getImageData(0, 0, MARKER_PX, MARKER_PX));
    };
    img.onerror = () => reject(new Error(`neizdevās ielādēt ${url}`));
    img.src = url;
  });
}
function priceLabel(tariff: MapStation["tariffs"][number]): string {
  const parts = [];
  if (tariff.energy !== null) parts.push(`${euro(tariff.energy)} €/kWh`);
  if (tariff.time !== null) parts.push(`${euro(tariff.time)} €/min`);
  return parts.join(" + ") || "Cena nav pieejama";
}
function showStation(station: MapStation, move = true) {
  selectedId = station.id;
  detail.replaceChildren(); detail.hidden = false;
  const close = element("button", "Aizvērt ×", "detail-close"); close.type = "button";
  close.addEventListener("click", () => { detail.hidden = true; selectedId = null; });
  const title = element("div", undefined, "station-title");
  const names = element("div");
  appendAll(names, element("h2", station.name), element("span", `${station.network} · ${station.kind === "ev" ? "EV" : "DUS"}`, "station-subtitle"));
  appendAll(title, badge(station), names);
  appendAll(detail, close, title);
  if (station.address) detail.appendChild(element("p", station.address, "station-address"));
  detail.appendChild(navButtons(station));
  if (!station.tariffs.length && !station.fuelPrices?.length) detail.appendChild(element("p", "Cena nav pieejama", "missing-price"));
  const fuelPrices = station.fuelPrices ?? [];
  if(fuelPrices.length) {
    const prices = element("div",undefined,"fuel-price-grid");
    for(const price of fuelPrices) {
      const item=element("div");
      appendAll(item,element("span",price.label),element("strong",`${euro(price.priceMilli)} €/l`,"station-price"));
      prices.appendChild(item);
    }
    detail.appendChild(prices);
    const observed = [...new Set(fuelPrices.map(price => price.observedAt))];
    if(observed.length === 1) detail.appendChild(element("span",`Cena novērota ${dateLabel(observed[0])}`,"tariff-age"));
    if(fuelPrices.some(price => price.age !== "today")) detail.appendChild(element("span","Pārbaudi cenu pirms brauciena","stale-note tariff-age"));
    const sources=element("details",undefined,"station-extra");
    sources.appendChild(element("summary","Cenu avots un laiks"));
    for(const price of fuelPrices) {
      const row=element("p",`${price.label} · ${dateLabel(price.observedAt)} `);
      const source=safeSourceUrl(price.sourceUrl); if(source) row.appendChild(link("Avots ↗",source));
      sources.appendChild(row);
    }
    detail.appendChild(sources);
  }
  for (const tariff of station.tariffs) {
    const item = element("div", undefined, "tariff-card");
    appendAll(item, element("strong", priceLabel(tariff), "station-price"), element("p", `${connectorLabel(tariff.connector)}${tariff.power !== null ? ` · ${tariff.power} kW` : ""} · ${tariff.current}`));
    const payment = {app:"Lietotnē", adhoc:"Bez līguma", subscription:"Abonementam"}[tariff.payment] ?? tariff.payment;
    item.appendChild(element("span", `${payment}${tariff.vatIncluded ? " · ar PVN" : " · bez PVN"}`, "tariff-age"));
    item.appendChild(element("span", `Cena novērota ${dateLabel(tariff.observedAt)}`, "tariff-age"));
    const checked = tariff.checkedAt ? Date.parse(tariff.checkedAt) : NaN;
    if (!Number.isFinite(checked) || Date.now()-checked > 86400000) item.appendChild(element("span", "Pārbaudi cenu pie operatora", "stale-note tariff-age"));
    const extra = element("details", undefined, "station-extra");
    const hasConditions = (tariff.session ?? 0)>0 || (tariff.minimum ?? 0)>0 || (tariff.idle ?? 0)>0 || tariff.timeFrom || tariff.timeTo || tariff.weekdays;
    appendAll(extra, element("summary", hasConditions ? "Papildu maksas un nosacījumi" : "Avots un pārbaudes laiks"), element("p", tariffText(tariff)), element("p", `Avots pārbaudīts ${dateLabel(tariff.checkedAt)}`));
    const source = safeSourceUrl(tariff.sourceUrl);
    if(source) extra.appendChild(link("Operatora avots ↗",source));
    item.appendChild(extra); detail.appendChild(item);
  }
  const extra = element("details", undefined, "station-extra");
  extra.appendChild(element("summary", "Par stacijas datiem"));
  if(station.kind === "fuel") {
    if(station.products.length) extra.appendChild(element("p", `Degviela: ${station.products.join(", ")}`));
    extra.appendChild(element("p", `OpenStreetMap vietu dati: ${dateLabel(station.updatedAt)}. Tīkla zemākā cena nav katras stacijas cena.`));
  } else extra.appendChild(element("p", "Norādīts cenas novērojuma laiks, nevis garantēts operatora cenas maiņas brīdis. Uzlādes vietu aizņemtība nav pieejama."));
  // Degvielas stacijām šeit vairs nav atsevišķas OpenStreetMap saites --
  // ODbL prasītā atsauce paliek lapas kājenē, kur tā attiecas uz visu datu
  // kopu. EV stacijām operatora avots paliek: tā ir cenas izcelsme.
  const source = safeSourceUrl(station.sourceUrl);
  if(source && station.kind !== "fuel") extra.appendChild(link("Operatora avots ↗",source));
  detail.appendChild(extra);
  detail.scrollIntoView({block:"nearest",behavior:"instant"}); close.focus({preventScroll:true});
  if(move && map) map.easeTo({center:[station.lon,station.lat],zoom:Math.max(map.getZoom(),13),duration:matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350});
}

function renderList() {
  const bounds = mapReady && map && visibleOnly.checked ? map.getBounds() : null;
  const shown = filtered.filter((station) => !bounds || bounds.contains([station.lon,station.lat]));
  input("result-count").textContent = `${shown.length} stacijas${bounds ? " kartes apgabalā" : ""} / ${filtered.length} atlasītas`;
  const fragment = document.createDocumentFragment();
  for (const station of shown.slice(0,limit)) {
    const row = element("article",undefined,"station-list-item");
    const button = element("button",station.name,"station-select"); button.type="button";
    button.addEventListener("click",() => showStation(station));
    const title = element("div", undefined, "station-title");
    const names = element("div");
    appendAll(names, button, element("p", `${station.network} · ${station.kind === "ev" ? "EV" : "DUS"}`));
    appendAll(title, badge(station), names); row.appendChild(title);
    if (station.address && station.address !== station.name) row.appendChild(element("p", station.address));
    const tariff = station.tariffs.find(t => (!connector.value || t.connector === connector.value) && (!Number(power.value) || (t.power ?? 0) >= Number(power.value)));
    if (tariff) {
      row.appendChild(element("strong", `${station.tariffs.length > 1 ? "Piem., " : ""}${priceLabel(tariff)}`, "list-price"));
      row.appendChild(element("p", `${connectorLabel(tariff.connector)}${tariff.power !== null ? ` · ${tariff.power} kW` : ""}${station.tariffs.length > 1 ? ` · ${station.tariffs.length} tarifi` : ""}`));
    } else {
      const prices = (station.fuelPrices ?? []).filter(price => !product.value || price.product === product.value);
      if(prices.length) row.appendChild(element("strong", `${prices[0].label} · ${euro(prices[0].priceMilli)} €/l${prices.length > 1 ? ` · +${prices.length-1} veidi` : ""}`, "list-price"));
      else row.appendChild(element("p", "Cena nav pieejama"));
    }
    row.appendChild(navButtons(station));
    fragment.append(row);
  }
  if (!shown.length) fragment.append(element("p", "Šajā apgabalā nav atbilstošu staciju. Samazini filtrus vai spied “Rādīt visus rezultātus”.", "station-list-item"));
  list.replaceChildren(fragment); more.hidden = shown.length <= limit;
}

function geojson(): FeatureCollection<Point> {
  return {type:"FeatureCollection",features:filtered.map((station) => ({type:"Feature",geometry:{type:"Point",coordinates:[station.lon,station.lat]},properties:{id:station.id,kind:station.kind,mark:networkMark(station),logo:logoForNetworkName(canonicalNetwork(station.network))?markerImageId(canonicalNetwork(station.network)):""}}))};
}

function applyFilters() {
  const filters: StationFilters = {kind:kind.value,network:network.value,query:search.value,product:product.value,connector:connector.value,power:Number(power.value)};
  filtered = filterStations(stations,filters); limit=50;
  if (selectedId && !filtered.some((station) => station.id === selectedId)) {detail.hidden=true; selectedId=null;}
  if (mapReady && map) (map.getSource("stations") as GeoJSONSource).setData(geojson());
  renderList();
}

input<HTMLFormElement>("map-filters").addEventListener("submit", (event) => event.preventDefault());
search.addEventListener("input",applyFilters);
network.addEventListener("change",applyFilters);
kind.addEventListener("change", () => {
  product.value=""; connector.value=""; power.value="0";
  input("fuel-filter").hidden = kind.value === "ev";
  input("connector-filter").hidden = kind.value === "fuel";
  input("power-filter").hidden = kind.value === "fuel";
  applyFilters();
});
product.addEventListener("change", () => { if(product.value) {connector.value="";power.value="0";} applyFilters(); });
for (const field of [connector,power]) field.addEventListener("change", () => {if(connector.value || Number(power.value)>0) product.value="";applyFilters();});
visibleOnly.addEventListener("change", () => {limit=50;renderList();});
more.addEventListener("click", () => {limit+=50;renderList();});
input("clear-filters").addEventListener("click", () => {
  input<HTMLFormElement>("map-filters").reset();
  for(const id of ["fuel-filter","connector-filter","power-filter"]) input(id).hidden=false;
  applyFilters();
});
input("fit-results").addEventListener("click", () => {
  if (!map || !filtered.length) {message.textContent="Šiem filtriem nav rezultātu.";return;}
  const bounds = new maplibregl.LngLatBounds(); filtered.forEach((station) => bounds.extend([station.lon,station.lat]));
  map.fitBounds(bounds,{padding:45,maxZoom:13,duration:0});
});
input<HTMLButtonElement>("locate-me").addEventListener("click", () => {
  if (!navigator.geolocation) {message.textContent="Pārlūks neatbalsta atrašanās vietas noteikšanu. Izmanto meklēšanu.";return;}
  const button=input<HTMLButtonElement>("locate-me");button.disabled=true;
  message.textContent="Gaida atrašanās vietas atļauju. Koordinātas netiek saglabātas.";
  navigator.geolocation.getCurrentPosition((position) => {
    button.disabled=false;
    const coordinates:[number,number]=[position.coords.longitude,position.coords.latitude];
    if(map) { locationMarker?.remove();locationMarker=new maplibregl.Marker({color:COLOR_INK}).setLngLat(coordinates).addTo(map);map.easeTo({center:coordinates,zoom:12,duration:0}); }
    message.textContent="Karte centrēta uz aptuveno atrašanās vietu. Tuvums negarantē īsāko braukšanas maršrutu.";
  }, (error) => {button.disabled=false;message.textContent=error.code===1 ? "Atrašanās vietas piekļuve nav atļauta. Ieraksti pilsētu vai adresi meklēšanā." : "Atrašanās vietu neizdevās noteikt. Izmanto meklēšanu.";}, {timeout:12000,maximumAge:60000,enableHighAccuracy:false});
});

// Karte lasa krāsas TIEŠI no global.css mainīgajiem, nevis dublē tās kā
// atsevišķas hex vērtības -- tā karte automātiski seko lapas paletei, ja tā
// mainās, nevis paliek nesalāgota (kā notika ar EV punktu violeto krāsu,
// kas nebija daļa no lapas paletes vispār).
const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name: string, fallback: string) => rootStyle.getPropertyValue(name).trim() || fallback;
const COLOR_FUEL = cssColor("--color-pylon", "#245779");
const COLOR_EV = cssColor("--color-down", "#296448");
const COLOR_INK = cssColor("--color-ink", "#202b35");

// Diagnostika: kartes "load" var nenotikt pilnīgi klusi (apstājies Web
// Worker vai nulles izmēra audekls, kas nekad netiek zīmēts), un tad ne
// catch, ne "error" notikums neko nepasaka. Šie skaitītāji ļauj 15 sekunžu
// pārbaudei pateikt, KURĀ vietā ķēde pārtrūkst, nevis tikai ka pārtrūka.
const diagnostics = {requested:0, styleData:0, sourceData:0, workerErrors:[] as string[]};
addEventListener("error", (event) => {
  if (event.filename?.startsWith("blob:") || event.message?.includes("worker")) {
    diagnostics.workerErrors.push(`${event.message} @ ${event.filename}:${event.lineno}`);
  }
});
addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  diagnostics.workerErrors.push(`unhandled rejection: ${String(event.reason)}`);
});

applyFilters();
try {
  map = new maplibregl.Map({container:"station-map",style:"https://tiles.openfreemap.org/styles/positron",center:[24.6,56.9],zoom:6.3,attributionControl:{compact:true},cooperativeGestures:true,transformRequest:(url,resourceType) => {diagnostics.requested++; if(diagnostics.requested<=3) console.info("Karte pieprasa:",resourceType,url); return {url};}});
  map.on("styledata",() => {diagnostics.styleData++;});
  map.on("sourcedata",() => {diagnostics.sourceData++;});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");
  map.on("load", async () => {
    if(!map) return;
    await registerLogoImages(map);
    if(!map) return;
    map.addSource("stations",{type:"geojson",data:geojson(),cluster:true,clusterMaxZoom:12,clusterRadius:40});
    map.addLayer({id:"clusters",type:"circle",source:"stations",filter:["has","point_count"],paint:{"circle-color":COLOR_INK,"circle-radius":["step",["get","point_count"],17,25,22,100,28],"circle-stroke-color":"#fff","circle-stroke-width":2}});
    map.addLayer({id:"cluster-count",type:"symbol",source:"stations",filter:["has","point_count"],layout:{"text-field":["get","point_count_abbreviated"],"text-font":["Noto Sans Regular"],"text-size":12},paint:{"text-color":"#fff"}});
    // Ar logo aplis ir balts (krāsains fons logo nomāktu), un tīkla krāsa
    // pāriet uz apmali; bez logo viss paliek kā bijis.
    map.addLayer({id:"stations",type:"circle",source:"stations",filter:["!",["has","point_count"]],paint:{"circle-color":["case",["!=",["get","logo"],""],"#ffffff",["match",["get","kind"],"ev",COLOR_EV,COLOR_FUEL]],"circle-radius":["interpolate",["linear"],["zoom"],10,15,14,19],"circle-stroke-color":["case",["!=",["get","logo"],""],["match",["get","kind"],"ev",COLOR_EV,COLOR_FUEL],"#ffffff"],"circle-stroke-width":3}});
    map.addLayer({id:"station-logos",type:"symbol",source:"stations",filter:["all",["!",["has","point_count"]],["!=",["get","logo"],""]],layout:{"icon-image":["get","logo"],"icon-size":["interpolate",["linear"],["zoom"],10,0.62,14,0.82],"icon-allow-overlap":true,"icon-ignore-placement":true}});
    map.addLayer({id:"station-labels",type:"symbol",source:"stations",filter:["all",["!",["has","point_count"]],["==",["get","logo"],""]],layout:{"text-field":["get","mark"],"text-font":["Noto Sans Regular"],"text-size":12,"text-allow-overlap":true},paint:{"text-color":"#fff"}});
    mapReady=true; message.textContent="Pietuvini karti vai izvēlies staciju sarakstā. Skaitļi apļos norāda staciju skaitu.";renderList();
  });
  map.on("moveend",renderList);
  map.on("click","clusters",async(event) => {
    const feature=event.features?.[0];if(!feature || !map || feature.geometry.type!=="Point")return;
    try {const zoom=await (map.getSource("stations") as GeoJSONSource).getClusterExpansionZoom(Number(feature.properties.cluster_id));map.easeTo({center:feature.geometry.coordinates as [number,number],zoom,duration:0});}catch{message.textContent="Grupu neizdevās atvērt. Pietuvini karti ar + pogu.";}
  });
  map.on("click","stations",(event) => {const id=event.features?.[0]?.properties.id;const station=byId.get(String(id));if(station)showStation(station,false);});
  for(const layer of ["clusters","stations"]) {
    map.on("mouseenter",layer,() => {if(map)map.getCanvas().style.cursor="pointer";});
    map.on("mouseleave",layer,() => {if(map)map.getCanvas().style.cursor="";});
  }
  // Kļūdas TIEK parādītas ar iemeslu, nevis noklusētas: iepriekš gan šis
  // handleris, gan catch zemāk tikai nomainīja tekstu, tāpēc reālais cēlonis
  // (WebGL, tīkls, stila fails) nekad nebija redzams ne lietotājam, ne konsolē.
  map.on("error",(event) => {
    const reason = event?.error?.message ?? "nezināms iemesls";
    console.error("Kartes kļūda:", event?.error ?? event);
    message.textContent=`Daļu kartes neizdevās ielādēt (${reason}). Staciju saraksts un filtri joprojām ir pieejami.`;
  });
  // Ja stils nekad neielādējas, "load" nenotiek un lietotājs paliek ar tukšu
  // pelēku lauku un mūžīgu "Karte ielādējas" -- pasakām to skaidri.
  setTimeout(() => {
    if (mapReady) return;
    const container = document.getElementById("station-map");
    const box = container?.getBoundingClientRect();
    const canvas = container?.querySelector("canvas");
    console.warn("KARTES DIAGNOSTIKA (kopē šo visu):", JSON.stringify({
      maplibreVersion: maplibregl.getVersion?.() ?? "nezināma",
      pieprasijumi: diagnostics.requested,
      styleDataNotikumi: diagnostics.styleData,
      sourceDataNotikumi: diagnostics.sourceData,
      stilsIeladets: (() => {try {return map?.isStyleLoaded() ?? null;} catch {return "kluda";}})(),
      konteineraPlatums: box?.width ?? null,
      konteineraAugstums: box?.height ?? null,
      audeklsIr: !!canvas,
      audeklaPlatums: canvas?.width ?? null,
      audeklaAugstums: canvas?.height ?? null,
      webgl: (() => {try {return !!document.createElement("canvas").getContext("webgl2") || !!document.createElement("canvas").getContext("webgl");} catch {return "kluda";}})(),
      workerKludas: diagnostics.workerErrors,
    }, null, 2));
    message.textContent="Karte joprojām ielādējas vai netiek atbildēts no kartes servera (tiles.openfreemap.org). Staciju saraksts un filtri zemāk darbojas.";
  }, 15000);
} catch (error) {
  console.error("Karti neizdevās palaist:", error);
  const reason = error instanceof Error ? error.message : String(error);
  message.textContent=`Šajā pārlūkā karti neizdevās palaist (${reason}). Izmanto staciju sarakstu un filtrus.`;
  visibleOnly.checked=false;renderList();
}
