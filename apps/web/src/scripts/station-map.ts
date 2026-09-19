import * as maplibregl from "maplibre-gl";
import type {GeoJSONSource, Map as MapLibreMap} from "maplibre-gl";
import type {FeatureCollection, Point} from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import {filterStations, connectorLabel, routeUrl, safeSourceUrl, tariffText, type MapStation, type StationFilters} from "../lib/station-map";

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
let locationMarker: maplibregl.Marker | null = null;

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

function dateLabel(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "nav zināms";
  return new Date(value).toLocaleDateString("lv-LV", {timeZone:"Europe/Riga"});
}

function showStation(station: MapStation, move = true) {
  selectedId = station.id;
  detail.replaceChildren(); detail.hidden = false;
  const close = element("button", "Aizvērt detaļas", "detail-close"); close.type = "button";
  close.addEventListener("click", () => { detail.hidden = true; selectedId = null; });
  appendAll(detail, close, element("h2", station.name), element("p", `${station.network} / ${station.kind === "ev" ? "EV uzlāde" : "Degviela"}`), element("p", station.address || "Adrese nav norādīta"));
  if (station.kind === "fuel") {
    detail.appendChild(element("p", "Šīs stacijas cena nav zināma. Tīkla zemākā cena uz šo vietu netiek attiecināta."));
    detail.appendChild(element("p", station.products.length ? `OSM norādītie produkti: ${station.products.join(", ")}` : "Degvielas veidi nav norādīti."));
    detail.appendChild(element("p", `Atrašanās vietas avots: OpenStreetMap. Dati izgūti ${dateLabel(station.updatedAt)}`));
  } else {
    detail.appendChild(element("p", "Operatora pēdējie novērotie tarifi. Uzlādes vietu aizņemtības dati nav pieejami."));
    if (!station.tariffs.length) detail.appendChild(element("p", "Šīs stacijas tarifs un savienotāji nav zināmi. Pārbaudi operatora avotā."));
    const tariffs = element("ul");
    for (const tariff of station.tariffs) {
      const item = element("li");
      const payment = {app:"lietotnē",adhoc:"bez līguma",subscription:"abonementam"}[tariff.payment] ?? tariff.payment;
      item.appendChild(element("strong", `${connectorLabel(tariff.connector)} / ${tariff.current}${tariff.power !== null ? ` / ${tariff.power} kW` : ""}`));
      item.appendChild(element("p", `${tariffText(tariff)}. Maksājums: ${payment}.`));
      item.appendChild(element("span", `Cena novērota ${dateLabel(tariff.observedAt)} Avota pārbaude ${dateLabel(tariff.checkedAt)}`, "tariff-age"));
      const checked = tariff.checkedAt ? Date.parse(tariff.checkedAt) : NaN;
      if (!Number.isFinite(checked) || Date.now() - checked > 24 * 60 * 60 * 1000) item.appendChild(element("p", "Avots nav veiksmīgi pārbaudīts pēdējās 24 stundās. Pārbaudi cenu pie operatora.", "stale-note"));
      const source = safeSourceUrl(tariff.sourceUrl);
      if (source) item.appendChild(link("Tarifa avots", source));
      tariffs.appendChild(item);
    }
    detail.appendChild(tariffs);
  }
  const source = safeSourceUrl(station.sourceUrl);
  if (source) { const p = element("p"); p.appendChild(link(station.kind === "fuel" ? "Vieta OpenStreetMap" : "Operatora avots", source)); detail.appendChild(p); }
  const route = element("p"); route.appendChild(link("Atvērt maršrutu Google Maps", routeUrl(station))); detail.appendChild(route);
  detail.scrollIntoView({block:"nearest",behavior:"instant"});
  close.focus({preventScroll:true});
  if (move && map) map.easeTo({center:[station.lon,station.lat],zoom:Math.max(map.getZoom(),13),duration:matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350});
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
    appendAll(row, button,element("p",`${station.kind === "ev" ? "E / EV" : "D / Degviela"} - ${station.network}`),element("p",station.address || "Adrese nav norādīta"));
    if (station.kind === "ev") {
      row.appendChild(element("p",[...new Set(station.tariffs.map((tariff) => `${connectorLabel(tariff.connector)}${tariff.power !== null ? ` ${tariff.power} kW` : ""}`))].join(", ")));
    } else row.appendChild(element("p","Stacijas cena nav zināma"));
    fragment.append(row);
  }
  if (!shown.length) fragment.append(element("p", "Šajā apgabalā nav atbilstošu staciju. Samazini filtrus vai spied “Rādīt visus rezultātus”.", "station-list-item"));
  list.replaceChildren(fragment); more.hidden = shown.length <= limit;
}

function geojson(): FeatureCollection<Point> {
  return {type:"FeatureCollection",features:filtered.map((station) => ({type:"Feature",geometry:{type:"Point",coordinates:[station.lon,station.lat]},properties:{id:station.id,kind:station.kind}}))};
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
  map.on("load", () => {
    if(!map) return;
    map.addSource("stations",{type:"geojson",data:geojson(),cluster:true,clusterMaxZoom:12,clusterRadius:40});
    map.addLayer({id:"clusters",type:"circle",source:"stations",filter:["has","point_count"],paint:{"circle-color":COLOR_INK,"circle-radius":["step",["get","point_count"],17,25,22,100,28],"circle-stroke-color":"#fff","circle-stroke-width":2}});
    map.addLayer({id:"cluster-count",type:"symbol",source:"stations",filter:["has","point_count"],layout:{"text-field":["get","point_count_abbreviated"],"text-font":["Noto Sans Regular"],"text-size":12},paint:{"text-color":"#fff"}});
    map.addLayer({id:"stations",type:"circle",source:"stations",filter:["!",["has","point_count"]],paint:{"circle-color":["match",["get","kind"],"ev",COLOR_EV,COLOR_FUEL],"circle-radius":10,"circle-stroke-color":"#fff","circle-stroke-width":2}});
    map.addLayer({id:"station-labels",type:"symbol",source:"stations",filter:["!",["has","point_count"]],layout:{"text-field":["match",["get","kind"],"ev","E","D"],"text-font":["Noto Sans Regular"],"text-size":10,"text-allow-overlap":true},paint:{"text-color":"#fff"}});
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
