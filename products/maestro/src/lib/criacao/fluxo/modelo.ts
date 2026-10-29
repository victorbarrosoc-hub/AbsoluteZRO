/**
 * O Fluxo por dentro (plano da Criação §6, fase F4): tipos de nó, paleta, limites e a conferência de tudo o que a tela
 * manda (`lerOps`). Puro: roda no navegador (a tela confere antes de mandar), no servidor (antes de gravar) e nos
 * testes. O banco confere de novo (drizzle/0031_fluxos.sql: tipos, tamanhos, ≤ 16 KB por nó, limites por fluxo).
 *
 * Um nó é uma linha: posição e tamanho (x, y, w, h, z), a seção (outro nó do mesmo fluxo, do tipo `secao`), os `dados`
 * do tipo e as colunas de vínculo (imagem, roteiro, card). Referência a roteiro ou card guarda SÓ o id: título, estado
 * e duração são lidos na hora com o RLS de quem vê (`servidor.ts`, `resolverReferencias`).
 */
import type { EstadoRoteiro } from "../roteiro/servidor";
import { lerLink, type LinkFluxo } from "./endereco";

// ───────────── o que o servidor devolve (a tela e a exportação leem) ─────────────

export type ImagemNo = {
  id: string;
  sha256: string;
  largura: number;
  altura: number;
  miniLargura: number;
  miniAltura: number;
  /** `/api/criacao/img/<id>/<sha>` (sessão + RLS; cache imutável e privado). */
  url: string;
  miniUrl: string;
};

export type NoFluxo = {
  id: string;
  tipo: TipoNo;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  secaoId: string | null;
  dados: DadosNo;
  imagemId: string | null;
  roteiroId: string | null;
  cardId: string | null;
  /** Metadados da imagem (nó `imagem`); os bytes só pela rota. */
  imagem: ImagemNo | null;
  rev: number;
  /** Lápide: a tela tira do canvas (e Desfazer devolve). */
  apagado: boolean;
  atualizado: string;
  atualizadoPor: string | null;
};

export type LigacaoFluxo = {
  id: string;
  de: string;
  para: string;
  rotulo: string | null;
  rev: number;
  apagado: boolean;
  atualizado: string;
};

/** Referência viva, lida com o RLS de quem vê. */
export type RefRoteiro = {
  tipo: "roteiro";
  estado: "ok";
  id: string;
  titulo: string;
  situacao: EstadoRoteiro;
  /** Última versão salva (0 = nenhuma). */
  versao: number;
  duracaoSeg: number;
  naLixeira: boolean;
};
export type RefCard = {
  tipo: "card";
  estado: "ok";
  id: string;
  titulo: string;
  coluna: string;
  colunaNome: string | null;
  colunaCor: string | null;
  prazo: string | null;
  naLixeira: boolean;
};
/** "sem_acesso": existe, mas quem vê não alcança (nunca vai título); "removido": apagado de vez. */
export type RefIndisponivel = { tipo: "roteiro" | "card"; estado: "sem_acesso" } | { tipo: "roteiro" | "card"; estado: "removido" };
export type RefResolvida = RefRoteiro | RefCard | RefIndisponivel;

export const urlDaImagem = (id: string, sha: string, mini = false) => `/api/criacao/img/${id}/${sha}${mini ? "?mini=1" : ""}`;

export const TIPOS_NO = ["nota", "imagem", "link", "roteiro", "card", "secao"] as const;
export type TipoNo = (typeof TIPOS_NO)[number];
export const ehTipoNo = (v: unknown): v is TipoNo => TIPOS_NO.includes(v as TipoNo);

/** Paleta fechada de notas e seções (a tela mapeia para `--fx-*`). */
export const CORES_FLUXO = ["amarelo", "pessego", "rosa", "lavanda", "ceu", "menta", "pedra"] as const;
export type CorFluxo = (typeof CORES_FLUXO)[number];
export const ehCorFluxo = (v: unknown): v is CorFluxo => CORES_FLUXO.includes(v as CorFluxo);

export const LIMITES = {
  nota: 2000,
  legenda: 300,
  tituloLink: 200,
  nomeSecao: 80,
  rotulo: 120,
  tituloFluxo: 200,
  /** Nós vivos por fluxo (o banco confere: `fluxo:limite_nos`). */
  nos: 2000,
  /** Ligações vivas por fluxo (`fluxo:limite_ligacoes`). */
  ligacoes: 4000,
  /** Operações num pedido só (colar muitos, mover muitos). */
  ops: 500,
  coordenada: 1_000_000,
  ladoMin: 16,
  ladoMax: 20_000,
} as const;

/** Tamanho de quem nasce sem tamanho. */
export const TAMANHO_PADRAO: Record<TipoNo, { w: number; h: number }> = {
  nota: { w: 200, h: 120 },
  imagem: { w: 240, h: 180 },
  link: { w: 240, h: 120 },
  roteiro: { w: 220, h: 64 },
  card: { w: 220, h: 64 },
  secao: { w: 560, h: 360 },
};

export type DadosNota = { texto: string; cor: CorFluxo };
export type DadosImagem = { legenda: string };
export type DadosLink = { url: string; titulo: string; link: LinkFluxo };
export type DadosSecao = { nome: string; cor: CorFluxo };
export type DadosRef = Record<string, never>;
export type DadosNo = DadosNota | DadosImagem | DadosLink | DadosSecao | DadosRef;

/** Texto curto de uma linha (espaços juntos, aparado). */
const linha = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : null;
};

/** Texto de nota: mantém as quebras (no máximo duas seguidas), tira espaço no fim das linhas. */
const textoNota = (v: unknown): string | null => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return null;
  const t = v
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.length <= LIMITES.nota ? t : null;
};

/**
 * Os dados do tipo, conferidos e normalizados (chaves desconhecidas saem). null = não cabe. O link é sempre refeito
 * pelo `lerLink` (a tela não escolhe a fonte nem o endereço do player).
 */
export function lerDados(tipo: TipoNo, bruto: unknown): DadosNo | null {
  const d = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {};
  switch (tipo) {
    case "nota": {
      const texto = textoNota(d.texto);
      if (texto === null) return null;
      const cor = d.cor === undefined ? "amarelo" : d.cor;
      return ehCorFluxo(cor) ? { texto, cor } : null;
    }
    case "imagem": {
      const legenda = linha(d.legenda, LIMITES.legenda);
      return legenda === null ? null : { legenda };
    }
    case "link": {
      const l = typeof d.url === "string" ? lerLink(d.url) : null;
      if (!l || !l.ok) return null;
      const titulo = linha(d.titulo, LIMITES.tituloLink);
      if (titulo === null) return null;
      return { url: l.link.url, titulo, link: l.link };
    }
    case "secao": {
      const nome = linha(d.nome, LIMITES.nomeSecao);
      if (nome === null) return null;
      const cor = d.cor === undefined ? "pessego" : d.cor;
      return ehCorFluxo(cor) ? { nome, cor } : null;
    }
    case "roteiro":
    case "card":
      return {};
  }
}

// ───────────── operações (a tela manda; `aplicarOps` em servidor.ts grava numa transação) ─────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const CARD = /^[A-Za-z0-9_-]{4,64}$/;

export type Geometria = { x: number; y: number; w: number; h: number; z: number };

export type OpCriarNo = {
  op: "criar_no";
  /** Gerado pela tela (para a ligação no mesmo pedido e a tela otimista); sem ele, o banco gera. */
  id?: string;
  tipo: TipoNo;
  secaoId: string | null;
  dados: DadosNo;
  imagemId: string | null;
  roteiroId: string | null;
  cardId: string | null;
} & Geometria;

export type OpMudarNo = {
  op: "mudar_no";
  id: string;
  /** O `rev` que a tela viu. Sem ele (mover/redimensionar), quem grava por último leva. */
  rev?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
  secaoId?: string | null;
  /** Só as chaves que mudam: juntam com os dados atuais e passam pelo `lerDados` do tipo. */
  dados?: Record<string, unknown>;
};

export type OpLapideNo = { op: "apagar_no" | "restaurar_no"; id: string };
export type OpCriarLigacao = { op: "criar_ligacao"; id?: string; de: string; para: string; rotulo: string | null };
export type OpMudarLigacao = { op: "mudar_ligacao"; id: string; rev?: number; rotulo: string | null };
export type OpLapideLigacao = { op: "apagar_ligacao" | "restaurar_ligacao"; id: string };

export type Op = OpCriarNo | OpMudarNo | OpLapideNo | OpCriarLigacao | OpMudarLigacao | OpLapideLigacao;

export type LeituraOps = { ok: true; ops: Op[] } | { ok: false; indice: number; mensagem: string };

const coord = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= LIMITES.coordenada ? Math.round(v * 100) / 100 : null;
const lado = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= LIMITES.ladoMin && v <= LIMITES.ladoMax ? Math.round(v * 100) / 100 : null;
const camada = (v: unknown): number | null => (Number.isInteger(v) && Math.abs(v as number) <= LIMITES.coordenada ? (v as number) : null);
const revOk = (v: unknown) => v === undefined || (Number.isInteger(v) && (v as number) >= 1);

function lerRotulo(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  const t = linha(v, LIMITES.rotulo);
  if (t === null) return undefined;
  return t || null;
}

function lerUma(b: unknown): Op | string {
  if (!b || typeof b !== "object" || Array.isArray(b)) return "Operação inválida.";
  const o = b as Record<string, unknown>;
  switch (o.op) {
    case "criar_no": {
      if (!ehTipoNo(o.tipo)) return "Tipo de item desconhecido.";
      if (o.id !== undefined && !ehUuid(o.id)) return "Id de item inválido.";
      const p = TAMANHO_PADRAO[o.tipo];
      const x = coord(o.x ?? 0);
      const y = coord(o.y ?? 0);
      const w = lado(o.w ?? p.w);
      const h = lado(o.h ?? p.h);
      const z = camada(o.z ?? 0);
      if (x === null || y === null || w === null || h === null || z === null) return "Posição ou tamanho fora do canvas.";
      const secaoId = o.secaoId ?? null;
      if (secaoId !== null && (!ehUuid(secaoId) || o.tipo === "secao")) return "Seção inválida.";
      const dados = lerDados(o.tipo, o.dados);
      if (!dados) return "Confira o conteúdo do item.";
      const imagemId = o.tipo === "imagem" ? o.imagemId : null;
      if (o.tipo === "imagem" && !ehUuid(imagemId)) return "Falta a imagem.";
      const roteiroId = o.tipo === "roteiro" ? o.roteiroId : null;
      if (o.tipo === "roteiro" && !ehUuid(roteiroId)) return "Falta o roteiro.";
      const cardId = o.tipo === "card" ? o.cardId : null;
      if (o.tipo === "card" && !(typeof cardId === "string" && CARD.test(cardId))) return "Falta o card.";
      return {
        op: "criar_no",
        ...(o.id ? { id: o.id as string } : {}),
        tipo: o.tipo,
        x,
        y,
        w,
        h,
        z,
        secaoId: secaoId as string | null,
        dados,
        imagemId: (imagemId as string | null) ?? null,
        roteiroId: (roteiroId as string | null) ?? null,
        cardId: (cardId as string | null) ?? null,
      };
    }
    case "mudar_no": {
      if (!ehUuid(o.id)) return "Id de item inválido.";
      if (!revOk(o.rev)) return "Versão do item inválida.";
      const m: OpMudarNo = { op: "mudar_no", id: o.id, ...(o.rev !== undefined ? { rev: o.rev as number } : {}) };
      for (const k of ["x", "y"] as const) {
        if (o[k] === undefined) continue;
        const v = coord(o[k]);
        if (v === null) return "Posição fora do canvas.";
        m[k] = v;
      }
      for (const k of ["w", "h"] as const) {
        if (o[k] === undefined) continue;
        const v = lado(o[k]);
        if (v === null) return "Tamanho fora do limite.";
        m[k] = v;
      }
      if (o.z !== undefined) {
        const z = camada(o.z);
        if (z === null) return "Camada inválida.";
        m.z = z;
      }
      if (o.secaoId !== undefined) {
        if (o.secaoId !== null && !ehUuid(o.secaoId)) return "Seção inválida.";
        if (o.secaoId === o.id) return "Seção inválida.";
        m.secaoId = o.secaoId as string | null;
      }
      if (o.dados !== undefined) {
        if (!o.dados || typeof o.dados !== "object" || Array.isArray(o.dados)) return "Confira o conteúdo do item.";
        m.dados = o.dados as Record<string, unknown>;
      }
      if (Object.keys(m).length <= (m.rev === undefined ? 2 : 3)) return "Nada para mudar.";
      return m;
    }
    case "apagar_no":
    case "restaurar_no":
    case "apagar_ligacao":
    case "restaurar_ligacao":
      return ehUuid(o.id) ? { op: o.op, id: o.id } : "Id inválido.";
    case "criar_ligacao": {
      if (o.id !== undefined && !ehUuid(o.id)) return "Id de ligação inválido.";
      if (!ehUuid(o.de) || !ehUuid(o.para) || o.de === o.para) return "A ligação precisa de dois itens diferentes.";
      const rotulo = lerRotulo(o.rotulo);
      if (rotulo === undefined) return `O rótulo vai até ${LIMITES.rotulo} letras.`;
      return { op: "criar_ligacao", ...(o.id ? { id: o.id as string } : {}), de: o.de, para: o.para, rotulo };
    }
    case "mudar_ligacao": {
      if (!ehUuid(o.id)) return "Id de ligação inválido.";
      if (!revOk(o.rev)) return "Versão da ligação inválida.";
      const rotulo = lerRotulo(o.rotulo);
      if (rotulo === undefined) return `O rótulo vai até ${LIMITES.rotulo} letras.`;
      return { op: "mudar_ligacao", id: o.id, ...(o.rev !== undefined ? { rev: o.rev as number } : {}), rotulo };
    }
    default:
      return "Operação desconhecida.";
  }
}

/** Confere a lista de operações de um pedido (1 a 500). Tudo ou nada: a primeira que não cabe diz o motivo. */
export function lerOps(bruto: unknown): LeituraOps {
  if (!Array.isArray(bruto) || bruto.length === 0) return { ok: false, indice: -1, mensagem: "Nada para gravar." };
  if (bruto.length > LIMITES.ops) return { ok: false, indice: -1, mensagem: `No máximo ${LIMITES.ops} mudanças de uma vez.` };
  const ops: Op[] = [];
  for (let i = 0; i < bruto.length; i++) {
    const r = lerUma(bruto[i]);
    if (typeof r === "string") return { ok: false, indice: i, mensagem: r };
    ops.push(r);
  }
  return { ok: true, ops };
}

/** Título do fluxo (uma linha, 1–200). "" = vazio. */
export const tituloFluxo = (t: unknown) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, LIMITES.tituloFluxo) : "");

/**
 * Texto colado com várias linhas vira várias notas (uma por parágrafo, como colar células no FigJam), em coluna a
 * partir do ponto. Puro: a tela usa ao colar e manda as `criar_no` de uma vez.
 */
export function notasDoTexto(texto: string, origem: { x: number; y: number }, cor: CorFluxo = "amarelo"): OpCriarNo[] {
  const partes = String(texto ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, LIMITES.ops);
  const { w, h } = TAMANHO_PADRAO.nota;
  return partes.map((p, i) => ({
    op: "criar_no" as const,
    tipo: "nota" as const,
    x: origem.x,
    y: origem.y + i * (h + 16),
    w,
    h,
    z: 0,
    secaoId: null,
    dados: { texto: p.slice(0, LIMITES.nota), cor },
    imagemId: null,
    roteiroId: null,
    cardId: null,
  }));
}
