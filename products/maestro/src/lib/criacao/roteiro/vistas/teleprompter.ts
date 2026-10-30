/**
 * Vista Teleprompter (quem grava, no TPeasy): SÓ as falas, filtradas por pessoa, na marcação do TPeasy
 * (products/tpeasy/app/js/data.js: `renderScript`, `countWords`, `importAll`):
 *
 *   # Cena 1 · Abertura          ← uma seção `# …` por cena que tem fala (título de bloco no TPeasy)
 *                                ← linha em branco separa parágrafos
 *   [Ana] ((sorrindo)) Texto…    ← `[…]` é deixa (aparece, não conta palavra); `((…))` é nota (não aparece)
 *
 * - O texto da fala vai como o autor escreveu (`**ênfase**` e `[pausa]` são do TPeasy); cada parágrafo da fala vira um
 *   parágrafo; espaços nas pontas de cada linha saem.
 * - `[Nome]` só abre a fala quando o texto tem mais de uma pessoa (com "Todas"); filtrado por uma pessoa, não.
 * - A indicação da fala (`obs`) vai como `((…))`, que o TPeasy esconde no TP.
 * - `#` no começo de uma linha de fala (mesmo depois de `[Nome]`) viraria título no TPeasy: ganha um espaço de
 *   largura zero (U+200B) na frente.
 * - Lettering, plano, áudio, observação e nota ficam fora. O texto não termina com quebra de linha.
 *
 * `paraBackupTpeasy` monta o backup que o TPeasy importa em Ajustes › Restaurar backup (`TpeasyBackupSchema` em
 * packages/media-contracts/src/handoffs.ts): o id é estável por roteiro e pessoa (`maestro-<roteiro>-<pessoa|todas>`),
 * e como o TPeasy junta pelo id e fica com o mais novo (`updated`), mandar de novo ATUALIZA o roteiro no aparelho.
 * Puro.
 */
import { nomeDeQuemFala, type Roteiro } from "../modelo";
import { contarPalavras } from "../tempo";

export type OpcoesTeleprompter = {
  /** id da pessoa; vazio/undefined = todas. */
  pessoa?: string | null;
};

export type VistaTeleprompter = {
  /** O corpo na marcação do TPeasy. */
  texto: string;
  /** Quem tem fala no roteiro (para o seletor "Todas · Ana · João"). */
  pessoas: { id: string | null; nome: string }[];
  palavras: number;
  duracaoSeg: number;
  /** Seções (cenas com fala) no texto. */
  secoes: number;
};

const ZWSP = "\u200B";

/** Os parágrafos de uma fala, já na forma do TPeasy. */
function paragrafos(texto: string): string[] {
  return texto
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);
}

/**
 * Linha cujo primeiro texto é `#` viraria título no TPeasy (o `renderScript` olha a linha crua; o `countWords` olha a
 * linha já sem deixas e notas, então `[Ana] #1` também some da contagem): o `#` ganha um U+200B na frente.
 */
const protegerTitulos = (p: string) => p.replace(/^(\s*(?:\[[^\]\n]*\]\s*|\(\([^\n]*?\)\)\s*)*)#/gm, `$1${ZWSP}#`);

/** Uma linha de título de seção (uma linha, sem espaços repetidos). */
const titulo = (t: string) => t.replace(/\s+/g, " ").trim();

export function vistaTeleprompter(r: Roteiro, o: OpcoesTeleprompter = {}): VistaTeleprompter {
  const filtro = o.pessoa || null;
  const falas = r.cenas.map((c) => c.blocos.filter((b) => b.tipo === "fala" && paragrafos(b.texto).length > 0));

  const pessoas: VistaTeleprompter["pessoas"] = [];
  const vistas = new Set<string | null>();
  for (const lista of falas)
    for (const b of lista)
      if (b.tipo === "fala" && !vistas.has(b.quem)) {
        vistas.add(b.quem);
        pessoas.push({ id: b.quem, nome: nomeDeQuemFala(r, b.quem) });
      }

  const escolhidas = falas.map((lista) => lista.filter((b) => b.tipo === "fala" && (!filtro || b.quem === filtro)));
  const quemFala = new Set(escolhidas.flat().map((b) => (b.tipo === "fala" ? b.quem : null)));
  const comNome = !filtro && quemFala.size > 1;

  const secoes: string[] = [];
  r.cenas.forEach((c, i) => {
    const lista = escolhidas[i];
    if (!lista.length) return;
    const t = titulo(c.titulo);
    const partes = [`# Cena ${i + 1}${t ? ` · ${t}` : ""}`];
    for (const b of lista) {
      if (b.tipo !== "fala") continue;
      const ps = paragrafos(b.texto);
      const abre = [
        comNome ? `[${titulo(nomeDeQuemFala(r, b.quem)).replace(/[[\]]/g, "")}]` : "",
        b.obs?.trim() ? `((${titulo(b.obs).replace(/\)\)/g, ")")}))` : "",
      ]
        .filter(Boolean)
        .join(" ");
      if (abre) ps[0] = `${abre} ${ps[0]}`;
      partes.push(...ps.map(protegerTitulos));
    }
    secoes.push(partes.join("\n\n"));
  });
  const texto = secoes.join("\n\n");
  const palavras = contarPalavras(texto);
  return { texto, pessoas, palavras, duracaoSeg: Math.round((palavras / Math.max(1, r.wpm)) * 600) / 10, secoes: secoes.length };
}

/** Forma do backup do TPeasy (`TpeasyBackupSchema`, version 1), só com `scripts` (não mexe nos ajustes do aparelho). */
export type BackupTpeasy = {
  app: "tpeasy";
  version: 1;
  exportedAt: string;
  scripts: { id: string; title: string; body: string; updated: number; pos: number; fav: boolean; target: number }[];
};

/** id estável do roteiro no TPeasy, por pessoa. */
export const idNoTpeasy = (roteiroId: string, pessoa: string | null | undefined) => `maestro-${roteiroId}-${pessoa || "todas"}`.slice(0, 100);

/**
 * O backup para "Baixar para atualizar no TPeasy". `alvoSeg` vira a meta de duração do TPeasy (`target`, segundos;
 * 0 = sem meta). `atualizadoEm` deve ser a hora da versão (mandar a mesma versão de novo não muda nada no aparelho).
 */
export function paraBackupTpeasy(e: {
  roteiroId: string;
  titulo: string;
  pessoa?: string | null;
  texto: string;
  atualizadoEm: Date | number;
  alvoSeg?: number | null;
  agora?: Date;
}): BackupTpeasy {
  const updated = typeof e.atualizadoEm === "number" ? e.atualizadoEm : e.atualizadoEm.getTime();
  return {
    app: "tpeasy",
    version: 1,
    exportedAt: (e.agora ?? new Date()).toISOString(),
    scripts: [
      {
        id: idNoTpeasy(e.roteiroId, e.pessoa),
        title: titulo(e.titulo).slice(0, 300),
        body: e.texto.slice(0, 200_000),
        updated,
        pos: 0,
        fav: false,
        target: Math.max(0, Math.round(e.alvoSeg ?? 0)),
      },
    ],
  };
}
