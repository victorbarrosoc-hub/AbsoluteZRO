/**
 * O roteiro como o cliente lê no link de aprovação (`/a/<token>`, plano da Criação §4.6, fase F7). Puro: o servidor
 * monta isto da versão salva (o `conteudo` congelado em `roteiro_versoes`) antes de qualquer byte ir à tela, então o que
 * é da equipe nunca sai: nota interna, plano, observação para a captação, a dica cinza dos modelos, ids de pessoas e
 * as notas `((…))` da marcação do TPeasy. Fica a vista Literário (a que lê melhor no iPhone): cabeçalho da cena, ação,
 * falas com o nome, lettering e áudio como linhas discretas. Cada linha leva o id do bloco, para o comentário preso a ele.
 */
import { lerRoteiro } from "@/lib/criacao/roteiro/modelo";
import { nomeNaFala, vistaLiterario } from "@/lib/criacao/roteiro/vistas";

export type LinhaDoCliente =
  | { tipo: "acao"; bloco: string; texto: string }
  | { tipo: "fala"; bloco: string; nome: string; obs: string | null; texto: string }
  | { tipo: "lettering" | "audio"; bloco: string; rotulo: string; texto: string };

export type CenaDoCliente = { numero: number; cabecalho: string; titulo: string | null; linhas: LinhaDoCliente[] };

export type RoteiroDoCliente = {
  /** O número da versão do roteiro (v3), não o da peça. */
  n: number;
  titulo: string;
  duracaoSeg: number;
  formato: string;
  cenas: CenaDoCliente[];
};

/** Tira a nota `((…))` da marcação (é para quem fala, "não aparece") e o espaço que sobra. */
export const semNotaDeFala = (t: string) =>
  t
    .replace(/\(\([\s\S]*?\)\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();

/** Os blocos que o cliente vê e pode comentar (os mesmos de `maestro.roteiro_bloco_do_cliente`, drizzle/0033). */
export const TIPOS_DO_CLIENTE = ["fala", "acao", "lettering", "audio"] as const;

/**
 * Da forma que o banco devolve (`{ n, titulo, duracaoSeg, conteudo }`) para a vista do cliente. null = não abre (a peça
 * mostra o estado neutro). Cena sem nada que o cliente veja continua, com o cabeçalho (a ordem e o número batem).
 */
export function roteiroDoCliente(bruto: unknown): RoteiroDoCliente | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as { n?: unknown; titulo?: unknown; duracaoSeg?: unknown; conteudo?: unknown };
  const r = lerRoteiro(b.conteudo);
  if (!r || typeof b.n !== "number") return null;
  const cenas = vistaLiterario(r).cenas.map((c): CenaDoCliente => ({
    numero: c.numero,
    cabecalho: c.cabecalho,
    titulo: c.titulo,
    linhas: c.linhas.flatMap((l): LinhaDoCliente[] => {
      if (l.tipo === "acao") return [{ tipo: "acao", bloco: l.blocoId, texto: l.texto }];
      if (l.tipo === "fala") {
        const texto = semNotaDeFala(l.texto);
        return texto ? [{ tipo: "fala", bloco: l.blocoId, nome: nomeNaFala(l.nome, l.modo), obs: l.obs, texto }] : [];
      }
      return [{ tipo: l.tipo, bloco: l.blocoId, rotulo: l.rotulo, texto: l.texto }];
    }),
  }));
  return {
    n: b.n,
    titulo: typeof b.titulo === "string" ? b.titulo : "Roteiro",
    duracaoSeg: typeof b.duracaoSeg === "number" ? b.duracaoSeg : 0,
    formato: r.formato,
    cenas,
  };
}

/** Os ids de bloco que o cliente vê (para conferir um comentário antes de ir ao banco, e nos testes). */
export const blocosDoCliente = (r: RoteiroDoCliente): Set<string> => new Set(r.cenas.flatMap((c) => c.linhas.map((l) => l.bloco)));
