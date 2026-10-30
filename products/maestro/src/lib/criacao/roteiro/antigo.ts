/**
 * "Abrir no editor novo" (plano da Criação §4.5): lê um documento antigo do projeto (`maestro.documentos`, tipos
 * `roteiro` = `{ texto }` e `decupagem` = `{ planos[] }`) e devolve um roteiro novo. Só leitura: o documento antigo
 * continua lá e nada é apagado (quem grava o roteiro novo é `criarRoteiro`). Puro.
 *
 * - Roteiro antigo: cada parágrafo (separado por linha em branco) vira um bloco de fala, de um Locutor sem nome. Uma
 *   linha `# Título` (a marcação do TPeasy, que o texto antigo pode ter) abre uma cena nova com esse título; sem
 *   títulos, é uma cena só.
 * - Decupagem: cada valor diferente de "cena" vira uma cena (na ordem em que aparece) e cada plano vira `plano`
 *   (tamanho reconhecido pela sigla ou pelo nome; senão "outro" com o texto original no complemento; lente,
 *   movimento e "feito" vão junto) + `acao` com a descrição.
 */
import { lerConteudo } from "@/lib/documentos/conteudo";
import { type Bloco, type Cena, LIMITES, NOME_TAMANHO_PLANO, novoId, type Roteiro, TAMANHOS_PLANO, type TamanhoPlano, WPM_PADRAO } from "./modelo";

type Gerar = () => string;

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "PM", "pm", "Plano médio", "detalhe", "drone" → o tamanho; o resto, null. */
export function tamanhoDoTexto(t: string): TamanhoPlano | null {
  const s = semAcento(t).replace(/\.$/, "");
  if (!s) return null;
  for (const k of TAMANHOS_PLANO) {
    if (k === "outro") continue;
    if (semAcento(k) === s || semAcento(NOME_TAMANHO_PLANO[k]) === s) return k;
  }
  if (s === "ppp" || s === "close") return "PP";
  return null;
}

function doTexto(texto: string, g: Gerar): Roteiro {
  const locutor = { id: g(), nome: "", papel: "locutor" as const };
  const cenas: Cena[] = [];
  let atual: Cena | null = null;
  let blocos = 0;
  for (const par of texto.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const linhas = par.split("\n");
    let resto: string[] = [];
    const fecharFala = () => {
      const t = resto.join("\n").trim();
      resto = [];
      if (!t || blocos >= LIMITES.blocos) return;
      if (!atual) cenas.push((atual = { id: g(), titulo: "", blocos: [] }));
      atual.blocos.push({ id: g(), tipo: "fala", quem: locutor.id, texto: t.slice(0, LIMITES.fala), modo: "on" });
      blocos++;
    };
    for (const l of linhas) {
      const h = /^\s*#+\s*(.*)$/.exec(l);
      if (h && cenas.length < LIMITES.cenas) {
        fecharFala();
        cenas.push((atual = { id: g(), titulo: h[1].trim().slice(0, LIMITES.tituloCena), blocos: [] }));
      } else resto.push(l);
    }
    fecharFala();
  }
  if (!cenas.length) cenas.push({ id: g(), titulo: "", blocos: [] });
  return { v: 1, formato: "16:9", alvo: null, wpm: WPM_PADRAO, pessoas: blocos ? [locutor] : [], cenas };
}

function daDecupagem(planos: { cena: string; plano: string; descricao: string; lente: string; movimento: string; feito: boolean }[], g: Gerar): Roteiro {
  const porCena = new Map<string, Cena>();
  const cenas: Cena[] = [];
  for (const p of planos) {
    const chave = p.cena.trim();
    let c = porCena.get(chave);
    if (!c) {
      if (cenas.length >= LIMITES.cenas) continue;
      c = { id: g(), titulo: chave ? (/^\d+[a-z]?$/i.test(chave) ? `Cena ${chave}` : chave) : "", blocos: [] };
      porCena.set(chave, c);
      cenas.push(c);
    }
    const tamanho = tamanhoDoTexto(p.plano);
    const plano: Bloco = { id: g(), tipo: "plano", tamanho: tamanho ?? "outro" };
    if (!tamanho && p.plano.trim()) plano.texto = p.plano.trim();
    if (p.lente.trim()) plano.lente = p.lente.trim();
    if (p.movimento.trim()) plano.movimento = p.movimento.trim();
    if (p.feito) plano.feito = true;
    c.blocos.push(plano);
    if (p.descricao.trim()) c.blocos.push({ id: g(), tipo: "acao", texto: p.descricao.trim() });
  }
  if (!cenas.length) cenas.push({ id: g(), titulo: "", blocos: [] });
  return { v: 1, formato: "16:9", alvo: null, wpm: WPM_PADRAO, pessoas: [], cenas };
}

/** O documento antigo como roteiro novo. null = tipo que não é roteiro nem decupagem, ou conteúdo que não cabe. */
export function roteiroDoDocumentoAntigo(tipo: string, conteudo: unknown, gerar: Gerar = novoId): Roteiro | null {
  if (tipo === "roteiro") {
    const c = lerConteudo("roteiro", conteudo);
    return c && "texto" in c ? doTexto(c.texto, gerar) : null;
  }
  if (tipo === "decupagem") {
    const c = lerConteudo("decupagem", conteudo);
    return c && "planos" in c ? daDecupagem(c.planos, gerar) : null;
  }
  return null;
}
