/**
 * Photon e OSRM de mentira (servidor local) para a calculadora de deslocamento no e2e e nos testes: respostas no
 * desenho das de verdade (GeoJSON do Photon, `code`/`routes` do OSRM), com poucos lugares. As coordenadas e a rota
 * São Paulo → Natal copiam a ordem de grandeza do OpenStreetMap; os outros km são a distância em linha reta × 1,3.
 * `fora` = 503 em tudo (a tela pede os km à mão).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

type Feature = { geometry: { type: "Point"; coordinates: [number, number] }; properties: Record<string, string> };
const f = (lon: number, lat: number, properties: Record<string, string>): Feature => ({ geometry: { type: "Point", coordinates: [lon, lat] }, properties });

/** Em ordem de relevância, como o Photon devolve. */
export const LUGARES: Feature[] = [
  f(-46.63, -23.55, { osm_key: "place", osm_value: "state", type: "state", name: "São Paulo", country: "Brasil", countrycode: "BR" }),
  f(-46.633, -23.5505, { osm_key: "place", osm_value: "municipality", type: "city", name: "São Paulo", state: "São Paulo", countrycode: "BR" }),
  f(-47.48, -1.35, { osm_key: "place", osm_value: "suburb", type: "district", name: "São Paulo", city: "Capanema", state: "Pará", countrycode: "BR" }),
  f(-35.2081, -5.8054, { osm_key: "place", osm_value: "municipality", type: "city", name: "Natal", state: "Rio Grande do Norte", countrycode: "BR" }),
  f(-35.2062, -5.7804, {
    osm_key: "railway",
    osm_value: "station",
    type: "house",
    name: "Natal",
    street: "Praça Augusto Severo",
    city: "Natal",
    state: "Rio Grande do Norte",
    countrycode: "BR",
  }),
  f(-42.57, -5.6, { osm_key: "place", osm_value: "town", type: "district", name: "Natal", city: "Sigefredo Pacheco", state: "Piauí", countrycode: "BR" }),
  f(-47.06, -22.9, { osm_key: "place", osm_value: "municipality", type: "city", name: "Campinas", state: "São Paulo", countrycode: "BR" }),
  f(-37.344, -5.188, { osm_key: "place", osm_value: "municipality", type: "city", name: "Mossoró", state: "Rio Grande do Norte", countrycode: "BR" }),
];

const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** O Photon de mentira: lugares cujo nome começa pelo primeiro pedaço do texto (sem acento, sem caixa). */
export function photonFalso(q: string) {
  const alvo = chave(q.split(/[,/]/)[0] ?? "");
  return { type: "FeatureCollection", features: alvo.length < 2 ? [] : LUGARES.filter((l) => chave(l.properties.name).startsWith(alvo)) };
}

/** O OSRM de mentira: São Paulo → Natal 2.923,1 km / 40h45; o resto, linha reta × 1,3 a 80 km/h. */
export function osrmFalso(coordenadas: string) {
  const [[lon1, lat1], [lon2, lat2]] = coordenadas.split(";").map((p) => p.split(",").map(Number));
  if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) return { code: "InvalidQuery" };
  const perto = (a: number, b: number) => Math.abs(a - b) < 0.05;
  const spNatal = (perto(lat1, -23.55) && perto(lat2, -5.805)) || (perto(lat2, -23.55) && perto(lat1, -5.805));
  const rad = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  const metros = spNatal ? 2_923_076 : 2 * 6_371_000 * Math.asin(Math.sqrt(h)) * 1.3;
  const segundos = spNatal ? 146_704 : (metros / 80_000) * 3600;
  return { code: "Ok", routes: [{ distance: metros, duration: segundos }] };
}

export async function iniciarRotaFalsa(porta = 0) {
  const estado = { fora: false, pedidos: [] as string[] };
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    estado.pedidos.push(url.pathname + url.search);
    if (estado.fora) return void res.writeHead(503).end("fora do ar");
    const json = (v: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(v));
    };
    if (url.pathname.startsWith("/photon/api")) return json(photonFalso(url.searchParams.get("q") ?? ""));
    const m = url.pathname.match(/^\/osrm\/route\/v1\/driving\/(.+)$/);
    if (m) return json(osrmFalso(decodeURIComponent(m[1])));
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => servidor.listen(porta, "127.0.0.1", ok));
  const base = () => `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  return {
    estado,
    get photon() {
      return `${base()}/photon/api/`;
    },
    get osrm() {
      return `${base()}/osrm`;
    },
    fechar: () =>
      new Promise<void>((ok) => {
        servidor.closeAllConnections();
        servidor.close(() => ok());
      }),
  };
}
