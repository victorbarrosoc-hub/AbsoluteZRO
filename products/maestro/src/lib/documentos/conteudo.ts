/**
 * Documentos do projeto (porte de project_checklists, call_sheets e scripts do ZRO): a forma de cada tipo e a
 * conferência do que a tela manda. Puro.
 */

export const TIPOS_DOC = [
  { k: "ordem_do_dia", nome: "Ordem do dia" },
  { k: "checklist", nome: "Checklist de equipamento" },
  { k: "roteiro", nome: "Roteiro" },
  { k: "decupagem", nome: "Decupagem" },
] as const;
export type TipoDoc = (typeof TIPOS_DOC)[number]["k"];
export const nomeTipoDoc = (k: string) => TIPOS_DOC.find((t) => t.k === k)?.nome ?? k;
export const ehTipoDoc = (v: unknown): v is TipoDoc => TIPOS_DOC.some((t) => t.k === v);

export type ItemChecklist = { nome: string; qtd: number; saiu: boolean; voltou: boolean };
export type Checklist = { itens: ItemChecklist[] };
export type OrdemDoDia = {
  chamada: string | null;
  local: string | null;
  localUrl: string | null;
  cronograma: { hora: string; atividade: string; obs: string }[];
  equipe: { nome: string; funcao: string; chamada: string }[];
  contatos: { nome: string; funcao: string; telefone: string }[];
  notas: string | null;
};
export type Roteiro = { texto: string };
export type Plano = { cena: string; plano: string; descricao: string; lente: string; movimento: string; feito: boolean };
export type Decupagem = { planos: Plano[] };
export type Conteudo = Checklist | OrdemDoDia | Roteiro | Decupagem;

export function conteudoVazio(tipo: TipoDoc): Conteudo {
  switch (tipo) {
    case "checklist":
      return { itens: [] };
    case "ordem_do_dia":
      return { chamada: null, local: null, localUrl: null, cronograma: [], equipe: [], contatos: [], notas: null };
    case "roteiro":
      return { texto: "" };
    case "decupagem":
      return { planos: [] };
  }
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : "");
const linhas = <T>(v: unknown, max: number, f: (x: Record<string, unknown>) => T | null): T[] | null => {
  if (!Array.isArray(v) || v.length > max) return null;
  const out: T[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") return null;
    const r = f(x as Record<string, unknown>);
    if (r) out.push(r);
  }
  return out;
};
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const hora = (v: unknown) => (typeof v === "string" && HORA.test(v) ? v : "");

/** Confere e normaliza o conteúdo de um tipo. null = formato que não cabe. */
export function lerConteudo(tipo: TipoDoc, v: unknown): Conteudo | null {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  switch (tipo) {
    case "checklist": {
      const itens = linhas(c.itens, 300, (x) => {
        const nome = txt(x.nome, 120).trim();
        if (!nome) return null;
        const qtd = Math.min(999, Math.max(1, Math.round(Number(x.qtd) || 1)));
        return { nome, qtd, saiu: x.saiu === true, voltou: x.voltou === true };
      });
      return itens ? { itens } : null;
    }
    case "ordem_do_dia": {
      const cronograma = linhas(c.cronograma, 100, (x) => {
        const atividade = txt(x.atividade, 200).trim();
        return atividade || hora(x.hora) ? { hora: hora(x.hora), atividade, obs: txt(x.obs, 300).trim() } : null;
      });
      const equipe = linhas(c.equipe, 100, (x) => {
        const nome = txt(x.nome, 120).trim();
        return nome ? { nome, funcao: txt(x.funcao, 60).trim(), chamada: hora(x.chamada) } : null;
      });
      const contatos = linhas(c.contatos, 40, (x) => {
        const nome = txt(x.nome, 120).trim();
        return nome
          ? {
              nome,
              funcao: txt(x.funcao, 60).trim(),
              telefone: txt(x.telefone, 30)
                .replace(/[^\d+() -]/g, "")
                .trim(),
            }
          : null;
      });
      if (!cronograma || !equipe || !contatos) return null;
      const url = txt(c.localUrl, 500).trim();
      return {
        chamada: hora(c.chamada) || null,
        local: txt(c.local, 300).trim() || null,
        localUrl: /^https:\/\/[^\s]+$/.test(url) ? url : null,
        cronograma,
        equipe,
        contatos,
        notas: txt(c.notas, 4000).trim() || null,
      };
    }
    case "roteiro":
      return { texto: txt(c.texto, 100_000) };
    case "decupagem": {
      const planos = linhas(c.planos, 500, (x) => {
        const descricao = txt(x.descricao, 500).trim();
        const plano = txt(x.plano, 20).trim();
        if (!descricao && !plano) return null;
        return {
          cena: txt(x.cena, 20).trim(),
          plano,
          descricao,
          lente: txt(x.lente, 40).trim(),
          movimento: txt(x.movimento, 60).trim(),
          feito: x.feito === true,
        };
      });
      return planos ? { planos } : null;
    }
  }
}

/** Andamento do checklist: quantos saíram e voltaram. */
export function andamentoChecklist(c: Checklist) {
  const total = c.itens.length;
  return { total, sairam: c.itens.filter((i) => i.saiu).length, voltaram: c.itens.filter((i) => i.voltou).length };
}
