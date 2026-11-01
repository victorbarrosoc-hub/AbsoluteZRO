/**
 * Coleções de referências (docs/REFERENCIAS.md §2–3). Cada coleção é uma pasta em
 * "SOBEDESCE Referências/<nome>" num Drive da pessoa; o banco guarda o nome, a pasta e o token do link pra IA.
 */
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { novoId } from "@/lib/auth/tokens";
import { db, schema } from "@/lib/db";
import { depoisDaResposta, type Depois } from "@/lib/depois";
import { ErroConta } from "@/lib/google/contas";
import { aspas, atualizarArquivo, criarPasta, ErroDrive, lerArquivo, listarTudo, PASTA_MIME, type ArquivoDrive } from "@/lib/google/drive";
import { chaveNome, validarNome } from "./texto";

const { colecoes, contasGoogle, referenciasFila } = schema;
type Linha = typeof colecoes.$inferSelect;

export const NOME_RAIZ = "SOBEDESCE Referências";
export const MARCA_RAIZ = "referencias";
export const MARCA_COLECAO = "colecao";

export type ColecaoPublica = {
  id: string;
  nome: string;
  contaGoogleId: string;
  driveFolderId: string;
  /** Endereço do link pra IA, ou null se desligado. */
  link: string | null;
  /** Links na fila (pendente, baixando ou com erro). */
  naFila: number;
  criadoEm: string;
  atualizadoEm: string;
};

export function linkPublico(origem: string, token: string | null): string | null {
  return token ? `${origem}/r/${token}` : null;
}

export function novoTokenPublico(): string {
  return randomBytes(32).toString("base64url");
}

export function publica(l: Linha, origem: string, naFila = 0): ColecaoPublica {
  return {
    id: l.id,
    nome: l.nome,
    contaGoogleId: l.contaGoogleId,
    driveFolderId: l.driveFolderId,
    link: linkPublico(origem, l.publicaToken),
    naFila,
    criadoEm: l.criadoEm.toISOString(),
    atualizadoEm: l.atualizadoEm.toISOString(),
  };
}

/** Coleções da pessoa (mais recentes primeiro), com a contagem da fila e as pastas raiz conhecidas. */
export async function listarColecoes(usuarioId: string) {
  const [linhas, contas, fila] = await Promise.all([
    db.select().from(colecoes).where(eq(colecoes.usuarioId, usuarioId)),
    db
      .select({ id: contasGoogle.id, pasta: contasGoogle.referenciasPastaId, estado: contasGoogle.estado, criadoEm: contasGoogle.criadoEm })
      .from(contasGoogle)
      .where(eq(contasGoogle.usuarioId, usuarioId))
      .orderBy(asc(contasGoogle.criadoEm)),
    db
      .select({ colecaoId: referenciasFila.colecaoId, n: sql<number>`count(*)::int` })
      .from(referenciasFila)
      .where(and(eq(referenciasFila.usuarioId, usuarioId), inArray(referenciasFila.status, ["pendente", "baixando", "erro"])))
      .groupBy(referenciasFila.colecaoId),
  ]);
  const porColecao = new Map(fila.map((f) => [f.colecaoId, Number(f.n)]));
  linhas.sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
  const raizes = contas.filter((c) => c.pasta).map((c) => ({ contaGoogleId: c.id, driveFolderId: c.pasta! }));
  const padrao = contas.find((c) => c.estado === "ok") ?? contas[0];
  const raiz = raizes.find((r) => r.contaGoogleId === padrao?.id) ?? raizes[0] ?? null;
  return { linhas, porColecao, raiz, raizes };
}

export async function acharColecao(usuarioId: string, id: string): Promise<Linha | null> {
  if (!id || id.length > 64) return null;
  const [l] = await db.select().from(colecoes).where(and(eq(colecoes.id, id), eq(colecoes.usuarioId, usuarioId))).limit(1);
  return l ?? null;
}

/** Por id ou por nome (sem maiúsculas nem acentos): o Atalho do iPhone manda o nome. */
export async function acharPorIdOuNome(usuarioId: string, valor: string): Promise<Linha | null> {
  const v = valor.trim();
  if (!v) return null;
  const [l] = await db
    .select()
    .from(colecoes)
    .where(and(eq(colecoes.usuarioId, usuarioId), sql`(${colecoes.id} = ${v} or ${colecoes.nomeChave} = ${chaveNome(v)})`))
    .limit(1);
  return l ?? null;
}

export class ErroColecao extends Error {
  constructor(
    public codigo: "duplicada" | "sem_drive" | "nao_encontrada",
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroColecao";
  }
}

/** Conta Google da coleção nova: a pedida (precisa ser da pessoa) ou a primeira em ordem. */
async function contaPara(usuarioId: string, contaGoogleId?: string) {
  const contas = await db
    .select({ id: contasGoogle.id, estado: contasGoogle.estado, pasta: contasGoogle.referenciasPastaId, criadoEm: contasGoogle.criadoEm })
    .from(contasGoogle)
    .where(eq(contasGoogle.usuarioId, usuarioId))
    .orderBy(asc(contasGoogle.criadoEm));
  if (contaGoogleId) {
    const c = contas.find((x) => x.id === contaGoogleId);
    if (!c) throw new ErroColecao("nao_encontrada", 404, "Este Google Drive não está ligado à sua conta.");
    if (c.estado !== "ok") throw new ErroConta("reconectar");
    return c;
  }
  const c = contas.find((x) => x.estado === "ok");
  if (!c) throw new ErroColecao("sem_drive", 409, contas.length ? "Reconecte o Google Drive na sua conta." : "Conecte um Google Drive na sua conta primeiro.");
  return c;
}

/** A guardada ainda vale (existe e não está na lixeira)? 404 = não; outros erros sobem. */
async function guardadaValida(usuarioId: string, contaId: string, pasta: string | null): Promise<boolean> {
  if (!pasta) return false;
  try {
    return !(await lerArquivo(usuarioId, contaId, pasta)).trashed;
  } catch (e) {
    if (e instanceof ErroDrive && e.status === 404) return false;
    throw e;
  }
}

/**
 * Pastas "SOBEDESCE Referências" que já existem neste Drive, a mais antiga primeiro. Não cria nada.
 * - As com a marca deste app (appProperties sobedesce=referencias), mesmo se a pessoa mudou de nome ou de lugar.
 * - As da pessoa com o nome certo: as do cliente OAuth antigo têm a marca dele, e appProperties só o app que gravou
 *   enxerga, então só o nome acha. `'me' in owners` deixa de fora pasta de outra pessoa com o mesmo nome.
 * Com `drive.file` o Google só mostra o que este app criou: as antigas não aparecem (sem erro).
 */
async function raizesExistentes(usuarioId: string, contaId: string): Promise<ArquivoDrive[]> {
  const campos = "id,name,createdTime,appProperties";
  const [marcadas, porNome] = await Promise.all([
    listarTudo(usuarioId, contaId, `appProperties has { key='sobedesce' and value='${MARCA_RAIZ}' } and mimeType = '${PASTA_MIME}' and trashed = false`, campos, {}, 1),
    listarTudo(usuarioId, contaId, `name = ${aspas(NOME_RAIZ)} and mimeType = '${PASTA_MIME}' and trashed = false and 'me' in owners`, campos, {}, 1),
  ]);
  const unicas = new Map<string, ArquivoDrive>();
  for (const f of [...marcadas, ...porNome]) unicas.set(f.id, f);
  return [...unicas.values()].sort((a, b) => String(a.createdTime ?? "").localeCompare(String(b.createdTime ?? "")));
}

/** Guarda a raiz achada na conta e põe a marca deste app nela (melhor esforço), para as próximas buscas. */
async function adotarRaiz(usuarioId: string, contaId: string, raiz: ArquivoDrive): Promise<void> {
  if (raiz.appProperties?.sobedesce !== MARCA_RAIZ) {
    await atualizarArquivo(usuarioId, contaId, raiz.id, { appProperties: { sobedesce: MARCA_RAIZ } }).catch(() => {});
  }
  await db.update(contasGoogle).set({ referenciasPastaId: raiz.id }).where(eq(contasGoogle.id, contaId));
}

/**
 * Pasta "SOBEDESCE Referências" deste Drive: a guardada (se ainda existe e não está na lixeira), a que já existe
 * (com a marca deste app ou, a da pessoa, pelo nome: a mais antiga) ou, só se não houver nenhuma, uma nova na raiz
 * do Meu Drive. Assim a raiz do app antigo é reaproveitada em vez de nascer outra vazia ao lado.
 */
export async function garantirRaiz(usuarioId: string, conta: { id: string; pasta: string | null }): Promise<string> {
  if (await guardadaValida(usuarioId, conta.id, conta.pasta)) return conta.pasta!;
  const [achada] = await raizesExistentes(usuarioId, conta.id);
  if (achada) {
    await adotarRaiz(usuarioId, conta.id, achada);
    return achada.id;
  }
  const id = (await criarPasta(usuarioId, conta.id, NOME_RAIZ, "root", MARCA_RAIZ)).id;
  await db.update(contasGoogle).set({ referenciasPastaId: id }).where(eq(contasGoogle.id, conta.id));
  return id;
}

/** Conferência das coleções no Drive: no máximo uma a cada 10 min por Drive (fora o conectar, que força). */
export const INTERVALO_CONFERENCIA_MS = 10 * 60_000;
/** Subpastas olhadas por conferência (somando os Drives). */
export const MAX_PASTAS_RECUPERAR = 200;

export type ResultadoRecuperar = { contas: number; criadas: number; falhas: number };

/**
 * Traz de volta as coleções que estão no Drive e não no banco (a linha some quando a conta Google sai: o Drive
 * desconectado na migração levou as coleções em cascata, mas as pastas ficaram). Idempotente.
 *
 * Para cada Drive da pessoa em estado ok (só `contaGoogleId`, se vier) e não conferido há 10 min (`forcar` ignora o
 * prazo): acha as raízes sem criar nenhuma, lista as subpastas diretas fora da lixeira e cria a linha das que faltam,
 * como `criarColecao`. Pula: pasta que já é coleção, pasta que a pessoa tirou da plataforma (referenciasIgnoradas),
 * nome que não serve e nome já usado por outra coleção da pessoa. Erro de um Drive fica no log e o próximo segue.
 */
export async function recuperarColecoes(usuarioId: string, o: { contaGoogleId?: string; forcar?: boolean } = {}): Promise<ResultadoRecuperar> {
  const agora = new Date();
  const condicoes: SQL[] = [eq(contasGoogle.usuarioId, usuarioId), eq(contasGoogle.estado, "ok")];
  if (o.contaGoogleId) condicoes.push(eq(contasGoogle.id, o.contaGoogleId));
  if (!o.forcar) {
    const prazo = new Date(agora.getTime() - INTERVALO_CONFERENCIA_MS);
    condicoes.push(or(isNull(contasGoogle.referenciasConferidasEm), lt(contasGoogle.referenciasConferidasEm, prazo))!);
  }
  // Carimba antes de olhar: dois pedidos ao mesmo tempo não conferem o mesmo Drive duas vezes.
  const contas = await db
    .update(contasGoogle)
    .set({ referenciasConferidasEm: agora })
    .where(and(...condicoes))
    .returning({ id: contasGoogle.id, pasta: contasGoogle.referenciasPastaId, ignoradas: contasGoogle.referenciasIgnoradas, criadoEm: contasGoogle.criadoEm });
  const r: ResultadoRecuperar = { contas: contas.length, criadas: 0, falhas: 0 };
  if (!contas.length) return r;
  contas.sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());

  const existentes = await db.select({ pasta: colecoes.driveFolderId, chave: colecoes.nomeChave }).from(colecoes).where(eq(colecoes.usuarioId, usuarioId));
  const pastas = new Set(existentes.map((e) => e.pasta));
  const chaves = new Set(existentes.map((e) => e.chave));
  let restam = MAX_PASTAS_RECUPERAR;

  for (const conta of contas) {
    if (restam <= 0) break;
    try {
      const raizes = await raizesExistentes(usuarioId, conta.id);
      if (conta.pasta && !raizes.some((f) => f.id === conta.pasta) && (await guardadaValida(usuarioId, conta.id, conta.pasta))) {
        raizes.unshift({ id: conta.pasta, name: NOME_RAIZ, mimeType: PASTA_MIME, appProperties: { sobedesce: MARCA_RAIZ } });
      }
      if (!raizes.length) continue;
      // A primeira coleção nova deste Drive vai para a raiz que já existe, não para uma nova.
      if (!conta.pasta || !raizes.some((f) => f.id === conta.pasta)) await adotarRaiz(usuarioId, conta.id, raizes[0]);
      const ignoradas = new Set(conta.ignoradas ?? []);
      for (const raiz of raizes) {
        if (restam <= 0) break;
        const subpastas = await listarTudo(usuarioId, conta.id, `${aspas(raiz.id)} in parents and mimeType = '${PASTA_MIME}' and trashed = false`, "id,name,createdTime", {}, 1);
        subpastas.sort((a, b) => String(a.createdTime ?? "").localeCompare(String(b.createdTime ?? "")));
        for (const f of subpastas) {
          if (restam <= 0) break;
          restam--;
          if (pastas.has(f.id) || ignoradas.has(f.id)) continue;
          const v = validarNome(f.name);
          if (!v.ok) continue;
          const chave = chaveNome(v.nome);
          if (chaves.has(chave)) continue;
          const criada = f.createdTime ? new Date(f.createdTime) : agora;
          const inserida = await db
            .insert(colecoes)
            .values({
              id: novoId(),
              usuarioId,
              contaGoogleId: conta.id,
              driveFolderId: f.id,
              nome: v.nome,
              nomeChave: chave,
              criadoEm: Number.isNaN(criada.getTime()) ? agora : criada,
              atualizadoEm: agora,
            })
            .onConflictDoNothing()
            .returning({ id: colecoes.id });
          pastas.add(f.id);
          chaves.add(chave);
          if (inserida.length) r.criadas++;
        }
      }
    } catch (e) {
      r.falhas++;
      console.warn(`[referencias] conferir as coleções de um Drive falhou: ${e instanceof Error ? e.message : "erro"}`);
    }
  }
  return r;
}

/**
 * Ao listar: confere (no prazo de 10 min por Drive) e espera até `prazoMs`. Drive lento: a resposta sai com o que já
 * há e a conferência termina depois dela (as coleções aparecem na próxima vez que a lista abrir).
 */
export async function recuperarAoListar(usuarioId: string, prazoMs = 8_000, depois: Depois = depoisDaResposta): Promise<void> {
  const tarefa = recuperarColecoes(usuarioId).catch((e) => {
    console.warn(`[referencias] conferir as coleções falhou: ${e instanceof Error ? e.message : "erro"}`);
  });
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const acabou = await Promise.race([tarefa.then(() => true), new Promise<boolean>((ok) => (relogio = setTimeout(() => ok(false), prazoMs)))]);
  clearTimeout(relogio);
  if (!acabou) depois(() => tarefa);
}

async function nomeOcupado(usuarioId: string, nome: string, menos?: string): Promise<boolean> {
  const [l] = await db
    .select({ id: colecoes.id })
    .from(colecoes)
    .where(and(eq(colecoes.usuarioId, usuarioId), eq(colecoes.nomeChave, chaveNome(nome))))
    .limit(1);
  return Boolean(l && l.id !== menos);
}

const DUPLICADA = () => new ErroColecao("duplicada", 409, "Você já tem uma coleção com esse nome.");

/** Cria a coleção: pasta no Drive (ou aproveita uma pasta com o mesmo nome dentro da raiz) e a linha no banco. */
export async function criarColecao(usuarioId: string, nome: string, contaGoogleId?: string): Promise<Linha> {
  if (await nomeOcupado(usuarioId, nome)) throw DUPLICADA();
  const conta = await contaPara(usuarioId, contaGoogleId);
  const raiz = await garantirRaiz(usuarioId, conta);
  const existentes = await listarTudo(usuarioId, conta.id, `${aspas(raiz)} in parents and name = ${aspas(nome)} and mimeType = '${PASTA_MIME}' and trashed = false`, "id,name", {}, 1);
  const existente = existentes.find((f) => f.name === nome);
  const pasta = existente ?? (await criarPasta(usuarioId, conta.id, nome, raiz, MARCA_COLECAO));
  const agora = new Date();
  const inserida = await db
    .insert(colecoes)
    .values({ id: novoId(), usuarioId, contaGoogleId: conta.id, driveFolderId: pasta.id, nome, nomeChave: chaveNome(nome), criadoEm: agora, atualizadoEm: agora })
    .onConflictDoNothing()
    .returning();
  if (!inserida.length) {
    // Duas criações com o mesmo nome ao mesmo tempo: a segunda desfaz a pasta que acabou de criar.
    if (!existente) await atualizarArquivo(usuarioId, conta.id, pasta.id, { trashed: true }).catch(() => {});
    throw DUPLICADA();
  }
  // Pasta que a pessoa tinha tirado da plataforma e agora voltou a ser coleção: sai da lista de ignoradas.
  if (existente) await mudarIgnorada(usuarioId, conta.id, pasta.id, false);
  return inserida[0];
}

/** Põe (ou tira) uma pasta da lista das que a conferência (recuperarColecoes) não traz de volta. */
async function mudarIgnorada(usuarioId: string, contaGoogleId: string, pasta: string, ignorar: boolean): Promise<void> {
  const sem = sql`array_remove(${contasGoogle.referenciasIgnoradas}, ${pasta}::text)`;
  await db
    .update(contasGoogle)
    .set({ referenciasIgnoradas: ignorar ? sql`array_append(${sem}, ${pasta}::text)` : sem })
    .where(and(eq(contasGoogle.id, contaGoogleId), eq(contasGoogle.usuarioId, usuarioId)));
}

/** Novo nome (no banco e na pasta do Drive). Pasta apagada no Drive não impede. */
export async function renomearColecao(usuarioId: string, l: Linha, nome: string): Promise<Linha> {
  if (nome === l.nome) return l;
  if (await nomeOcupado(usuarioId, nome, l.id)) throw DUPLICADA();
  try {
    await atualizarArquivo(usuarioId, l.contaGoogleId, l.driveFolderId, { name: nome });
  } catch (e) {
    if (!(e instanceof ErroDrive && e.status === 404)) throw e;
  }
  const [nova] = await db
    .update(colecoes)
    .set({ nome, nomeChave: chaveNome(nome), atualizadoEm: new Date() })
    .where(and(eq(colecoes.id, l.id), eq(colecoes.usuarioId, usuarioId)))
    .returning();
  if (!nova) throw DUPLICADA();
  return nova;
}

/** Link pra IA: ligar (mantém o que já existe), trocar (endereço novo, o velho para de abrir) ou desligar. */
export async function mudarLink(usuarioId: string, l: Linha, acao: "ligar" | "desligar" | "trocar"): Promise<Linha> {
  const token = acao === "desligar" ? null : acao === "ligar" && l.publicaToken ? l.publicaToken : novoTokenPublico();
  const [nova] = await db
    .update(colecoes)
    .set({ publicaToken: token, atualizadoEm: new Date() })
    .where(and(eq(colecoes.id, l.id), eq(colecoes.usuarioId, usuarioId)))
    .returning();
  return nova ?? l;
}

/** Tira a coleção da plataforma. Com `noDrive`, põe a pasta na lixeira do Drive antes (pasta que já sumiu não impede). */
export async function apagarColecao(usuarioId: string, l: Linha, noDrive: boolean): Promise<void> {
  if (noDrive) {
    try {
      await atualizarArquivo(usuarioId, l.contaGoogleId, l.driveFolderId, { trashed: true });
    } catch (e) {
      if (!(e instanceof ErroDrive && e.status === 404)) throw e;
    }
  }
  await db.delete(colecoes).where(and(eq(colecoes.id, l.id), eq(colecoes.usuarioId, usuarioId)));
  // A pasta fica no Drive: a conferência não pode trazer de volta o que a pessoa tirou.
  if (!noDrive) await mudarIgnorada(usuarioId, l.contaGoogleId, l.driveFolderId, true);
}

/** Coleção do link pra IA (só se o link estiver ligado), com o primeiro nome do dono. */
export async function colecaoPublica(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [l] = await db
    .select({ colecao: colecoes, nomeDono: schema.usuarios.nome })
    .from(colecoes)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, colecoes.usuarioId))
    .where(and(isNotNull(colecoes.publicaToken), eq(colecoes.publicaToken, token)))
    .limit(1);
  return l ?? null;
}
