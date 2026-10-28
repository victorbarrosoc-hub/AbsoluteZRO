/**
 * Serviços abertos da calculadora de deslocamento, do mesmo jeito que o ZRO usava: Photon (lugares) e OSRM (km de
 * carro), do OpenStreetMap, e a planilha semanal de preços da ANP. São públicos, de uso justo e sem chave; por isso
 * ficam DESLIGADOS até o titular dar ciência (plano v2 §6.4/§11, fase 13): liga com MAESTRO_SERVICOS_ABERTOS=1.
 * Desligados ou fora do ar, a tela pede os km e o preço do litro à mão (a saída manual existe sempre).
 * O preço da ANP fica em maestro.cache_combustivel por 12 h (porta de sistema: tabela sem dado de ninguém).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { getBanco } from "@/lib/db/client";
import { lugaresDoPhoton, precoNaPlanilha, rotaDoOsrm, type Lugar, type PrecoCombustivel } from "./deslocamento";
import { lerZip } from "./zip";

const UA = "Maestro/1.0 (Absolute ZRO; calculadora de deslocamento; contato@absolutezro.com)";
const PAGINA_ANP =
  "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas";
const DOZE_HORAS = 12 * 60 * 60 * 1000;

export const servicosAbertos = () => process.env.MAESTRO_SERVICOS_ABERTOS === "1";

async function buscar(url: string | URL, ms: number) {
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(ms), cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} em ${new URL(url).host}`);
  return r;
}

/** Cidade ou endereço (Brasil), com preferência pelo que fica perto da base. */
export async function buscarLugares(q: string, perto?: { lat: number; lon: number } | null): Promise<Lugar[]> {
  if (!servicosAbertos()) return [];
  const texto = q.trim().slice(0, 120);
  if (texto.length < 2) return [];
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", texto);
  url.searchParams.set("limit", "12");
  if (perto) {
    url.searchParams.set("lat", String(perto.lat));
    url.searchParams.set("lon", String(perto.lon));
  }
  return lugaresDoPhoton(await (await buscar(url, 8000)).json());
}

/** Km de carro (uma ida) e minutos entre dois pontos. */
export async function medirRota(de: { lat: number; lon: number }, para: { lat: number; lon: number }) {
  if (!servicosAbertos()) return null;
  const c = `${de.lon},${de.lat};${para.lon},${para.lat}`;
  return rotaDoOsrm(await (await buscar(`https://router.project-osrm.org/route/v1/driving/${c}?overview=false`, 10000)).json());
}

async function daAnp(uf: string, cidade: string | null): Promise<PrecoCombustivel | null> {
  const html = await (await buscar(PAGINA_ANP, 15000)).text();
  const link = html.match(/https:\/\/[^"']*resumo_semanal_lpc_[\d-]+_[\d-]+\.xlsx/)?.[0];
  if (!link) throw new Error("planilha semanal não encontrada na página da ANP");
  const buf = Buffer.from(await (await buscar(link, 20000)).arrayBuffer());
  const xlsx = lerZip(
    buf,
    (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || n.startsWith("xl/worksheets/"),
  );
  return precoNaPlanilha(xlsx, uf, cidade);
}

/** Gasolina comum da semana na ANP para a base da organização (cache de 12 h; sem resposta, o último guardado). */
export async function precoDaGasolina(uf: string, cidade: string | null): Promise<PrecoCombustivel | null> {
  if (!servicosAbertos()) return null;
  const chave = `gasolina:${uf}:${(cidade ?? "").toLowerCase().slice(0, 80)}`;
  const banco = getBanco();
  const [guardado] = (await banco.asSystem("cache do combustível", (tx) =>
    tx.execute(sql`select dados, buscado_em from maestro.cache_combustivel where chave = ${chave}`),
  )) as unknown as { dados: PrecoCombustivel; buscado_em: Date }[];
  if (guardado && Date.now() - new Date(guardado.buscado_em).getTime() < DOZE_HORAS) return guardado.dados;
  try {
    const novo = await daAnp(uf, cidade);
    if (novo) {
      await banco.asSystem("cache do combustível", (tx) =>
        tx.execute(sql`insert into maestro.cache_combustivel (chave, dados) values (${chave}, ${JSON.stringify(novo)}::jsonb)
                       on conflict (chave) do update set dados = excluded.dados, buscado_em = now()`),
      );
      return novo;
    }
  } catch (e) {
    console.warn("[anp] preço indisponível agora:", e instanceof Error ? e.message : e);
  }
  return guardado?.dados ?? null;
}
