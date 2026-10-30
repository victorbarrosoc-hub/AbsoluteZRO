/**
 * Serviços de fora da calculadora de deslocamento.
 *
 * - Photon (lugares) e OSRM (km de carro), do OpenStreetMap: públicos, de uso justo e sem chave. LIGADOS desde
 *   29/10/2026 (o titular pediu o km medido sozinho; plano v2 §6.4/§11, fase 13); MAESTRO_SERVICOS_ABERTOS=0 desliga.
 *   Só o servidor fala com eles (Server Actions, nada no navegador e nada na CSP), com o nome do Maestro no
 *   user-agent, a busca presa ao Brasil e uma memória curta por servidor para não repetir a mesma pergunta. Desligados
 *   ou fora do ar, a tela diz e pede os km à mão.
 * - ANP (preço do litro): ligada desde 29/10/2026 (pedido do titular, "combustível automático"). Quem fala com a ANP é
 *   só o agendamento semanal (`coletarSemanaAnp`, GET /api/cron/combustivel, CRON_SECRET), que guarda a planilha da
 *   semana em maestro.combustivel_precos (drizzle/0022); a calculadora só lê do banco (`precoDoCombustivel`). Sem
 *   semana guardada, a tela pede o preço à mão e diz por quê; nada é inventado.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto } from "@/lib/db/client";
import {
  chaveDoMunicipio,
  escolherPreco,
  lerTextoDeLugar,
  linkDaPlanilhaSemanal,
  lugaresDoPhoton,
  rotaDoOsrm,
  semanaDaPlanilha,
  type Combustivel,
  type Lugar,
  type PrecoCombustivel,
  type PrecoGuardado,
} from "./deslocamento";
import { lerZip } from "./zip";

const UA = "Maestro/1.0 (Absolute ZRO; calculadora de deslocamento; contato@absolutezro.com)";
export const PAGINA_ANP =
  "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas";
/** Semanas guardadas (a mais nova e as 7 anteriores). */
export const SEMANAS_GUARDADAS = 8;

export const servicosAbertos = () => process.env.MAESTRO_SERVICOS_ABERTOS !== "0";
/** Photon e OSRM (trocam só em teste: MAESTRO_PHOTON_URL e MAESTRO_OSRM_URL apontam para os de mentira). */
const photonUrl = () => process.env.MAESTRO_PHOTON_URL || "https://photon.komoot.io/api/";
const osrmUrl = () => (process.env.MAESTRO_OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
/** O Brasil inteiro (oeste, sul, leste, norte), para a busca não trazer Natal da África do Sul. */
const BBOX_BRASIL = "-74.1,-34.0,-28.6,5.4";
/** A página da ANP (troca só em teste: MAESTRO_ANP_URL aponta para uma ANP falsa). */
const paginaAnp = () => process.env.MAESTRO_ANP_URL || PAGINA_ANP;

async function buscar(url: string | URL, ms: number) {
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(ms), cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} em ${new URL(url).host}`);
  return r;
}

/** Memória curta por servidor (uso justo dos serviços públicos): até 300 respostas, por 12 h. */
const MEMORIA_MS = 12 * 60 * 60 * 1000;
function memoria<T>() {
  const m = new Map<string, { em: number; valor: T }>();
  return {
    ler(k: string): T | undefined {
      const v = m.get(k);
      if (!v) return undefined;
      if (Date.now() - v.em > MEMORIA_MS) return void m.delete(k);
      return v.valor;
    },
    gravar(k: string, valor: T) {
      if (m.size >= 300) m.delete(m.keys().next().value!);
      m.set(k, { em: Date.now(), valor });
    },
  };
}
const lugaresGuardados = memoria<Lugar[]>();
const rotasGuardadas = memoria<{ km: number; minutos: number } | null>();

/** Cidade ou endereço (Brasil), com preferência pelo que fica perto da base. */
export async function buscarLugares(q: string, perto?: { lat: number; lon: number } | null): Promise<Lugar[]> {
  if (!servicosAbertos()) return [];
  const texto = q.replace(/\s+/g, " ").trim().slice(0, 120);
  if (texto.length < 2) return [];
  const url = new URL(photonUrl());
  url.searchParams.set("q", texto);
  url.searchParams.set("limit", "12");
  url.searchParams.set("bbox", BBOX_BRASIL);
  if (perto) {
    url.searchParams.set("lat", perto.lat.toFixed(2));
    url.searchParams.set("lon", perto.lon.toFixed(2));
  }
  const chave = url.search.toLowerCase();
  const guardado = lugaresGuardados.ler(chave);
  if (guardado) return guardado;
  const lugares = lugaresDoPhoton(await (await buscar(url, 8000)).json());
  lugaresGuardados.gravar(chave, lugares);
  return lugares;
}

/** Km de carro (uma ida) e minutos entre dois pontos. */
export async function medirRota(de: { lat: number; lon: number }, para: { lat: number; lon: number }) {
  if (!servicosAbertos()) return null;
  const c = `${de.lon.toFixed(5)},${de.lat.toFixed(5)};${para.lon.toFixed(5)},${para.lat.toFixed(5)}`;
  const guardada = rotasGuardadas.ler(c);
  if (guardada !== undefined) return guardada;
  const rota = rotaDoOsrm(await (await buscar(`${osrmUrl()}/route/v1/driving/${c}?overview=false`, 10000)).json());
  rotasGuardadas.gravar(c, rota);
  return rota;
}

/* ───────────── ANP: o agendamento guarda, a calculadora lê ───────────── */

export type ColetaAnp = { ok: true; semana: string; semanaFim: string; linhas: number; fonte: string; apagadas: number } | { ok: false; erro: string };

/**
 * Baixa a planilha semanal mais nova da ANP e guarda a semana (gasolina, etanol e diesel S10 por município, estado e
 * Brasil). Repetir a mesma semana só regrava os mesmos números. Guarda as últimas 8 semanas. Nunca lança.
 */
export async function coletarSemanaAnp(): Promise<ColetaAnp> {
  try {
    const pagina = paginaAnp();
    const html = await (await buscar(pagina, 20000)).text();
    const link = linkDaPlanilhaSemanal(html, pagina);
    if (!link) throw new Error("planilha semanal não encontrada na página da ANP");
    const buf = Buffer.from(await (await buscar(link, 30000)).arrayBuffer());
    const xlsx = lerZip(
      buf,
      (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || n.startsWith("xl/worksheets/"),
    );
    const s = semanaDaPlanilha(xlsx);
    if (!s) throw new Error("planilha da ANP sem gasolina, etanol ou diesel S10");
    const apagadas = await getBanco().asSystem("combustível da ANP (agendamento)", async (tx) => {
      for (let i = 0; i < s.linhas.length; i += 500) {
        const lote = s.linhas.slice(i, i + 500);
        await tx.execute(sql`
          insert into maestro.combustivel_precos (semana, semana_fim, uf, municipio, combustivel, preco_medio, postos, fonte)
          values ${sql.join(
            lote.map((l) => sql`(${s.semana}::date, ${s.semanaFim}::date, ${l.uf}, ${l.municipio}, ${l.combustivel}, ${l.preco}, ${l.postos}, ${link})`),
            sql`, `,
          )}
          on conflict (semana, uf, municipio, combustivel) do update set semana_fim = excluded.semana_fim, preco_medio = excluded.preco_medio,
            postos = excluded.postos, fonte = excluded.fonte, buscado_em = now()`);
      }
      const r = await tx.execute(sql`
        delete from maestro.combustivel_precos
        where semana < (select max(semana) from maestro.combustivel_precos) - ${(SEMANAS_GUARDADAS - 1) * 7}::int
        returning 1`);
      return r.length;
    });
    return { ok: true, semana: s.semana, semanaFim: s.semanaFim, linhas: s.linhas.length, fonte: link, apagadas };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.warn("[anp] coleta da semana falhou:", erro);
    return { ok: false, erro };
  }
}

let ultimaTentativa = 0;
/**
 * Sem nenhuma semana guardada, ou com a última terminada há mais de 13 dias (o agendamento falhou), tenta coletar de
 * novo, no máximo uma vez por hora por servidor. Para `after()`: nunca segura a resposta.
 */
export async function coletarSeAtrasado(hoje: string): Promise<void> {
  if (Date.now() - ultimaTentativa < 60 * 60 * 1000) return;
  const [r] = (await getBanco().asSystem("combustível da ANP (conferir semana)", (tx) =>
    tx.execute(sql`select max(semana_fim)::text as fim from maestro.combustivel_precos`),
  )) as unknown as { fim: string | null }[];
  const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
  if (r?.fim && r.fim >= limite) return;
  ultimaTentativa = Date.now();
  await coletarSemanaAnp();
}

/**
 * O preço médio da semana mais nova guardada para o lugar (a cidade de saída; senão a da produtora): o município,
 * senão o estado, senão o Brasil (regra em `escolherPreco`, deslocamento.ts). Lido como a pessoa (maestro_app só lê
 * esta tabela). Sem nada guardado, null.
 */
export async function precoDoCombustivel(
  ctx: Contexto,
  lugar: { uf: string | null; cidade: string | null },
  combustivel: Combustivel,
): Promise<PrecoCombustivel | null> {
  const municipio = lugar.cidade ? chaveDoMunicipio(lerTextoDeLugar(lugar.cidade).nome) : "";
  const linhas = (await getBanco().asUser(ctx, (tx) =>
    tx.execute(sql`
      select semana::text, semana_fim::text as "semanaFim", uf, municipio, preco_medio::float8 as preco, postos, fonte
      from maestro.combustivel_precos
      where combustivel = ${combustivel}
        and semana = (select max(semana) from maestro.combustivel_precos where combustivel = ${combustivel})
        and (municipio = '' or (municipio = ${municipio} and ${municipio} <> ''))`),
  )) as unknown as PrecoGuardado[];
  return escolherPreco(linhas, lugar, combustivel);
}
