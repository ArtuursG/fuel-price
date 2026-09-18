// PARAUGA DATI. Kolektors (2. fāze) un ingest (3. fāze) šo aizstās ar reālu
// D1 vaicājumu. Forma apzināti sakrīt ar db/migrations shēmu (price_milli,
// product kodi, scope, age/origin), lai nomaiņa būtu vienkārša.

export type Product = "P95" | "P98" | "DSL" | "LPG";
export type AgeBucket = "today" | "1-2d" | "3-7d" | "older";
export type Origin = "network_page" | "official_register" | "official_average";

export interface NetworkPrice {
  networkId: string;
  networkName: string;
  priceMilli: number;
  changeMilli: number; // vs iepriekšējā ziņotā cena
  age: AgeBucket;
  origin: Origin;
  scope: "network" | "cheapest_riga" | "cheapest";
}

export interface ProductRow {
  product: Product;
  label: string;
  prices: NetworkPrice[];
}

const origin: Origin = "network_page";

export const SAMPLE_PRODUCTS: ProductRow[] = [
  {
    product: "P95",
    label: "95",
    prices: [
      { networkId: "straujupite", networkName: "Straujupīte", priceMilli: 1579, changeMilli: -20, age: "today", origin, scope: "cheapest" },
      { networkId: "circlek", networkName: "Circle K", priceMilli: 1589, changeMilli: -10, age: "today", origin, scope: "cheapest_riga" },
      { networkId: "virsi", networkName: "Virši", priceMilli: 1599, changeMilli: 0, age: "today", origin, scope: "network" },
      { networkId: "viada", networkName: "Viada", priceMilli: 1609, changeMilli: 10, age: "1-2d", origin, scope: "cheapest" },
    ],
  },
  {
    product: "P98",
    label: "98",
    prices: [
      { networkId: "circlek", networkName: "Circle K", priceMilli: 1719, changeMilli: 10, age: "today", origin, scope: "cheapest_riga" },
      { networkId: "virsi", networkName: "Virši", priceMilli: 1729, changeMilli: 10, age: "today", origin, scope: "network" },
      { networkId: "viada", networkName: "Viada", priceMilli: 1739, changeMilli: 0, age: "1-2d", origin, scope: "cheapest" },
    ],
  },
  {
    product: "DSL",
    label: "D",
    prices: [
      { networkId: "circlek", networkName: "Circle K", priceMilli: 1649, changeMilli: 0, age: "today", origin, scope: "cheapest_riga" },
      { networkId: "straujupite", networkName: "Straujupīte", priceMilli: 1664, changeMilli: 10, age: "today", origin, scope: "cheapest" },
      { networkId: "virsi", networkName: "Virši", priceMilli: 1659, changeMilli: 0, age: "today", origin, scope: "network" },
      { networkId: "viada", networkName: "Viada", priceMilli: 1679, changeMilli: 20, age: "1-2d", origin, scope: "cheapest" },
    ],
  },
  {
    product: "LPG",
    label: "LPG",
    prices: [
      { networkId: "virsi", networkName: "Virši", priceMilli: 869, changeMilli: -10, age: "today", origin, scope: "network" },
      { networkId: "circlek", networkName: "Circle K", priceMilli: 879, changeMilli: -10, age: "today", origin, scope: "cheapest_riga" },
      { networkId: "viada", networkName: "Viada", priceMilli: 889, changeMilli: 0, age: "1-2d", origin, scope: "cheapest" },
    ],
  },
];

export const UNPUBLISHED_NETWORKS = [{ networkId: "neste", networkName: "Neste" }];

export function formatPrice(priceMilli: number): string {
  return (priceMilli / 1000).toFixed(3).replace(".", ",");
}

export function cheapest(row: ProductRow): NetworkPrice {
  return row.prices.reduce((min, p) => (p.priceMilli < min.priceMilli ? p : min), row.prices[0]);
}

export const AGE_LABELS: Record<AgeBucket, string> = {
  "today": "šodien",
  "1-2d": "1-2 dienas",
  "3-7d": "3-7 dienas",
  "older": "vecāka",
};

export const ORIGIN_LABELS: Record<Origin, string> = {
  network_page: "tīkla lapa",
  official_register: "oficiāls reģistrs",
  official_average: "oficiālais vidējais",
};
