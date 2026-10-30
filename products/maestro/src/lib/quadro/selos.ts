/**
 * O que o card do Quadro mostra de relance (titular, 30/10/2026: "o card que estiver com o link precisa ser de fácil
 * entendimento... uma miniatura também da mídia do card... não consigo localizar o job que quero achar"):
 *
 *   - a peça: o card já tem link (a versão mais nova, `maestro.versoes`) e de onde ele é;
 *   - o cliente: o link de aprovação do lote foi enviado, foi aberto depois da versão mais nova, o cliente aprovou ou
 *     pediu ajuste nesta volta. Só o que o banco registra: nada de "visto" sem abertura, nada de estado inventado;
 *   - a capa: a imagem enviada pela equipe (`dados.capa`, drizzle/0035) ou, sem ela, a miniatura que o endereço da peça
 *     já dá sem o servidor buscar nada (YouTube; o quadro do vídeo sintético da demonstração). Drive e Vimeo só dariam
 *     a miniatura buscando a página ou com a credencial do arquivo: ficam sem (o card continua compacto);
 *   - a cor do cliente: a mesma para o mesmo cliente em qualquer tela, pela paleta fechada das colunas.
 *
 * Puro: roda no navegador, no servidor e nos testes.
 */
import { detectarFonte, NOME_DA_FONTE, type TipoFonte } from "@/lib/revisao/fontes/detectar";

/** O cliente e o link de aprovação deste card (lote mais recente que já saiu de rascunho). */
export type EstadoCliente = "enviado" | "aberto" | "aprovado" | "ajuste";

export type Selo = {
  /** A versão mais nova da peça: número, fonte e a miniatura que o endereço dá (sem buscar). */
  peca?: { n: number; fonte: TipoFonte; mini?: string };
  /** O que aconteceu com o cliente nesta volta. `em` = a hora do fato (abertura ou decisão), ISO. */
  cliente?: { estado: EstadoCliente; em?: string };
};
export type Selos = Record<string, Selo>;

/** A referência da capa enviada (gravada pelo servidor em `dados.capa` junto com os bytes em `maestro.card_capas`). */
export type CapaDoCard = { sha: string; l: number; a: number };

const SHA = /^[0-9a-f]{64}$/;
const DEMO_MP4 = /^\/demo\/([a-z0-9-]{1,60})\.mp4$/;

export const ehCapa = (v: unknown): v is CapaDoCard => {
  const c = v as CapaDoCard | null;
  return !!c && typeof c === "object" && typeof c.sha === "string" && SHA.test(c.sha) && Number.isInteger(c.l) && Number.isInteger(c.a);
};

/**
 * A miniatura que o endereço da peça já dá, sem o servidor buscar nada: YouTube pelo id (`mqdefault`, 320×180, 16:9 sem
 * tarja), o quadro do vídeo sintético da demonstração (`public/demo/<nome>.webp`, só em card `demo-`) e a
 * `miniatura_url` https que o banco já tenha. O resto (Drive, Vimeo, Dropbox, mp4, link) não tem.
 */
export function miniaturaDaPeca(card: string, fonte: string, url: string, guardada?: string | null): string | undefined {
  if (fonte === "youtube") {
    const f = detectarFonte(url);
    if (f.ok && f.tipo === "youtube" && f.id) return `https://i.ytimg.com/vi/${f.id}/mqdefault.jpg`;
  }
  if (fonte === "mp4" && card.startsWith("demo-")) {
    const m = url.match(DEMO_MP4);
    if (m) return `/demo/${m[1]}.webp`;
  }
  if (guardada && /^https:\/\/[^\s"'<>]{4,1990}$/.test(guardada)) return guardada;
  return undefined;
}

/** Linha que o banco devolve para cada card (src/lib/quadro/servidor.ts, `selosNaTx`). */
export type LinhaSelo = {
  id: string;
  n: number | null;
  fonte: string | null;
  url: string | null;
  mini: string | null;
  versaoEm: string | Date | null;
  decisao: "aprovado" | "ajuste" | null;
  decisaoEm: string | Date | null;
  linkCriado: string | Date | null;
  linkUsado: string | Date | null;
};

const quando = (v: string | Date | null | undefined): number => (v ? new Date(v).getTime() : NaN);
const isoDe = (v: string | Date | null | undefined): string | undefined => {
  const t = quando(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
};

/**
 * O estado com o cliente: a decisão desta volta manda; sem ela, o link ativo foi aberto depois da versão mais nova
 * ("aberto") ou ainda não ("enviado"); sem link ativo nem decisão, nada.
 */
export function estadoDoCliente(l: Pick<LinhaSelo, "decisao" | "decisaoEm" | "linkCriado" | "linkUsado" | "versaoEm">): Selo["cliente"] {
  if (l.decisao === "aprovado" || l.decisao === "ajuste") return { estado: l.decisao, em: isoDe(l.decisaoEm) };
  if (!l.linkCriado) return undefined;
  const usado = quando(l.linkUsado);
  const base = Math.max(quando(l.linkCriado) || 0, quando(l.versaoEm) || 0);
  if (Number.isFinite(usado) && usado >= base) return { estado: "aberto", em: isoDe(l.linkUsado) };
  return { estado: "enviado", em: isoDe(l.linkCriado) };
}

/** Linha do banco → selo (sem nada = undefined: o card fica como está). */
export function seloDaLinha(l: LinhaSelo): Selo | undefined {
  const s: Selo = {};
  if (l.n && l.fonte && l.url) {
    const mini = miniaturaDaPeca(l.id, l.fonte, l.url, l.mini);
    s.peca = { n: l.n, fonte: l.fonte as TipoFonte, ...(mini ? { mini } : {}) };
  }
  const c = estadoDoCliente(l);
  if (c) s.cliente = c;
  return s.peca || s.cliente ? s : undefined;
}

export const mesmoSelo = (a: Selo | undefined, b: Selo | undefined) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** O endereço da capa enviada (rota com sessão; o sha256 no endereço deixa o cache imutável). */
export const enderecoDaCapa = (card: string, capa: CapaDoCard) => `/api/quadro/capa/${encodeURIComponent(card)}/${capa.sha}`;

/** A imagem do topo do card: a capa enviada, senão a miniatura da peça, senão nenhuma. */
export function imagemDoCard(card: string, capa: unknown, selo: Selo | undefined): { src: string; origem: "capa" | "peca" } | null {
  if (ehCapa(capa)) return { src: enderecoDaCapa(card, capa), origem: "capa" };
  if (selo?.peca?.mini) return { src: selo.peca.mini, origem: "peca" };
  return null;
}

/* ───────────── como o card diz ───────────── */

export type Rotulo = {
  curto: string;
  dica: string;
  icone: "link" | "enviar" | "olho" | "check" | "retorno";
  tom: "peca" | "enviado" | "aberto" | "aprovado" | "ajuste";
};

const HORA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const emTexto = (iso?: string) => (iso ? ` em ${HORA.format(new Date(iso)).replace(",", " às")}` : "");

/**
 * Um selo só, o mais adiantado: decisão do cliente > aberto > enviado > a peça tem link. Texto curto no card e a frase
 * inteira na dica (title/aria-label).
 */
export function rotuloDoSelo(selo: Selo | undefined): Rotulo | null {
  if (!selo) return null;
  const peca = selo.peca ? ` · ${NOME_DA_FONTE[selo.peca.fonte] ?? "Link"}, versão ${selo.peca.n}` : "";
  switch (selo.cliente?.estado) {
    case "aprovado":
      return { curto: "Aprovado", dica: `O cliente aprovou${emTexto(selo.cliente.em)}${peca}`, icone: "check", tom: "aprovado" };
    case "ajuste":
      return { curto: "Pediu ajuste", dica: `O cliente pediu ajuste${emTexto(selo.cliente.em)}${peca}`, icone: "retorno", tom: "ajuste" };
    case "aberto":
      return { curto: "Cliente viu", dica: `O cliente abriu o link${emTexto(selo.cliente.em)}${peca}`, icone: "olho", tom: "aberto" };
    case "enviado":
      return { curto: "Link enviado", dica: `Link de aprovação enviado ao cliente${emTexto(selo.cliente.em)}${peca}`, icone: "enviar", tom: "enviado" };
  }
  if (selo.peca) return { curto: "Com link", dica: `A peça já tem link${peca}`, icone: "link", tom: "peca" };
  return null;
}

/* ───────────── a cor do cliente ───────────── */

/** Tons da paleta fechada (`--cor-*`) para o cliente; pedra e grafite ficam de fora (parecem "sem cor"). */
export const CORES_CLIENTE = ["lavanda", "ambar", "laranja", "latao", "verde", "turquesa", "oliva", "rosa", "ceu", "ameixa"] as const;
export type CorCliente = (typeof CORES_CLIENTE)[number];

/** A mesma cor para o mesmo cliente, em qualquer tela e aparelho (FNV-1a do id). */
export function corDoCliente(id: string | null | undefined): CorCliente | null {
  if (!id) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return CORES_CLIENTE[h % CORES_CLIENTE.length];
}

/* ───────────── busca com realce ───────────── */

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Os termos da busca, sem acento e sem caixa. */
export const termosDaBusca = (busca: string) => semAcento(busca.trim()).split(/\s+/).filter(Boolean);

/**
 * Divide o texto em pedaços [texto, casou?] pelos termos (sem acento e sem caixa, como o filtro), para o realce. Os
 * índices são do texto original: cada caractere é normalizado sozinho.
 */
export function pedacosDoRealce(texto: string, termos: string[]): [string, boolean][] {
  if (!termos.length || !texto) return [[texto, false]];
  const chars = [...texto];
  const norm: string[] = chars.map((c) => semAcento(c));
  const plano = norm.join("");
  // de cada posição do texto plano para o índice do caractere original
  const origem: number[] = [];
  norm.forEach((n, i) => {
    for (let k = 0; k < n.length; k++) origem.push(i);
  });
  const marca = new Array<boolean>(chars.length).fill(false);
  for (const t of termos) {
    let i = plano.indexOf(t);
    while (i >= 0) {
      for (let k = i; k < i + t.length; k++) marca[origem[k]] = true;
      i = plano.indexOf(t, i + t.length);
    }
  }
  const out: [string, boolean][] = [];
  chars.forEach((c, i) => {
    const ult = out[out.length - 1];
    if (ult && ult[1] === marca[i]) ult[0] += c;
    else out.push([c, marca[i]]);
  });
  return out;
}
