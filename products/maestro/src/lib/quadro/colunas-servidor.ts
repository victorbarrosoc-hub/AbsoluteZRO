/**
 * As colunas do Quadro no banco (drizzle/0024_colunas.sql), sempre como a pessoa (`asUser`): ler é para todos da
 * organização; mudar é só administração e gestão, e só pelas funções `maestro.coluna_*` (que conferem de novo o papel
 * e a organização da sessão). Cada operação devolve a lista inteira, para a tela se acertar de uma vez.
 */
import { sql } from "drizzle-orm";
import { codigoPg, getBanco, mensagemPg, PG, type Contexto, type Tx } from "@/lib/db/client";
import { colunaDaLinha, ehCorColuna, nomeDeColuna, type Coluna } from "./colunas";
import { ehColuna } from "./metodo";

export type FalhaColuna = { ok: false; status: number; erro: string; mensagem: string };
export type ResColunas = { ok: true; colunas: Coluna[]; movidos?: number } | FalhaColuna;

const falha = (status: number, erro: string, mensagem: string): FalhaColuna => ({ ok: false, status, erro, mensagem });

const MENSAGENS: Record<string, [number, string]> = {
  "coluna:nome": [400, "Dê um nome de 1 a 30 letras."],
  "coluna:limite": [409, "Chegou ao limite de colunas novas. Arquive uma antes."],
  "coluna:sistema": [409, "Essa coluna faz parte do método e não pode ser arquivada."],
  "coluna:destino": [400, "Escolha outra coluna para os cards."],
  "coluna:ordem": [409, "As colunas mudaram em outro aparelho. O Quadro foi atualizado."],
  "coluna:tem_cards": [409, "Ainda há cards nessa coluna."],
  "coluna:nao_existe": [404, "Essa coluna não existe mais."],
};

function traduzir(e: unknown): FalhaColuna {
  const codigo = codigoPg(e);
  const msg = mensagemPg(e);
  if (codigo === PG.semPrivilegio) return falha(403, "sem_permissao", "Só administração e gestão mudam as colunas.");
  if ((codigo === PG.regra || codigo === "P0002") && msg in MENSAGENS) {
    const [status, mensagem] = MENSAGENS[msg];
    return falha(status, msg.replace("coluna:", "coluna_"), mensagem);
  }
  if (codigo === PG.checagem) return falha(400, "formato", "Confira o nome e a cor da coluna.");
  throw e;
}

type Linha = { id: string; papel: string | null; nome: string; cor: string; ordem: number; arquivada: boolean };

async function lerNaTx(tx: Tx): Promise<Coluna[]> {
  const linhas = (await tx.execute(
    sql`select id, papel, nome, cor, ordem, arquivada_em is not null as arquivada from maestro.colunas order by arquivada_em nulls first, ordem, created_at, id`,
  )) as unknown as Linha[];
  return linhas.map(colunaDaLinha);
}

/** As colunas da organização da sessão (vivas e arquivadas). */
export async function carregarColunas(ctx: Contexto): Promise<Coluna[]> {
  return getBanco().asUser(ctx, lerNaTx);
}

/** Lê o que veio da tela e chama a função certa. Operações: coluna_criar, coluna_mudar, coluna_ordenar,
 * coluna_arquivar, coluna_restaurar, colunas_padrao. */
export async function operarColuna(ctx: Contexto, corpo: Record<string, unknown>): Promise<ResColunas> {
  const op = corpo.op;
  const id = corpo.id;
  const idOk = typeof id === "string" && ehColuna(id);
  let comando: ReturnType<typeof sql> | null = null;
  switch (op) {
    case "coluna_criar": {
      const nome = nomeDeColuna(corpo.nome);
      if (!nome) return falha(400, "coluna_nome", MENSAGENS["coluna:nome"][1]);
      const cor = corpo.cor ?? "grafite";
      if (!ehCorColuna(cor)) return falha(400, "formato", "Cor fora da paleta.");
      const pos = corpo.posicao;
      if (pos !== undefined && pos !== null && !(Number.isInteger(pos) && (pos as number) >= 1 && (pos as number) <= 100))
        return falha(400, "formato", "Posição inválida.");
      comando = sql`select 0 as n from maestro.coluna_criar(${nome}, ${cor}, ${(pos as number | null | undefined) ?? null}::int)`;
      break;
    }
    case "coluna_mudar": {
      if (!idOk) return falha(400, "formato", "Coluna inválida.");
      const nome = corpo.nome === undefined ? null : nomeDeColuna(corpo.nome);
      if (nome === undefined) return falha(400, "coluna_nome", MENSAGENS["coluna:nome"][1]);
      const cor = corpo.cor === undefined ? null : corpo.cor;
      if (cor !== null && !ehCorColuna(cor)) return falha(400, "formato", "Cor fora da paleta.");
      if (nome === null && cor === null) return falha(400, "formato", "Nada para mudar.");
      comando = sql`select 0 as n from maestro.coluna_mudar(${id}, ${nome}, ${cor})`;
      break;
    }
    case "coluna_ordenar": {
      const ids = corpo.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(ehColuna)) return falha(400, "formato", "Ordem inválida.");
      comando = sql`select 0 as n from (select maestro.coluna_ordenar(${`{${ids.join(",")}}`}::text[])) x`;
      break;
    }
    case "coluna_arquivar": {
      const destino = corpo.destino;
      if (!idOk || typeof destino !== "string" || !ehColuna(destino)) return falha(400, "formato", "Coluna inválida.");
      comando = sql`select maestro.coluna_arquivar(${id}, ${destino}) as n`;
      break;
    }
    case "coluna_restaurar": {
      if (!idOk) return falha(400, "formato", "Coluna inválida.");
      comando = sql`select 0 as n from maestro.coluna_restaurar(${id})`;
      break;
    }
    case "colunas_padrao":
      comando = sql`select 0 as n from (select maestro.colunas_restaurar_padrao()) x`;
      break;
    default:
      return falha(400, "formato", "Operação desconhecida.");
  }
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [r] = (await tx.execute(comando)) as unknown as { n: number }[];
      const colunas = await lerNaTx(tx);
      return op === "coluna_arquivar" ? { ok: true as const, colunas, movidos: Number(r?.n ?? 0) } : { ok: true as const, colunas };
    });
  } catch (e) {
    return traduzir(e);
  }
}

/** As operações de coluna que a rota do Quadro aceita. */
export const OPS_DE_COLUNA = new Set(["coluna_criar", "coluna_mudar", "coluna_ordenar", "coluna_arquivar", "coluna_restaurar", "colunas_padrao"]);
