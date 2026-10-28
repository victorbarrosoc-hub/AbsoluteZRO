/**
 * Calculadora de deslocamento (plano v2 §6.4; porte de travel-item.tsx, services/route.ts e services/fuel.ts do ZRO),
 * generalizada: a origem é a cidade base da organização (não mais Natal) e o preço da gasolina é o da ANP da capital
 * da UF da organização ou, fora da capital, a média do estado. Aqui só o que é puro (contas e leitura das respostas
 * de Photon, OSRM e da planilha da ANP); quem busca é src/lib/orcamento/servicos.ts, e sempre há a saída manual.
 */

export type Lugar = { rotulo: string; detalhe: string; lat: number; lon: number };

export type EntradaDeslocamento = {
  /** Km de uma ida. */
  kmIda: number;
  idaEVolta: boolean;
  viagens: number;
  /** Consumo do carro (km por litro). */
  kmPorLitro: number;
  /** Preço do litro, em centavos. */
  litroCents: number;
  /** Pedágio por viagem completa (opcional), em centavos. */
  pedagioCents?: number;
};

export type Deslocamento = { kmTotal: number; litros: number; combustivelCents: number; pedagioCents: number; custoCents: number };

/** Rodagem total, litros e custo (combustível + pedágio). Entrada ruim dá zero, nunca NaN. */
export function calcularDeslocamento(e: EntradaDeslocamento): Deslocamento {
  const ok = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  const viagens = Math.max(1, Math.round(ok(e.viagens)) || 1);
  const kmTotal = ok(e.kmIda) * (e.idaEVolta ? 2 : 1) * viagens;
  const kml = ok(e.kmPorLitro);
  const litros = kml > 0 ? kmTotal / kml : 0;
  const combustivelCents = Math.round(litros * ok(e.litroCents));
  const pedagioCents = Math.round(ok(e.pedagioCents ?? 0) * viagens);
  return { kmTotal, litros, combustivelCents, pedagioCents, custoCents: combustivelCents + pedagioCents };
}

const fmt = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const reais = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A linha "Deslocamento" do orçamento: "Natal → Mossoró", "560 km · ida e volta · 2 viagens · 46,7 L a R$ 6,29/L". */
export function linhaDeDeslocamento(e: EntradaDeslocamento, de: string | null, para: string | null) {
  const d = calcularDeslocamento(e);
  const rota = [de, para].filter(Boolean).join(" → ") || `${fmt(e.kmIda)} km`;
  const viagens = Math.max(1, Math.round(e.viagens) || 1);
  const detalhe = [
    `${fmt(d.kmTotal, 0)} km`,
    e.idaEVolta ? "ida e volta" : "só ida",
    viagens > 1 ? `${viagens} viagens` : null,
    `${fmt(d.litros)} L a ${reais(e.litroCents)}/L`,
    d.pedagioCents > 0 ? `pedágio ${reais(d.pedagioCents)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { descricao: `Deslocamento ${rota}`, detalhe, quantidade: 1, unidade: "trecho", precoCents: d.custoCents, custoCents: d.custoCents };
}

/* ───────────── UF, capitais e nomes ───────────── */

export const UFS: Record<string, { estado: string; capital: string }> = {
  AC: { estado: "Acre", capital: "Rio Branco" },
  AL: { estado: "Alagoas", capital: "Maceió" },
  AP: { estado: "Amapá", capital: "Macapá" },
  AM: { estado: "Amazonas", capital: "Manaus" },
  BA: { estado: "Bahia", capital: "Salvador" },
  CE: { estado: "Ceará", capital: "Fortaleza" },
  DF: { estado: "Distrito Federal", capital: "Brasília" },
  ES: { estado: "Espírito Santo", capital: "Vitória" },
  GO: { estado: "Goiás", capital: "Goiânia" },
  MA: { estado: "Maranhão", capital: "São Luís" },
  MT: { estado: "Mato Grosso", capital: "Cuiabá" },
  MS: { estado: "Mato Grosso do Sul", capital: "Campo Grande" },
  MG: { estado: "Minas Gerais", capital: "Belo Horizonte" },
  PA: { estado: "Pará", capital: "Belém" },
  PB: { estado: "Paraíba", capital: "João Pessoa" },
  PR: { estado: "Paraná", capital: "Curitiba" },
  PE: { estado: "Pernambuco", capital: "Recife" },
  PI: { estado: "Piauí", capital: "Teresina" },
  RJ: { estado: "Rio de Janeiro", capital: "Rio de Janeiro" },
  RN: { estado: "Rio Grande do Norte", capital: "Natal" },
  RS: { estado: "Rio Grande do Sul", capital: "Porto Alegre" },
  RO: { estado: "Rondônia", capital: "Porto Velho" },
  RR: { estado: "Roraima", capital: "Boa Vista" },
  SC: { estado: "Santa Catarina", capital: "Florianópolis" },
  SP: { estado: "São Paulo", capital: "São Paulo" },
  SE: { estado: "Sergipe", capital: "Aracaju" },
  TO: { estado: "Tocantins", capital: "Palmas" },
};
export const ehUf = (v: unknown): v is string => typeof v === "string" && v in UFS;

/** Sem acento, maiúsculas, um espaço: "São Luís" → "SAO LUIS". */
export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

const SIGLA_DO_ESTADO = new Map(Object.entries(UFS).map(([uf, v]) => [semAcento(v.estado), uf]));

/* ───────────── Photon (lugares) e OSRM (rota) ───────────── */

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    state?: string;
    countrycode?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
};

/** Resposta do Photon → até 6 lugares do Brasil, cidade antes de rua (a mesma regra do ZRO). */
export function lugaresDoPhoton(dados: unknown): Lugar[] {
  const features = (((dados as { features?: PhotonFeature[] })?.features ?? []) as PhotonFeature[]).filter((f) => Array.isArray(f?.geometry?.coordinates));
  const rank = (f: PhotonFeature) => {
    const p = f.properties ?? {};
    const t = p.type ?? p.osm_value ?? "";
    if (["city", "town", "municipality"].includes(t)) return 0;
    if (["village", "hamlet", "suburb", "district", "locality", "county", "state"].includes(t)) return 1;
    if (p.osm_key && p.osm_key !== "highway" && t !== "street" && t !== "house") return 2;
    return 3;
  };
  const ordem = features.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i);
  const vistos = new Set<string>();
  const out: Lugar[] = [];
  for (const { f } of ordem) {
    const p = f.properties ?? {};
    if (p.countrycode && p.countrycode !== "BR") continue;
    const uf = p.state ? (SIGLA_DO_ESTADO.get(semAcento(p.state)) ?? p.state) : "";
    const rua = p.street ? [p.street, p.housenumber].filter(Boolean).join(", ") : "";
    const rotulo = p.name || rua || p.city || "";
    if (!rotulo) continue;
    const detalhe = [p.name && rua && p.name !== rua ? rua : "", p.district, p.city !== rotulo ? p.city : "", uf].filter(Boolean).join(" · ");
    const [lon, lat] = f.geometry!.coordinates!;
    const chave = `${rotulo}|${detalhe}`;
    if (vistos.has(chave) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    vistos.add(chave);
    out.push({ rotulo, detalhe, lat, lon });
    if (out.length >= 6) break;
  }
  return out;
}

/** Resposta do OSRM → km de uma ida (1 casa) e minutos; null sem rota. */
export function rotaDoOsrm(dados: unknown): { km: number; minutos: number } | null {
  const d = dados as { code?: string; routes?: { distance?: number; duration?: number }[] };
  const r = d?.code === "Ok" ? d.routes?.[0] : undefined;
  if (!r || !Number.isFinite(r.distance) || !Number.isFinite(r.duration)) return null;
  return { km: Math.round((r.distance! / 1000) * 10) / 10, minutos: Math.round(r.duration! / 60) };
}

/* ───────────── ANP: planilha semanal "resumo_semanal_lpc" ───────────── */

export type PrecoCombustivel = {
  /** Preço médio do litro, em centavos. */
  litroCents: number;
  inicio: string;
  fim: string;
  postos: number;
  /** "capital" (média do município) ou "estado" (média do estado). */
  base: "capital" | "estado";
  onde: string;
  buscadoEm: string;
};

/** Data do Excel (dias desde 1899-12-30) → AAAA-MM-DD. */
export function dataDoExcel(serial: string): string {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
}

const decodificar = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Arquivos de dentro do .xlsx (o que importa): workbook, relações, textos compartilhados e as abas. */
export type Xlsx = Record<string, string>;

/** As linhas de uma aba, por nome, como mapas coluna → texto. */
export function linhasDaAba(xlsx: Xlsx, aba: string): Record<string, string>[] {
  const alvo = semAcento(aba);
  const workbook = xlsx["xl/workbook.xml"] ?? "";
  let rid: string | undefined;
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const nome = m[0].match(/name="([^"]*)"/)?.[1];
    if (nome && semAcento(decodificar(nome)) === alvo) rid = m[0].match(/r:id="([^"]+)"/)?.[1];
  }
  if (!rid) return [];
  const rels = xlsx["xl/_rels/workbook.xml.rels"] ?? "";
  let alvoArquivo: string | undefined;
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    if (m[0].includes(`Id="${rid}"`)) alvoArquivo = m[0].match(/Target="([^"]+)"/)?.[1];
  }
  if (!alvoArquivo) return [];
  const folha = xlsx[`xl/${alvoArquivo.replace(/^\/?xl\//, "")}`] ?? "";
  const compartilhados = [...(xlsx["xl/sharedStrings.xml"] ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodificar(m[1].replace(/<[^>]+>/g, "")));
  const linhas: Record<string, string>[] = [];
  for (const r of folha.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const celulas: Record<string, string> = {};
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const bruto = c[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? c[3]?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      celulas[c[1]] = /t="s"/.test(c[2]) && bruto ? (compartilhados[Number(bruto)] ?? "") : decodificar(bruto);
    }
    linhas.push(celulas);
  }
  return linhas;
}

type Colunas = { ini: string; fim: string; estado: string; municipio?: string; produto: string; postos?: string; preco: string };

/** Acha o cabeçalho (a linha com PRODUTO) e as colunas pelo nome; sem cabeçalho, o desenho fixo da aba CAPITAIS. */
function colunas(linhas: Record<string, string>[]): { inicio: number; c: Colunas } {
  for (const [i, l] of linhas.entries()) {
    const nomes = Object.entries(l).map(([k, v]) => [k, semAcento(v)] as const);
    const acha = (f: (v: string) => boolean) => nomes.find(([, v]) => f(v))?.[0];
    const produto = acha((v) => v === "PRODUTO");
    const preco = acha((v) => v.includes("PRECO MEDIO REVENDA"));
    const estado = acha((v) => v.startsWith("ESTADO"));
    if (produto && preco && estado) {
      return {
        inicio: i + 1,
        c: {
          ini: acha((v) => v.includes("DATA INICIAL")) ?? "A",
          fim: acha((v) => v.includes("DATA FINAL")) ?? "B",
          estado,
          municipio: acha((v) => v.startsWith("MUNICIPIO")),
          produto,
          postos: acha((v) => v.includes("POSTOS")),
          preco,
        },
      };
    }
  }
  return { inicio: 0, c: { ini: "A", fim: "B", estado: "C", municipio: "D", produto: "E", postos: "F", preco: "H" } };
}

/**
 * Gasolina comum na planilha da ANP: a capital da UF (aba CAPITAIS) quando a cidade é a capital, senão a média do
 * estado (aba ESTADOS). Se a cidade é a capital e a aba de capitais não tem a linha, cai na média do estado.
 */
export function precoNaPlanilha(xlsx: Xlsx, uf: string, cidade: string | null, agora = new Date()): PrecoCombustivel | null {
  const info = UFS[uf];
  if (!info) return null;
  const ehCapital = !cidade || semAcento(cidade) === semAcento(info.capital);
  const procurar = (aba: string, municipio: string | null): PrecoCombustivel | null => {
    const linhas = linhasDaAba(xlsx, aba);
    const { inicio, c } = colunas(linhas);
    for (const l of linhas.slice(inicio)) {
      if (semAcento(l[c.estado] ?? "") !== semAcento(info.estado)) continue;
      if (municipio && c.municipio && semAcento(l[c.municipio] ?? "") !== semAcento(municipio)) continue;
      if (semAcento(l[c.produto] ?? "") !== "GASOLINA COMUM") continue;
      const preco = Number(String(l[c.preco] ?? "").replace(",", "."));
      if (!(preco > 0 && preco < 100)) return null;
      return {
        litroCents: Math.round(preco * 100),
        inicio: dataDoExcel(l[c.ini] ?? ""),
        fim: dataDoExcel(l[c.fim] ?? ""),
        postos: Number(c.postos ? l[c.postos] : 0) || 0,
        base: municipio ? "capital" : "estado",
        onde: municipio ? `${info.capital}, ${uf}` : info.estado,
        buscadoEm: agora.toISOString(),
      };
    }
    return null;
  };
  return (ehCapital ? procurar("CAPITAIS", info.capital) : null) ?? procurar("ESTADOS", null);
}
