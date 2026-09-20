import { attachFuelPrices } from "./station-map";
import {describe, expect, it} from "vitest";
import {canonicalNetwork, filterStations, getEvMapStations, routeUrl, wazeUrl, safeSourceUrl, tariffText, validCoordinates, type MapStation, type MapTariff, type StationFilters} from "./station-map";

const tariff: MapTariff = {
  connector:"CCS2",power:50,current:"DC",payment:"app",energy:390,time:null,
  session:null,minimum:null,idle:null,idleAfter:null,timeFrom:null,timeTo:null,weekdays:null,
  vatIncluded:true,observedAt:"2026-09-19T10:00:00Z",checkedAt:null,sourceUrl:null,
};
const ev: MapStation = {id:"ev:1",kind:"ev",network:"Test EV",name:"Ādaži",address:"Rīgas iela",lat:57,lon:24,products:[],sourceUrl:null,updatedAt:null,tariffs:[tariff,{...tariff,connector:"TYPE2",power:150}]};
const fuel: MapStation = {...ev,id:"osm:node/1",kind:"fuel",network:"Test Fuel",products:["P95"],tariffs:[]};
const filters: StationFilters = {kind:"",network:"",query:"",product:"",connector:"",power:0};

describe("station filters",() => {
  it("matches Latvian names with or without diacritics",() => expect(filterStations([ev],{...filters,query:"adazi"})).toEqual([ev]));
  it("does not attribute network prices or fuels to unknown station inventories",() => expect(filterStations([fuel,{...fuel,id:"other",products:[]}],{...filters,product:"P95"})).toEqual([fuel]));
  it("requires power and connector on the same outlet",() => expect(filterStations([ev],{...filters,connector:"CCS2",power:150})).toEqual([]));
  it("combines kind and network constraints",() => expect(filterStations([ev,fuel],{...filters,kind:"fuel",network:"Test EV"})).toEqual([]));
  it("does not treat unknown power as fast charging",() => expect(filterStations([{...ev,tariffs:[{...tariff,power:null}]}],{...filters,power:50})).toEqual([]));
});

it("keeps zero-priced energy and all tariff fees explicit",() => {
  const text=tariffText({...tariff,energy:0,time:100,session:1000,minimum:2000,idle:200,idleAfter:20,timeFrom:"08:00",timeTo:"20:00",weekdays:"1-5",vatIncluded:false});
  for(const part of ["0,000 €/kWh","0,100 €/min","sesija 1,000 €","minimums 2,000 €","dīkstāve 0,200 €/min pēc 20 min","08:00-20:00","dienas 1-5","bez PVN"]) expect(text).toContain(part);
});

it("does not convert minute prices to invented per-kWh prices",() => {
  expect(tariffText({...tariff,energy:null,time:200})).toBe("0,200 €/min; ar PVN");
});

it("rejects missing, invalid and out-of-range coordinates",() => {
  for(const [lat,lon] of [[null,24],[57,undefined],[NaN,24],[91,24],[57,181],[0,0]]) expect(validCoordinates(lat,lon)).toBe(false);
  expect(validCoordinates(57,24)).toBe(true);
});

it("only links to HTTPS source URLs",() => {
  expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
  expect(safeSourceUrl("https://example.org/source")).toBe("https://example.org/source");
});

it("route URL includes only the destination, not the user's coordinates",() => {
  expect(routeUrl(ev)).toBe("https://www.google.com/maps/dir/?api=1&destination=57,24");
});

it("Waze URL also carries only the destination",() => {
  expect(wazeUrl(ev)).toBe("https://waze.com/ul?ll=57,24&navigate=yes");
});

it("skips station rows with null coordinates instead of putting them near 0,0",async() => {
  const db={prepare:()=>({all:async()=>({results:[{id:"bad",lat:null,lon:null}]})})} as unknown as D1Database;
  expect(await getEvMapStations(db)).toEqual([]);
});

it("groups known network aliases without merging unrelated brands", () => {
  expect(canonicalNetwork('AS "VIADA Baltija"')).toBe("Viada");
  expect(canonicalNetwork("Kool")).toBe("KOOL");
  expect(canonicalNetwork("  Virši-A  ")).toBe("Virši");
  expect(canonicalNetwork("Neatkarīgs tīkls")).toBe("Neatkarīgs tīkls");
});


describe("attachFuelPrices", () => {
  const price = {networkId:"circlek", networkName:"Circle K", priceMilli:1914, changeMilli:null, age:"today" as const, origin:null, sourceUrl:null, observedAt:"2026-09-18T10:00:00Z",scope:"cheapest_riga",whereText:"Brīvības gatve 265, Dzirciema iela 40"};
  const products = [{product:"P95",label:"95",prices:[price]}];
  const station = {...ev,kind:"fuel" as const,network:"Circle K",address:"Brīvības gatve 265, Rīga",tariffs:[]};
  it("joins the exact operator and full Riga address, preserving product and timestamp", () => {
    expect(attachFuelPrices([station],products)[0].fuelPrices).toEqual([{...price,product:"P95",label:"95"}]);
    expect(attachFuelPrices([station],products)[0].products).toContain("P95");
  });
  it("does not copy minima to another house, city, network or an unspecified address", () => {
    for(const change of [{address:"Brīvības gatve 26, Rīga"},{address:"Brīvības gatve 265A, Rīga"},{address:"Brīvības gatve 265, Liepāja"},{network:"Viada"},{address:""}]) {
      expect(attachFuelPrices([{...station,...change}],products)[0].fuelPrices ?? []).toEqual([]);
    }
  });
  it("does not treat an unsupported source scope as a station quote", () => {
    expect(attachFuelPrices([station],[{...products[0],prices:[{...price,scope:"network"}]}])[0].fuelPrices).toEqual([]);
  });
});
