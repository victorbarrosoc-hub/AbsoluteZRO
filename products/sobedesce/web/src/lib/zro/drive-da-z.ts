/**
 * O Drive da pessoa para a Z (pedidos do HUB, lib/zro/pedido.ts). Só leitura e só metadados: nome, tipo, datas,
 * tamanho, resolução e duração quando o Google informa, link para abrir e link para baixar. Nada é guardado; nenhum
 * byte de arquivo passa por aqui (o link de baixar leva direto ao Google, com o login da pessoa).
 *
 * - Usa todos os Drives conectados que estão ok (até 3), com a mesma renovação de token do resto do site.
 * - Termos sempre escapados (aspas e barra invertida) antes de entrar na `q` do Drive.
 * - Busca: a ordem é a do Google (relevância); o Drive não aceita orderBy junto de fullText.
 * - Pasta: pelo id ou pelo nome. Nome que bate em várias pastas devolve as opções (a Z pergunta qual).
 * - O nome da pasta de cada arquivo da busca não vem: custaria uma chamada a mais por arquivo.
 * Versão pronta e pedido ao computador (o que muda algo): lib/zro/computador-da-z.ts.
 */
import { listarContas, type Conta } from "@/lib/google/contas";
import { aspas, chamarDrive, ErroDrive, PASTA_MIME } from "@/lib/google/drive";

/** `zro_pedido` do JWT do HUB para cada ação. */
export const ACAO_BUSCA = "drive.buscar";
export const ACAO_PASTA = "drive.pasta";
export const TERMO_MAX = 200;
export const POR_BUSCA = 10;
export const POR_PASTA = 25;
const MAX_CONTAS = 3;
export const CAMPOS_ARQUIVO =
  "id,name,mimeType,createdTime,modifiedTime,size,webViewLink,webContentLink,iconLink,videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height)";

export const ORDENS = { mais_antigo: "createdTime", mais_recente: "createdTime desc", nome: "folder,name" } as const;
export type Ordem = keyof typeof ORDENS;

export type ArquivoAchado = {
  id: string;
  nome: string;
  tipo: string;
  pasta: boolean;
  criado: string | null;
  modificado: string | null;
  /** Bytes (o Google não informa para Docs, Planilhas e pastas). */
  tamanho: number | null;
  video: { largura: number | null; altura: number | null; duracao_s: number | null } | null;
  imagem: { largura: number | null; altura: number | null } | null;
  link: string | null;
  link_download: string | null;
  icone: string | null;
};
export type PastaAchada = { id: string; nome: string; link: string | null; modificado: string | null };

export type FalhaDrive = { ok: false; erro: "sem_drive" | "reconectar_drive" | "drive_indisponivel" };
export type ResultadoBusca = { ok: true; arquivos: ArquivoAchado[]; incompleta: boolean } | FalhaDrive;
export type ResultadoPasta =
  | { ok: true; tipo: "conteudo"; pasta: PastaAchada; ordem: Ordem; arquivos: ArquivoAchado[]; mais: boolean }
  | { ok: true; tipo: "escolher"; pastas: PastaAchada[] }
  | { ok: true; tipo: "nao_achou" }
  | FalhaDrive;

/** A consulta do Drive v3 da busca (exportada para os testes). */
export function consultaDoTermo(termo: string): string {
  const t = aspas(termo);
  return `(name contains ${t} or fullText contains ${t}) and trashed = false`;
}

export function consultaDePasta(nome: string): string {
  return `mimeType = ${aspas(PASTA_MIME)} and name contains ${aspas(nome)} and trashed = false`;
}

export function consultaDoConteudo(pastaId: string): string {
  return `${aspas(pastaId)} in parents and trashed = false`;
}

export type FileDrive = Record<string, unknown> & {
  videoMediaMetadata?: { width?: unknown; height?: unknown; durationMillis?: unknown };
  imageMediaMetadata?: { width?: unknown; height?: unknown };
};

const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
const https = (v: unknown) => {
  const s = texto(v);
  return s && /^https:\/\//.test(s) ? s : null;
};
const numero = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Só os campos combinados, mesmo que o Google mande mais. */
export function soMetadados(f: FileDrive): ArquivoAchado | null {
  const id = texto(f.id);
  const nome = texto(f.name);
  if (!id || !nome) return null;
  const tipo = texto(f.mimeType) ?? "application/octet-stream";
  const v = f.videoMediaMetadata;
  const i = f.imageMediaMetadata;
  const ms = numero(v?.durationMillis);
  return {
    id,
    nome,
    tipo,
    pasta: tipo === PASTA_MIME,
    criado: texto(f.createdTime),
    modificado: texto(f.modifiedTime),
    tamanho: numero(f.size),
    video: v ? { largura: numero(v.width), altura: numero(v.height), duracao_s: ms === null ? null : Math.round(ms / 1000) } : null,
    imagem: i ? { largura: numero(i.width), altura: numero(i.height) } : null,
    link: https(f.webViewLink),
    link_download: https(f.webContentLink),
    icone: https(f.iconLink),
  };
}

const pastaDe = (f: FileDrive): PastaAchada | null => {
  const id = texto(f.id);
  const nome = texto(f.name);
  return id && nome ? { id, nome, link: https(f.webViewLink), modificado: texto(f.modifiedTime) } : null;
};

/** As contas Google prontas, ou a falha (nenhuma conectada, todas pedindo reconectar). */
export async function contasProntas(usuarioId: string): Promise<Conta[] | FalhaDrive> {
  const contas = await listarContas(usuarioId);
  if (!contas.length) return { ok: false, erro: "sem_drive" };
  const prontas = contas.filter((c) => c.estado === "ok").slice(0, MAX_CONTAS);
  return prontas.length ? prontas : { ok: false, erro: "reconectar_drive" };
}

export function falhaDe(motivos: unknown[]): FalhaDrive {
  return { ok: false, erro: motivos.some((m) => (m as { codigo?: string } | null)?.codigo === "reconectar") ? "reconectar_drive" : "drive_indisponivel" };
}

type Lista = { files?: FileDrive[]; nextPageToken?: string };
const listar = (usuarioId: string, contaId: string, query: Record<string, string | number | boolean>) =>
  chamarDrive<Lista>(usuarioId, contaId, "/files", { query: { corpora: "allDrives", includeItemsFromAllDrives: true, spaces: "drive", ...query } });

/** Em cada Drive pronto; `null` onde falhou. Todas falharam: a falha. */
async function emCadaDrive(usuarioId: string, fazer: (c: Conta) => Promise<Lista>): Promise<{ conta: Conta; lista: Lista | null }[] | FalhaDrive> {
  const contas = await contasProntas(usuarioId);
  if (!Array.isArray(contas)) return contas;
  const r = await Promise.allSettled(contas.map(fazer));
  if (r.every((x) => x.status === "rejected")) return falhaDe(r.map((x) => (x as PromiseRejectedResult).reason));
  return r.map((x, i) => ({ conta: contas[i], lista: x.status === "fulfilled" ? (x.value ?? {}) : null }));
}

/** Intercala as listas (o primeiro de cada uma antes), sem repetir id, até `max`. */
function intercalar<T extends { id: string }>(listas: T[][], max: number): T[] {
  const out: T[] = [];
  const vistos = new Set<string>();
  for (let i = 0; out.length < max && listas.some((l) => i < l.length); i++) {
    for (const l of listas) {
      const f = l[i];
      if (f && !vistos.has(f.id) && out.length < max) {
        vistos.add(f.id);
        out.push(f);
      }
    }
  }
  return out;
}

export async function buscarNoDrive(usuarioId: string, termo: string): Promise<ResultadoBusca> {
  const q = consultaDoTermo(termo);
  const r = await emCadaDrive(usuarioId, (c) => listar(usuarioId, c.id, { q, fields: `files(${CAMPOS_ARQUIVO})`, pageSize: POR_BUSCA }));
  if (!Array.isArray(r)) return r;
  const listas = r.map((x) => (x.lista?.files ?? []).map(soMetadados).filter((f): f is ArquivoAchado => !!f));
  return { ok: true, arquivos: intercalar(listas, POR_BUSCA), incompleta: r.some((x) => !x.lista) };
}

/** Um id do Drive (letras, números, - e _, com algum número); um nome assim também cai na busca por nome se o id não existir. */
const PARECE_ID = /^(?=.*\d)[A-Za-z0-9_-]{10,}$/;

/** A pasta pelo id, no Drive que a tiver. */
async function pastaPeloId(usuarioId: string, contas: Conta[], id: string): Promise<{ conta: Conta; pasta: PastaAchada } | null> {
  for (const conta of contas) {
    try {
      const f = await chamarDrive<FileDrive>(usuarioId, conta.id, `/files/${encodeURIComponent(id)}`, { query: { fields: "id,name,mimeType,trashed,webViewLink,modifiedTime" } });
      const p = f && f.mimeType === PASTA_MIME && f.trashed !== true ? pastaDe(f) : null;
      if (p) return { conta, pasta: p };
    } catch (e) {
      if (!(e instanceof ErroDrive && (e.status === 404 || e.status === 400))) throw e;
    }
  }
  return null;
}

/**
 * O conteúdo de uma pasta, pelo id ou pelo nome. Nome: o nome exato (sem diferenciar maiúsculas) ganha; sobrando
 * mais de uma, devolve as opções. `mais`: a pasta tem mais itens que os POR_PASTA devolvidos.
 */
export async function listarPasta(usuarioId: string, pedido: string, ordem: Ordem): Promise<ResultadoPasta> {
  const contas = await contasProntas(usuarioId);
  if (!Array.isArray(contas)) return contas;
  let alvo: { conta: Conta; pasta: PastaAchada } | null = null;
  try {
    if (PARECE_ID.test(pedido)) alvo = await pastaPeloId(usuarioId, contas, pedido);
  } catch (e) {
    return falhaDe([e]);
  }
  if (!alvo) {
    const q = consultaDePasta(pedido);
    const r = await emCadaDrive(usuarioId, (c) => listar(usuarioId, c.id, { q, fields: "files(id,name,mimeType,webViewLink,modifiedTime)", pageSize: 10 }));
    if (!Array.isArray(r)) return r;
    const achadas = r.flatMap((x) => (x.lista?.files ?? []).map((f) => ({ conta: x.conta, pasta: pastaDe(f) })).filter((a): a is { conta: Conta; pasta: PastaAchada } => !!a.pasta));
    if (!achadas.length) return { ok: true, tipo: "nao_achou" };
    const exatas = achadas.filter((a) => a.pasta.nome.trim().toLowerCase() === pedido.trim().toLowerCase());
    const candidatas = exatas.length ? exatas : achadas;
    if (candidatas.length > 1) return { ok: true, tipo: "escolher", pastas: candidatas.slice(0, 10).map((a) => a.pasta) };
    alvo = candidatas[0];
  }
  try {
    const l = await listar(usuarioId, alvo.conta.id, {
      q: consultaDoConteudo(alvo.pasta.id),
      fields: `nextPageToken,files(${CAMPOS_ARQUIVO})`,
      pageSize: POR_PASTA,
      orderBy: ORDENS[ordem],
    });
    const arquivos = (l?.files ?? []).map(soMetadados).filter((f): f is ArquivoAchado => !!f);
    return { ok: true, tipo: "conteudo", pasta: alvo.pasta, ordem, arquivos, mais: !!l?.nextPageToken };
  } catch (e) {
    return falhaDe([e]);
  }
}
