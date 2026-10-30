/**
 * "Copiar para IA" e o JSON do Fluxo (plano da Criação §6.2; a F6 põe na tela e no link). Puro: recebe o fluxo já lido
 * com o RLS de quem exporta (`dadosParaExportar` em servidor.ts) e devolve Markdown ou o objeto `maestro.fluxo/1`.
 *
 * Regras:
 *   * só o que está vivo (lápides e ligações com ponta apagada ficam fora); seções na ordem de leitura (de cima para
 *     baixo, depois da esquerda para a direita) e os itens de cada seção na mesma ordem; o que não está em seção vai
 *     no fim ("Fora das seções") ou direto, se o fluxo não tem seção;
 *   * imagem só leva endereço quando `urlImagem` devolve um (o link de exportação da F6). Sem ele: `(não incluída)` e
 *     a linha final "Crie um link para incluir as imagens". Nunca sai o endereço interno da rota da equipe;
 *   * referência fora do alcance sai como "(sem acesso)", sem título nem id; apagada de vez, "(removido)".
 */
import { NOME_FONTE_LINK } from "./endereco";
import type { DadosImagem, DadosLink, DadosNota, DadosSecao, ImagemNo, LigacaoFluxo, NoFluxo, RefResolvida } from "./modelo";

export const FORMATO_FLUXO = "maestro.fluxo/1" as const;

export type FluxoParaExportar = {
  titulo: string;
  nos: NoFluxo[];
  ligacoes: LigacaoFluxo[];
  /** Referências resolvidas, pelo id do nó. */
  refs: Record<string, RefResolvida>;
};

export type OpcoesExportar = {
  agora: Date;
  /** Endereço público da imagem (só com o link de exportação). Sem ele, nenhuma imagem leva endereço. */
  urlImagem?: ((img: ImagemNo) => string | null) | null;
};

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/** 74 → "1:14". */
export function duracao(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

const umaLinha = (t: string) => t.replace(/\s+/g, " ").trim();
const corta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
export const prazoCurto = (p: string | null) => (p && /^\d{4}-\d{2}-\d{2}/.test(p) ? `${p.slice(8, 10)}/${p.slice(5, 7)}` : null);
const ordemDeLeitura = (a: NoFluxo, b: NoFluxo) => a.y - b.y || a.x - b.x || a.z - b.z || a.id.localeCompare(b.id);

export type Organizado = { secoes: { no: NoFluxo; itens: NoFluxo[] }[]; soltos: NoFluxo[]; vivos: Map<string, NoFluxo>; ligacoes: LigacaoFluxo[] };

/** Seções na ordem de leitura com os itens de cada uma, os soltos e as ligações vivas (a Lista da tela usa também). */
export function organizar(f: FluxoParaExportar): Organizado {
  const vivos = new Map(f.nos.filter((n) => !n.apagado).map((n) => [n.id, n]));
  const lista = [...vivos.values()].sort(ordemDeLeitura);
  const secoes = lista.filter((n) => n.tipo === "secao").map((no) => ({ no, itens: [] as NoFluxo[] }));
  const porId = new Map(secoes.map((s) => [s.no.id, s]));
  const soltos: NoFluxo[] = [];
  for (const n of lista) {
    if (n.tipo === "secao") continue;
    const s = n.secaoId ? porId.get(n.secaoId) : undefined;
    if (s) s.itens.push(n);
    else soltos.push(n);
  }
  const ligacoes = f.ligacoes
    .filter((l) => !l.apagado && vivos.has(l.de) && vivos.has(l.para))
    .sort((a, b) => ordemDeLeitura(vivos.get(a.de)!, vivos.get(b.de)!) || ordemDeLeitura(vivos.get(a.para)!, vivos.get(b.para)!));
  return { secoes, soltos, vivos, ligacoes };
}

function descreverRef(r: RefResolvida | undefined): string {
  if (!r || r.estado === "removido") return "(removido)";
  if (r.estado === "sem_acesso") return "(sem acesso)";
  if (r.estado === "titulo") return `"${umaLinha(r.titulo)}"`;
  if (r.tipo === "roteiro") {
    const partes = [r.versao > 0 ? `v${r.versao}` : "rascunho", duracao(r.duracaoSeg)];
    if (r.naLixeira) partes.push("na lixeira");
    return `"${umaLinha(r.titulo)}" (${partes.join(", ")})`;
  }
  if (r.tipo === "card") {
    const partes = [r.colunaNome ?? r.coluna];
    const p = prazoCurto(r.prazo);
    if (p) partes.push(`prazo ${p}`);
    if (r.naLixeira) partes.push("na lixeira");
    return `"${umaLinha(r.titulo)}" (${partes.join(", ")})`;
  }
  return "(removido)";
}

/** O nome de um item numa ligação ("Gancho…" → Roteiro "Institucional" (v3, 1:14)). */
function rotuloDoItem(n: NoFluxo, refs: Record<string, RefResolvida>): string {
  switch (n.tipo) {
    case "nota":
      return `"${corta(umaLinha((n.dados as DadosNota).texto) || "Nota vazia", 60)}"`;
    case "imagem": {
      const l = umaLinha((n.dados as DadosImagem).legenda);
      return l ? `Imagem "${corta(l, 60)}"` : "Imagem";
    }
    case "link": {
      const d = n.dados as DadosLink;
      return `Link "${corta(umaLinha(d.titulo) || d.link.dominio, 60)}"`;
    }
    case "secao":
      return `Seção "${corta(umaLinha((n.dados as DadosSecao).nome) || "Sem nome", 60)}"`;
    case "roteiro":
      return `Roteiro ${descreverRef(refs[n.id])}`;
    case "card":
      return `Card ${descreverRef(refs[n.id])}`;
  }
}

function linhaDoItem(n: NoFluxo, f: FluxoParaExportar, o: OpcoesExportar, semUrl: { n: number }): string {
  switch (n.tipo) {
    case "nota": {
      const t = (n.dados as DadosNota).texto.trim();
      if (!t) return "- Nota: (vazia)";
      const [primeira, ...resto] = t.split("\n");
      return [`- Nota: ${primeira}`, ...resto.map((l) => (l ? `  ${l}` : ""))].join("\n").replace(/\n+$/, "");
    }
    case "imagem": {
      const leg = umaLinha((n.dados as DadosImagem).legenda);
      const url = n.imagem && o.urlImagem ? o.urlImagem(n.imagem) : null;
      if (!url) semUrl.n++;
      return `- Imagem${leg ? `: "${leg}"` : " sem legenda"} (${url ?? "não incluída"})`;
    }
    case "link": {
      const d = n.dados as DadosLink;
      const titulo = umaLinha(d.titulo);
      return `- Link: ${titulo ? `${titulo}, ` : ""}${d.link.dominio} (${d.url})`;
    }
    case "roteiro":
      return `- Roteiro: ${descreverRef(f.refs[n.id])}`;
    case "card":
      return `- Card: ${descreverRef(f.refs[n.id])}`;
    case "secao":
      return "";
  }
}

const contar = (n: number) => (n === 1 ? "1 item" : `${n} itens`);

/** Markdown pronto para colar numa IA. */
export function fluxoParaMarkdown(f: FluxoParaExportar, o: OpcoesExportar): string {
  const org = organizar(f);
  const itens = [...org.vivos.values()].filter((n) => n.tipo !== "secao").length;
  const semUrl = { n: 0 };
  const out: string[] = [`# Fluxo: ${umaLinha(f.titulo).replace(/^#+\s*/, "") || "Sem título"}`, `> Do Maestro, ${DATA.format(o.agora)} · ${contar(itens)}`];
  for (const s of org.secoes) {
    out.push("", `## ${umaLinha((s.no.dados as DadosSecao).nome).replace(/^#+\s*/, "") || "Seção sem nome"}`);
    if (!s.itens.length) out.push("- (vazia)");
    for (const n of s.itens) out.push(linhaDoItem(n, f, o, semUrl));
  }
  if (org.soltos.length) {
    out.push("");
    if (org.secoes.length) out.push("## Fora das seções");
    for (const n of org.soltos) out.push(linhaDoItem(n, f, o, semUrl));
  }
  if (org.ligacoes.length) {
    out.push("", "## Ligações");
    for (const l of org.ligacoes) {
      const de = rotuloDoItem(org.vivos.get(l.de)!, f.refs);
      const para = rotuloDoItem(org.vivos.get(l.para)!, f.refs);
      out.push(`- ${de} → ${para}${l.rotulo ? ` · ${umaLinha(l.rotulo)}` : ""}`);
    }
  }
  if (semUrl.n) out.push("", "> Crie um link para incluir as imagens.");
  return `${out.join("\n")}\n`;
}

// ───────────── JSON maestro.fluxo/1 ─────────────

type RefJson =
  | { estado: "ok"; titulo: string; situacao: string; versao: number; duracaoSeg: number; naLixeira: boolean }
  | { estado: "ok"; titulo: string; coluna: string; colunaNome: string | null; prazo: string | null; naLixeira: boolean }
  | { estado: "ok"; titulo: string }
  | { estado: "sem_acesso" | "removido" };

export type NoJson = {
  id: string;
  tipo: "nota" | "imagem" | "link" | "roteiro" | "card";
  secao: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  texto?: string;
  cor?: string;
  legenda?: string;
  imagem?: { largura: number; altura: number; url: string | null };
  link?: { url: string; titulo: string; fonte: string; nomeFonte: string; dominio: string; id?: string };
  ref?: RefJson;
};

export type FluxoJson = {
  formato: typeof FORMATO_FLUXO;
  titulo: string;
  geradoEm: string;
  itens: number;
  secoes: { id: string; nome: string; cor: string; x: number; y: number; w: number; h: number }[];
  nos: NoJson[];
  ligacoes: { id: string; de: string; para: string; rotulo: string | null }[];
};

function refJson(r: RefResolvida | undefined): RefJson {
  if (r?.estado === "titulo") return { estado: "ok", titulo: r.titulo };
  if (!r || r.estado !== "ok") return { estado: r?.estado ?? "removido" };
  if (r.tipo === "roteiro") return { estado: "ok", titulo: r.titulo, situacao: r.situacao, versao: r.versao, duracaoSeg: r.duracaoSeg, naLixeira: r.naLixeira };
  return { estado: "ok", titulo: r.titulo, coluna: r.coluna, colunaNome: r.colunaNome, prazo: r.prazo, naLixeira: r.naLixeira };
}

/** O objeto `maestro.fluxo/1` (para IA que lê JSON, o pacote .zip e o link `.json` da F6). */
export function fluxoParaJson(f: FluxoParaExportar, o: OpcoesExportar): FluxoJson {
  const org = organizar(f);
  const ordem = [...org.secoes.flatMap((s) => s.itens), ...org.soltos];
  const secaoViva = new Set(org.secoes.map((s) => s.no.id));
  return {
    formato: FORMATO_FLUXO,
    titulo: umaLinha(f.titulo),
    geradoEm: o.agora.toISOString(),
    itens: ordem.length,
    secoes: org.secoes.map(({ no }) => ({
      id: no.id,
      nome: (no.dados as DadosSecao).nome,
      cor: (no.dados as DadosSecao).cor,
      x: no.x,
      y: no.y,
      w: no.w,
      h: no.h,
    })),
    nos: ordem.map((n) => {
      const base: NoJson = {
        id: n.id,
        tipo: n.tipo as NoJson["tipo"],
        secao: n.secaoId && secaoViva.has(n.secaoId) ? n.secaoId : null,
        x: n.x,
        y: n.y,
        w: n.w,
        h: n.h,
      };
      switch (n.tipo) {
        case "nota":
          return { ...base, texto: (n.dados as DadosNota).texto, cor: (n.dados as DadosNota).cor };
        case "imagem":
          return {
            ...base,
            legenda: (n.dados as DadosImagem).legenda,
            imagem: {
              largura: n.imagem?.largura ?? 0,
              altura: n.imagem?.altura ?? 0,
              url: n.imagem && o.urlImagem ? o.urlImagem(n.imagem) : null,
            },
          };
        case "link": {
          const d = n.dados as DadosLink;
          return {
            ...base,
            link: {
              url: d.url,
              titulo: d.titulo,
              fonte: d.link.fonte,
              nomeFonte: NOME_FONTE_LINK[d.link.fonte],
              dominio: d.link.dominio,
              ...(d.link.id ? { id: d.link.id } : {}),
            },
          };
        }
        default:
          return { ...base, ref: refJson(f.refs[n.id]) };
      }
    }),
    ligacoes: org.ligacoes.map((l) => ({ id: l.id, de: l.de, para: l.para, rotulo: l.rotulo })),
  };
}
