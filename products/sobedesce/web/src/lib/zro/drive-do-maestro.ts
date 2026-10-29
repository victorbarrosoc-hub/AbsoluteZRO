/**
 * O Maestro no Drive da pessoa (Maestro v2, fases 7–10), pela ponte do HUB: o servidor do Maestro pede ao HUB um
 * pedido assinado (`zro-pedido+jwt`, lib/zro/pedido.ts) e chama estas ações. Contrato em
 * docs/integration-contracts/maestro-sobedesce.md (raiz do monorepo); schemas em packages/media-contracts/src/ponte.ts.
 *
 * - `drive.listar`: uma página de uma pasta (ou de Meu Drive, ou uma busca por nome), só metadados e o link curto da
 *   miniatura do Google.
 * - `drive.miniatura`: o link curto da miniatura de um arquivo (o `<img>` busca no Google; nada passa por aqui).
 * - `drive.pasta.criar`: a árvore `Maestro/<Cliente>/<Projeto>/{01 Briefing … 05 Entregas}`, idempotente (acha antes de
 *   criar; nomes limpos por `nomeDePasta`).
 * - `drive.compartilhar_revisao` / `drive.recolher_revisao`: liga "qualquer pessoa com o link" (leitor, sem aparecer em
 *   busca) no arquivo da versão enquanto o link do cliente vale e desliga depois. Recolher só apaga a permissão
 *   `anyone` que o Maestro criou (o id vem da resposta do compartilhar); nunca mexe em outra.
 * - `drive.token`: o access token curto de uma conta Google da própria pessoa (nunca o refresh), para o Maestro navegar
 *   e tocar direto do navegador. O Maestro não guarda (só a memória da aba).
 * Nenhum byte de arquivo passa por aqui.
 */
import { ErroConta, tokenDeAcesso, type Conta } from "@/lib/google/contas";
import { aspas, chamarDrive, ErroDrive, PASTA_MIME } from "@/lib/google/drive";
import { contasProntas, falhaDe, linkNoSobedesce, type FalhaDrive } from "./drive-da-z";

export const ACAO_LISTAR = "drive.listar";
export const ACAO_MINIATURA = "drive.miniatura";
export const ACAO_PASTA_CRIAR = "drive.pasta.criar";
export const ACAO_COMPARTILHAR = "drive.compartilhar_revisao";
export const ACAO_RECOLHER = "drive.recolher_revisao";
export const ACAO_TOKEN = "drive.token";

export const POR_PAGINA = 50;
export const ESTRUTURA = ["01 Briefing", "02 Bruto", "03 Edição", "04 Revisão", "05 Entregas"] as const;
export const RAIZ_MAESTRO = "Maestro";
/** Miniatura da grade: 400 px (o Google aceita =s<px>). */
export const PX_PADRAO = 400;

export const ID_DRIVE = /^[A-Za-z0-9_-]{1,200}$/;
const ID_PERMISSAO = /^[A-Za-z0-9_-]{1,200}$/;

type FileDrive = {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  thumbnailLink?: string;
  resourceKey?: string;
  trashed?: boolean;
  capabilities?: { canShare?: boolean };
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
};

export type ItemDrive = {
  id: string;
  nome: string;
  tipo: string;
  pasta: boolean;
  modificado: string | null;
  tamanho: number | null;
  miniatura: string | null;
  video: { largura: number | null; altura: number | null; duracao_ms: number | null } | null;
  abrir_no_sobedesce: string | null;
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** O link de miniatura do Google no tamanho pedido (troca o `=s220` do fim). Só https do Google; senão null. */
export function miniaturaNoTamanho(link: unknown, px = PX_PADRAO): string | null {
  if (typeof link !== "string" || !/^https:\/\/[a-z0-9.-]+\.(googleusercontent|google)\.com\//.test(link)) return null;
  const n = Math.max(64, Math.min(1600, Math.round(px)));
  return /=s\d+(-[\w-]+)?$/.test(link) ? link.replace(/=s\d+(-[\w-]+)?$/, `=s${n}`) : link;
}

export function itemDoDrive(f: FileDrive, px = PX_PADRAO): ItemDrive | null {
  if (!f.id || !ID_DRIVE.test(f.id) || !f.name) return null;
  const tipo = f.mimeType || "application/octet-stream";
  const pasta = tipo === PASTA_MIME;
  const v = f.videoMediaMetadata;
  return {
    id: f.id,
    nome: f.name,
    tipo,
    pasta,
    modificado: f.modifiedTime ?? null,
    tamanho: num(f.size),
    miniatura: miniaturaNoTamanho(f.thumbnailLink, px),
    video: v ? { largura: num(v.width), altura: num(v.height), duracao_ms: num(v.durationMillis) } : null,
    abrir_no_sobedesce: linkNoSobedesce(f.id, pasta ? "pasta" : "abrir"),
  };
}

/**
 * Nome de pasta seguro a partir do que a produtora digitou: sem controle, sem barra, espaços juntados, até 120.
 * Vazio depois de limpo: null (a rota responde 400).
 */
export function nomeDePasta(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const t = bruto
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "")
    .slice(0, 120)
    .trim();
  return t || null;
}

type ContaPronta = Conta;

async function escolherConta(usuarioId: string, contaId?: unknown): Promise<ContaPronta | FalhaDrive | { ok: false; erro: "conta_desconhecida" }> {
  const contas = await contasProntas(usuarioId);
  if (!Array.isArray(contas)) return contas;
  if (contaId === undefined || contaId === null) return contas[0];
  return contas.find((c) => c.id === contaId) ?? { ok: false, erro: "conta_desconhecida" };
}

/** A conta que enxerga o arquivo (a primeira, entre as prontas) e os campos pedidos. */
async function acharArquivo(usuarioId: string, arquivoId: string, campos: string): Promise<{ conta: Conta; arquivo: FileDrive } | FalhaDrive | null> {
  const contas = await contasProntas(usuarioId);
  if (!Array.isArray(contas)) return contas;
  const motivos: unknown[] = [];
  for (const conta of contas) {
    try {
      const f = await chamarDrive<FileDrive>(usuarioId, conta.id, `/files/${encodeURIComponent(arquivoId)}`, { query: { fields: campos } });
      if (f && f.trashed !== true) return { conta, arquivo: f };
    } catch (e) {
      if (e instanceof ErroDrive && (e.status === 404 || e.status === 403 || e.status === 400)) continue;
      motivos.push(e);
    }
  }
  return motivos.length === contas.length ? falhaDe(motivos) : null;
}

// ───── drive.listar ─────

export type ResultadoListar =
  | { ok: true; conta: { id: string; email: string }; pasta: { id: string; nome: string } | null; itens: ItemDrive[]; proxima: string | null }
  | FalhaDrive
  | { ok: false; erro: "conta_desconhecida" | "nao_achou" };

export async function listarParaMaestro(usuarioId: string, e: { pasta?: string | null; busca?: string | null; pagina?: string | null; conta?: string | null }): Promise<ResultadoListar> {
  const conta = await escolherConta(usuarioId, e.conta ?? undefined);
  if ("ok" in conta) return conta;
  const raiz = !e.pasta || e.pasta === "root";
  const partes = ["trashed = false"];
  if (e.busca) partes.push(`name contains ${aspas(e.busca)}`);
  if (!raiz) partes.push(`${aspas(e.pasta!)} in parents`);
  else if (!e.busca) partes.push("'root' in parents");
  try {
    let pasta: { id: string; nome: string } | null = null;
    if (!raiz) {
      const f = await chamarDrive<FileDrive>(usuarioId, conta.id, `/files/${encodeURIComponent(e.pasta!)}`, { query: { fields: "id,name,mimeType,trashed" } });
      if (!f?.id || f.mimeType !== PASTA_MIME || f.trashed) return { ok: false, erro: "nao_achou" };
      pasta = { id: f.id, nome: f.name ?? "Pasta" };
    }
    const r = await chamarDrive<{ files?: FileDrive[]; nextPageToken?: string }>(usuarioId, conta.id, "/files", {
      query: {
        q: partes.join(" and "),
        fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,thumbnailLink,videoMediaMetadata(width,height,durationMillis))",
        pageSize: POR_PAGINA,
        pageToken: e.pagina ?? undefined,
        orderBy: e.busca ? undefined : "folder,name_natural",
        includeItemsFromAllDrives: true,
        corpora: e.busca ? "allDrives" : undefined,
      },
    });
    const itens = (r?.files ?? []).map((f) => itemDoDrive(f)).filter((i): i is ItemDrive => !!i);
    return { ok: true, conta: { id: conta.id, email: conta.email }, pasta, itens, proxima: r?.nextPageToken ?? null };
  } catch (err) {
    if (err instanceof ErroDrive && (err.status === 404 || err.status === 403)) return { ok: false, erro: "nao_achou" };
    return falhaDe([err]);
  }
}

// ───── drive.miniatura ─────

export async function miniaturaParaMaestro(usuarioId: string, arquivoId: string, px = PX_PADRAO): Promise<{ ok: true; url: string; expira_em: string } | FalhaDrive | { ok: false; erro: "nao_achou" | "sem_miniatura" }> {
  const r = await acharArquivo(usuarioId, arquivoId, "id,thumbnailLink,trashed");
  if (!r) return { ok: false, erro: "nao_achou" };
  if ("ok" in r) return r;
  const url = miniaturaNoTamanho(r.arquivo.thumbnailLink, px);
  if (!url) return { ok: false, erro: "sem_miniatura" };
  // O Google não diz a validade do thumbnailLink; na prática são algumas horas. O Maestro pede de novo depois de 1 h.
  return { ok: true, url, expira_em: new Date(Date.now() + 60 * 60_000).toISOString() };
}

// ───── drive.pasta.criar ─────

async function acharOuCriarPasta(usuarioId: string, contaId: string, pai: string, nome: string): Promise<{ id: string; nome: string; criada: boolean }> {
  const r = await chamarDrive<{ files?: FileDrive[] }>(usuarioId, contaId, "/files", {
    query: {
      q: `name = ${aspas(nome)} and mimeType = ${aspas(PASTA_MIME)} and ${aspas(pai)} in parents and trashed = false`,
      fields: "files(id,name)",
      pageSize: 1,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
    },
  });
  const achada = r?.files?.[0];
  if (achada?.id) return { id: achada.id, nome: achada.name ?? nome, criada: false };
  const nova = await chamarDrive<FileDrive>(usuarioId, contaId, "/files", {
    method: "POST",
    query: { fields: "id,name" },
    body: { name: nome, mimeType: PASTA_MIME, parents: [pai], appProperties: { maestro: "estrutura" } },
  });
  if (!nova?.id) throw new ErroDrive(502, "sem_id");
  return { id: nova.id, nome: nova.name ?? nome, criada: true };
}

export type ResultadoPastaCriar =
  | { ok: true; pasta: { id: string; nome: string; abrir_no_sobedesce: string | null }; subpastas: { id: string; nome: string }[]; criadas: number }
  | FalhaDrive
  | { ok: false; erro: "conta_desconhecida" | "nao_achou" | "sem_permissao" };

export async function criarEstruturaDoProjeto(
  usuarioId: string,
  e: { cliente: string; projeto: string; raiz?: string | null; conta?: string | null },
): Promise<ResultadoPastaCriar> {
  const conta = await escolherConta(usuarioId, e.conta ?? undefined);
  if ("ok" in conta) return conta;
  try {
    let base = "root";
    if (e.raiz) {
      const f = await chamarDrive<FileDrive>(usuarioId, conta.id, `/files/${encodeURIComponent(e.raiz)}`, { query: { fields: "id,mimeType,trashed" } });
      if (!f?.id || f.mimeType !== PASTA_MIME || f.trashed) return { ok: false, erro: "nao_achou" };
      base = f.id;
    }
    let criadas = 0;
    const passo = async (pai: string, nome: string) => {
      const p = await acharOuCriarPasta(usuarioId, conta.id, pai, nome);
      if (p.criada) criadas++;
      return p;
    };
    const maestro = await passo(base, RAIZ_MAESTRO);
    const cliente = await passo(maestro.id, e.cliente);
    const projeto = await passo(cliente.id, e.projeto);
    const subpastas: { id: string; nome: string }[] = [];
    for (const nome of ESTRUTURA) {
      const s = await passo(projeto.id, nome);
      subpastas.push({ id: s.id, nome: s.nome });
    }
    return { ok: true, pasta: { id: projeto.id, nome: projeto.nome, abrir_no_sobedesce: linkNoSobedesce(projeto.id, "pasta") }, subpastas, criadas };
  } catch (err) {
    if (err instanceof ErroDrive && err.status === 404) return { ok: false, erro: "nao_achou" };
    if (err instanceof ErroDrive && err.status === 403) return { ok: false, erro: "sem_permissao" };
    return falhaDe([err]);
  }
}

// ───── drive.compartilhar_revisao / drive.recolher_revisao ─────

type Permissao = { id?: string; type?: string; role?: string };

export type ResultadoCompartilhar =
  | { ok: true; arquivoId: string; permissao_id: string | null; ja_publico: boolean; resource_key: string | null }
  | FalhaDrive
  | { ok: false; erro: "nao_achou" | "sem_permissao" };

export async function compartilharParaRevisao(usuarioId: string, arquivoId: string): Promise<ResultadoCompartilhar> {
  const r = await acharArquivo(usuarioId, arquivoId, "id,mimeType,resourceKey,trashed,capabilities(canShare)");
  if (!r) return { ok: false, erro: "nao_achou" };
  if ("ok" in r) return r;
  const { conta, arquivo } = r;
  if (arquivo.mimeType === PASTA_MIME) return { ok: false, erro: "nao_achou" };
  const base = `/files/${encodeURIComponent(arquivoId)}/permissions`;
  try {
    const lista = await chamarDrive<{ permissions?: Permissao[] }>(usuarioId, conta.id, base, { query: { fields: "permissions(id,type,role)" } });
    const resourceKey = typeof arquivo.resourceKey === "string" && arquivo.resourceKey ? arquivo.resourceKey : null;
    if ((lista?.permissions ?? []).some((p) => p.type === "anyone")) return { ok: true, arquivoId, permissao_id: null, ja_publico: true, resource_key: resourceKey };
    if (arquivo.capabilities?.canShare === false) return { ok: false, erro: "sem_permissao" };
    const p = await chamarDrive<Permissao>(usuarioId, conta.id, base, {
      method: "POST",
      query: { fields: "id,type,role" },
      body: { type: "anyone", role: "reader", allowFileDiscovery: false },
    });
    if (!p?.id || !ID_PERMISSAO.test(p.id)) throw new ErroDrive(502, "sem_id");
    return { ok: true, arquivoId, permissao_id: p.id, ja_publico: false, resource_key: resourceKey };
  } catch (err) {
    if (err instanceof ErroDrive && err.status === 403) return { ok: false, erro: "sem_permissao" };
    if (err instanceof ErroDrive && err.status === 404) return { ok: false, erro: "nao_achou" };
    return falhaDe([err]);
  }
}

export type ResultadoRecolher = { ok: true; recolhido: true; ja_nao_havia: boolean } | FalhaDrive | { ok: false; erro: "nao_e_publico" | "sem_permissao" };

export async function recolherDaRevisao(usuarioId: string, arquivoId: string, permissaoId: string): Promise<ResultadoRecolher> {
  if (!ID_PERMISSAO.test(permissaoId)) return { ok: false, erro: "nao_e_publico" };
  const r = await acharArquivo(usuarioId, arquivoId, "id,trashed");
  // Arquivo que sumiu (apagado, sem acesso): não há o que recolher.
  if (!r) return { ok: true, recolhido: true, ja_nao_havia: true };
  if ("ok" in r) return r;
  const caminho = `/files/${encodeURIComponent(arquivoId)}/permissions/${encodeURIComponent(permissaoId)}`;
  try {
    const p = await chamarDrive<Permissao>(usuarioId, r.conta.id, caminho, { query: { fields: "id,type,role" } });
    // Só a permissão "qualquer pessoa" que o Maestro criou; nunca a de uma pessoa ou de um domínio.
    if (p?.type !== "anyone") return { ok: false, erro: "nao_e_publico" };
    await chamarDrive(usuarioId, r.conta.id, caminho, { method: "DELETE" });
    return { ok: true, recolhido: true, ja_nao_havia: false };
  } catch (err) {
    if (err instanceof ErroDrive && err.status === 404) return { ok: true, recolhido: true, ja_nao_havia: true };
    if (err instanceof ErroDrive && err.status === 403) return { ok: false, erro: "sem_permissao" };
    return falhaDe([err]);
  }
}

// ───── drive.token ─────

export type ResultadoToken =
  | { ok: true; access_token: string; expira_em: string; conta: { id: string; email: string }; contas: { id: string; email: string }[] }
  | FalhaDrive
  | { ok: false; erro: "conta_desconhecida" };

export async function tokenParaMaestro(usuarioId: string, contaId?: string | null): Promise<ResultadoToken> {
  const todas = await contasProntas(usuarioId);
  if (!Array.isArray(todas)) return todas;
  const conta = contaId ? todas.find((c) => c.id === contaId) : todas[0];
  if (!conta) return { ok: false, erro: "conta_desconhecida" };
  try {
    const t = await tokenDeAcesso(usuarioId, conta.id);
    return {
      ok: true,
      access_token: t.accessToken,
      expira_em: new Date(t.expiraEm).toISOString(),
      conta: { id: conta.id, email: conta.email },
      contas: todas.map((c) => ({ id: c.id, email: c.email })),
    };
  } catch (err) {
    if (err instanceof ErroConta && err.codigo === "reconectar") return { ok: false, erro: "reconectar_drive" };
    return { ok: false, erro: "drive_indisponivel" };
  }
}
