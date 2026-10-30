/**
 * Calculadora de deslocamento (plano v2 §6.4; porte de travel-item.tsx, services/route.ts e services/fuel.ts do ZRO),
 * generalizada: a origem é a cidade base da organização e o preço do litro é o preço médio da semana na ANP (gasolina,
 * etanol ou diesel S10) no município da produtora, senão no estado, senão no Brasil. Aqui só o que é puro (contas e
 * leitura das respostas de Photon, OSRM e da planilha semanal da ANP); quem busca é src/lib/orcamento/servicos.ts e
 * quem guarda a semana é o agendamento (drizzle/0022). Sempre há a saída manual.
 */

export type Lugar = {
  rotulo: string;
  detalhe: string;
  lat: number;
  lon: number;
  /** O município (para o preço da ANP); sem ele, o lugar é um estado ou não se sabe. */
  cidade?: string;
  /** A sigla da UF, quando o lugar é do Brasil e o estado é conhecido. */
  uf?: string;
  /** Cidade, estado ou outro lugar (rua, bairro, ponto). */
  tipo?: "cidade" | "estado" | "lugar";
};

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
  /** Combustível, só para o texto da linha ("L de gasolina"); sem ele, "L" como antes. */
  combustivel?: Combustivel;
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

/**
 * A linha "Deslocamento" do orçamento: "Natal → Mossoró", "560 km · ida e volta · 2 viagens · 46,7 L de gasolina a
 * R$ 6,29/L". O preço usado fica gravado no texto e no valor: orçamento salvo não muda quando a ANP muda.
 */
export function linhaDeDeslocamento(e: EntradaDeslocamento, de: string | null, para: string | null) {
  const d = calcularDeslocamento(e);
  const rota = [de, para].filter(Boolean).join(" → ") || `${fmt(e.kmIda)} km`;
  const viagens = Math.max(1, Math.round(e.viagens) || 1);
  const detalhe = [
    `${fmt(d.kmTotal, 0)} km`,
    e.idaEVolta ? "ida e volta" : "só ida",
    viagens > 1 ? `${viagens} viagens` : null,
    `${fmt(d.litros)} L${e.combustivel ? ` de ${COMBUSTIVEIS[e.combustivel].texto}` : ""} a ${reais(e.litroCents)}/L`,
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

const TIPOS_CIDADE = ["city", "town", "municipality"];
const TIPOS_LUGAREJO = ["village", "hamlet", "suburb", "district", "locality", "county", "state"];

/** Resposta do Photon → até 6 lugares do Brasil, cidade antes de rua (a mesma regra do ZRO), com município e UF. */
export function lugaresDoPhoton(dados: unknown): Lugar[] {
  const features = (((dados as { features?: PhotonFeature[] })?.features ?? []) as PhotonFeature[]).filter((f) => Array.isArray(f?.geometry?.coordinates));
  const rank = (f: PhotonFeature) => {
    const p = f.properties ?? {};
    const t = p.type ?? p.osm_value ?? "";
    if (TIPOS_CIDADE.includes(t)) return 0;
    if (TIPOS_LUGAREJO.includes(t)) return 1;
    if (p.osm_key && p.osm_key !== "highway" && t !== "street" && t !== "house") return 2;
    return 3;
  };
  const ordem = features.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i);
  const vistos = new Set<string>();
  const out: Lugar[] = [];
  for (const { f } of ordem) {
    const p = f.properties ?? {};
    if (p.countrycode && p.countrycode !== "BR") continue;
    const t = p.type ?? p.osm_value ?? "";
    const tipo: Lugar["tipo"] = TIPOS_CIDADE.includes(t) && !p.city ? "cidade" : t === "state" ? "estado" : "lugar";
    const sigla = p.state ? SIGLA_DO_ESTADO.get(semAcento(p.state)) : tipo === "estado" && p.name ? SIGLA_DO_ESTADO.get(semAcento(p.name)) : undefined;
    const uf = sigla ?? p.state ?? "";
    const rua = p.street ? [p.street, p.housenumber].filter(Boolean).join(", ") : "";
    const rotulo = p.name || rua || p.city || "";
    if (!rotulo) continue;
    const detalhe = [p.name && rua && p.name !== rua ? rua : "", p.district, p.city !== rotulo ? p.city : "", tipo === "estado" ? "" : uf]
      .filter(Boolean)
      .join(" · ");
    const [lon, lat] = f.geometry!.coordinates!;
    const chave = `${rotulo}|${detalhe}|${tipo}`;
    if (vistos.has(chave) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    vistos.add(chave);
    const cidade = tipo === "cidade" ? rotulo : tipo === "estado" ? undefined : p.city || (TIPOS_CIDADE.includes(t) ? rotulo : undefined);
    out.push({ rotulo, detalhe, lat, lon, tipo, ...(cidade ? { cidade } : {}), ...(sigla ? { uf: sigla } : {}) });
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * O que a pessoa digitou, separado em nome e UF: "Natal, RN", "natal/rn", "Natal - Rio Grande do Norte" e "Natal RN"
 * dão { nome: "Natal", uf: "RN" }; só "São Paulo" dá { nome: "São Paulo", uf: null }.
 */
export function lerTextoDeLugar(texto: string): { nome: string; uf: string | null } {
  const t = texto.replace(/\s+/g, " ").trim();
  const partes = t.split(/\s*(?:,|\/|\s-\s)\s*/).filter(Boolean);
  const ufDe = (s: string) => {
    const k = semAcento(s);
    return ehUf(k) ? k : (SIGLA_DO_ESTADO.get(k) ?? null);
  };
  if (partes.length > 1) {
    const uf = ufDe(partes.at(-1)!);
    if (uf) return { nome: partes.slice(0, -1).join(", "), uf };
    return { nome: partes[0], uf: null };
  }
  const m = t.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (m && ehUf(m[2].toUpperCase()) && !/^(de|do|da|em)$/i.test(m[2])) return { nome: m[1], uf: m[2].toUpperCase() };
  return { nome: t, uf: null };
}

/**
 * O melhor lugar para o que foi digitado, sem a pessoa escolher na lista: a cidade com o mesmo nome (e a UF, se veio),
 * com a capital na frente quando há duas; senão o lugar com o mesmo nome; senão o primeiro da UF dita; senão o
 * primeiro da lista. Lista vazia, null.
 */
export function melhorLugar(lugares: Lugar[], texto: string): Lugar | null {
  if (!lugares.length) return null;
  const { nome, uf } = lerTextoDeLugar(texto);
  const alvo = chaveDoMunicipio(nome);
  const daUf = (l: Lugar) => !uf || l.uf === uf;
  const mesmoNome = (l: Lugar) => chaveDoMunicipio(l.rotulo) === alvo;
  const cidades = lugares.filter((l) => l.tipo === "cidade" && mesmoNome(l) && daUf(l));
  const capital = cidades.find((l) => l.uf && chaveDoMunicipio(UFS[l.uf]?.capital ?? "") === alvo);
  return capital ?? cidades[0] ?? lugares.find((l) => mesmoNome(l) && daUf(l)) ?? (uf ? lugares.find((l) => l.uf === uf) : undefined) ?? lugares[0];
}

/** Cidade e UF numa linha curta, para dizer o que foi entendido: "Natal/RN", "Rua X · Natal/RN", "São Paulo (estado)". */
export function nomeDoLugar(l: Lugar): string {
  if (l.tipo === "estado") return `${l.rotulo} (estado)`;
  const cidade = l.cidade ?? (l.tipo === "cidade" ? l.rotulo : "");
  const onde = cidade ? `${cidade}${l.uf ? `/${l.uf}` : ""}` : (l.uf ?? "");
  if (l.tipo === "cidade" || !onde) return onde || l.rotulo;
  return l.rotulo === cidade ? onde : `${l.rotulo} · ${onde}`;
}

/** "≈ 40h45 de carro", "≈ 50 min de carro". */
export function tempoDeCarro(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  return `≈ ${m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`} de carro`;
}

/** Resposta do OSRM → km de uma ida (1 casa) e minutos; null sem rota. */
export function rotaDoOsrm(dados: unknown): { km: number; minutos: number } | null {
  const d = dados as { code?: string; routes?: { distance?: number; duration?: number }[] };
  const r = d?.code === "Ok" ? d.routes?.[0] : undefined;
  if (!r || !Number.isFinite(r.distance) || !Number.isFinite(r.duration)) return null;
  return { km: Math.round((r.distance! / 1000) * 10) / 10, minutos: Math.round(r.duration! / 60) };
}

/* ───────────── ANP: planilha semanal "resumo_semanal_lpc" ───────────── */

/**
 * Os três combustíveis da calculadora, com o nome do produto na planilha da ANP e um consumo de partida (km/L) para
 * quando não há veículo no inventário: carro a gasolina ~10, o mesmo carro no etanol ~7 (o etanol rende uns 70%) e van
 * ou picape a diesel ~9. É só o valor inicial do campo; quem sabe o do carro troca.
 */
export const COMBUSTIVEIS = {
  gasolina: { nome: "Gasolina", texto: "gasolina", produto: "GASOLINA COMUM", kmL: 10 },
  etanol: { nome: "Etanol", texto: "etanol", produto: "ETANOL HIDRATADO", kmL: 7 },
  diesel: { nome: "Diesel S10", texto: "diesel S10", produto: "OLEO DIESEL S10", kmL: 9 },
} as const;
export type Combustivel = keyof typeof COMBUSTIVEIS;
export const ehCombustivel = (v: unknown): v is Combustivel => typeof v === "string" && Object.hasOwn(COMBUSTIVEIS, v);

/** Nome de município como chave: "Santa Bárbara d'Oeste" e "SANTA BARBARA D OESTE" dão o mesmo. */
export const chaveDoMunicipio = (s: string) =>
  semAcento(s)
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

/** Data do Excel (dias desde 1899-12-30) ou "18/10/2026" → AAAA-MM-DD. */
export function dataDoExcel(serial: string): string {
  const br = serial.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
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

type Colunas = { ini: string; fim: string; estado?: string; municipio?: string; produto: string; postos?: string; preco: string };

/** Acha o cabeçalho (a linha com PRODUTO, PREÇO MÉDIO REVENDA e as datas) e as colunas pelo nome. Sem cabeçalho, nada. */
function cabecalho(linhas: Record<string, string>[]): { inicio: number; c: Colunas } | null {
  for (const [i, l] of linhas.entries()) {
    const nomes = Object.entries(l).map(([k, v]) => [k, semAcento(v)] as const);
    const acha = (f: (v: string) => boolean) => nomes.find(([, v]) => f(v))?.[0];
    const produto = acha((v) => v === "PRODUTO");
    const preco = acha((v) => v.includes("PRECO MEDIO REVENDA"));
    const ini = acha((v) => v.includes("DATA INICIAL"));
    const fim = acha((v) => v.includes("DATA FINAL"));
    if (produto && preco && ini && fim) {
      return {
        inicio: i + 1,
        c: {
          ini,
          fim,
          estado: acha((v) => v.startsWith("ESTADO")),
          municipio: acha((v) => v.startsWith("MUNICIPIO")),
          produto,
          postos: acha((v) => v.includes("POSTOS")),
          preco,
        },
      };
    }
  }
  return null;
}

const PRODUTOS = new Map(Object.entries(COMBUSTIVEIS).map(([k, v]) => [v.produto as string, k as Combustivel]));

/** Uma linha da semana: `uf` 'BR' = Brasil; `municipio` '' = média do estado (ou do Brasil). */
export type LinhaAnp = { uf: string; municipio: string; combustivel: Combustivel; preco: number; postos: number };
export type SemanaAnp = { semana: string; semanaFim: string; linhas: LinhaAnp[] };

/**
 * A semana inteira da planilha: abas MUNICIPIOS, ESTADOS e BRASIL, só gasolina comum, etanol hidratado e diesel S10.
 * As datas vêm das células (não do nome do arquivo). Linha de outra semana, de estado desconhecido ou com preço fora
 * de 0–100 fica de fora; repetida, vale a primeira. Sem nenhuma linha boa, null.
 */
export function semanaDaPlanilha(xlsx: Xlsx): SemanaAnp | null {
  let semana = "";
  let semanaFim = "";
  const vistas = new Set<string>();
  const linhas: LinhaAnp[] = [];
  for (const aba of ["MUNICIPIOS", "ESTADOS", "BRASIL"] as const) {
    const todas = linhasDaAba(xlsx, aba);
    const h = cabecalho(todas);
    if (!h) continue;
    const { c } = h;
    for (const l of todas.slice(h.inicio)) {
      const combustivel = PRODUTOS.get(semAcento(l[c.produto] ?? ""));
      if (!combustivel) continue;
      const ini = dataDoExcel(l[c.ini] ?? "");
      const fim = dataDoExcel(l[c.fim] ?? "");
      if (!ini || !fim) continue;
      if (!semana) [semana, semanaFim] = [ini, fim];
      if (ini !== semana || fim !== semanaFim) continue;
      let uf = "BR";
      let municipio = "";
      if (aba !== "BRASIL") {
        const sigla = c.estado ? SIGLA_DO_ESTADO.get(semAcento(l[c.estado] ?? "")) : undefined;
        if (!sigla) continue;
        uf = sigla;
        if (aba === "MUNICIPIOS") {
          municipio = c.municipio ? chaveDoMunicipio(l[c.municipio] ?? "") : "";
          if (!municipio) continue;
        }
      }
      const preco = Number(String(l[c.preco] ?? "").replace(",", "."));
      if (!(preco > 0 && preco < 100)) continue;
      const chave = `${uf}|${municipio}|${combustivel}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      const postos = Math.max(0, Math.round(Number(c.postos ? l[c.postos] : 0) || 0));
      linhas.push({ uf, municipio, combustivel, preco: Math.round(preco * 1000) / 1000, postos });
    }
  }
  return linhas.length ? { semana, semanaFim, linhas } : null;
}

/** Fim da semana pelo nome do arquivo ("..._2026_10_18-2026_10_24.xlsx", "...-16-10-2022-22-10-2022.xlsx"); "" sem data. */
function fimPeloNome(caminho: string): string {
  const [a = "", , c = "", x = "", y = "", z = ""] = (caminho.split("/").pop() ?? "").match(/\d+/g) ?? [];
  const d = (ano: string, mes: string, dia: string) => `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  if (z && a.length === 4 && x.length === 4) return d(x, y, z);
  if (z && c.length === 4 && z.length === 4) return d(z, y, x);
  return "";
}

/**
 * O link da planilha semanal mais recente na página "últimas semanas pesquisadas". A ANP muda o jeito de escrever o
 * nome (hífen, sublinhado, ordem da data); escolhemos a de data final mais nova e, sem data no nome, a primeira da
 * página (a mais nova vem em cima). Só links do mesmo site da página.
 */
export function linkDaPlanilhaSemanal(html: string, pagina: string): string | null {
  const origem = new URL(pagina).origin;
  let melhor: { url: string; fim: string } | null = null;
  for (const m of html.matchAll(/[^"'\s<>()]*resumo[_-]semanal[_-]lpc[^"'\s<>()]*\.xlsx/gi)) {
    let url: URL;
    try {
      url = new URL(decodificar(m[0]), pagina);
    } catch {
      continue;
    }
    if (url.origin !== origem) continue;
    const fim = fimPeloNome(url.pathname);
    if (!melhor || fim > melhor.fim) melhor = { url: url.href, fim };
  }
  return melhor?.url ?? null;
}

/** O preço que a calculadora mostra (sempre de uma semana guardada; nunca inventado). */
export type PrecoCombustivel = {
  combustivel: Combustivel;
  /** Preço médio do litro, em centavos. */
  litroCents: number;
  semana: string;
  semanaFim: string;
  postos: number;
  /** Onde a média foi medida: o município da produtora, o estado ou o Brasil. */
  base: "municipio" | "estado" | "brasil";
  /** "Natal/RN", "RN" ou "Brasil". */
  onde: string;
  fonte: string;
};

/** Uma linha guardada em maestro.combustivel_precos, do jeito que a leitura traz. */
export type PrecoGuardado = { semana: string; semanaFim: string; uf: string; municipio: string; preco: number; postos: number; fonte: string };

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "d"]);
/** Nome digitado todo em minúsculas ou maiúsculas fica com cara de nome: "sao paulo" → "Sao Paulo". */
export function nomeBonito(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Qual preço vale para o lugar (a cidade de saída, onde se abastece; senão a da produtora): a semana mais nova
 * guardada e, nela, o município, senão o estado, senão o Brasil. A cidade casa sem acento e sem caixa ("sao paulo" =
 * "SÃO PAULO"); sem UF, vale o município só se o nome existir em um estado (ou se for a capital de um deles). Nada
 * guardado, null. Puro: a leitura do banco é `precoDoCombustivel` (servicos.ts).
 */
export function escolherPreco(linhas: PrecoGuardado[], lugar: { uf: string | null; cidade: string | null }, combustivel: Combustivel): PrecoCombustivel | null {
  if (!linhas.length) return null;
  const semana = linhas.reduce((m, l) => (l.semana > m ? l.semana : m), "");
  const daSemana = linhas.filter((l) => l.semana === semana);
  const chave = lugar.cidade ? chaveDoMunicipio(lerTextoDeLugar(lugar.cidade).nome) : "";
  let uf = ehUf(lugar.uf) ? lugar.uf : lugar.cidade ? lerTextoDeLugar(lugar.cidade).uf : null;
  if (!uf && chave) {
    const ufs = [...new Set(daSemana.filter((l) => l.municipio === chave).map((l) => l.uf))];
    uf = ufs.length === 1 ? ufs[0] : (ufs.find((u) => chaveDoMunicipio(UFS[u]?.capital ?? "") === chave) ?? null);
  }
  const municipio = uf && chave ? daSemana.find((l) => l.uf === uf && l.municipio === chave) : undefined;
  const estado = uf ? daSemana.find((l) => l.uf === uf && l.municipio === "") : undefined;
  const brasil = daSemana.find((l) => l.uf === "BR" && l.municipio === "");
  const r = municipio ?? estado ?? brasil;
  if (!r) return null;
  const base = r === municipio ? "municipio" : r === estado ? "estado" : "brasil";
  const cidade = lugar.cidade ? nomeBonito(lerTextoDeLugar(lugar.cidade).nome) : "";
  return {
    combustivel,
    litroCents: Math.round(r.preco * 100),
    semana: r.semana,
    semanaFim: r.semanaFim,
    postos: r.postos,
    base,
    onde: base === "municipio" ? `${cidade}/${r.uf}` : base === "estado" ? r.uf : "Brasil",
    fonte: r.fonte,
  };
}

/** "Preço médio da semana em Natal/RN · ANP, semana de 18/10". */
export function rotuloDoPreco(p: Pick<PrecoCombustivel, "base" | "onde" | "semana">): string {
  const onde = p.base === "municipio" ? `em ${p.onde}` : p.base === "estado" ? `no estado (${p.onde})` : "no Brasil";
  return `Preço médio da semana ${onde} · ANP, semana de ${p.semana.slice(8, 10)}/${p.semana.slice(5, 7)}`;
}
