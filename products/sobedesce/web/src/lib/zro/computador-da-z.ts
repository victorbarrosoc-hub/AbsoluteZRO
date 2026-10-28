/**
 * A Z e o computador da pessoa (27/10/2026). Quando pedem um arquivo em outro formato (ex.: "MP4 720p"):
 *
 * 1. `procurarVersao` (só lê): a versão pedida já existe no Drive? Olha o próprio arquivo, a pasta dele e os arquivos
 *    com o mesmo nome (os convertidos pelo computador ficam ao lado do original, "<nome> (MP4 720p).mp4"). Devolve o
 *    que achou e como estão os computadores da conta, para a Z oferecer com honestidade.
 * 2. `pedirAoComputador` (muda algo, só depois do "sim" da pessoa, conferido no HUB): cria o MESMO pedido do "Baixar
 *    como…" do celular (pedidos_proxy, tipo "formato", lib/proxies/pedidos.ts). O app do computador pega, converte com
 *    o ffmpeg dele e sobe o convertido ao lado do original (src/referencias/pedidos-formato.js). Nada de fila nova.
 *
 * Computador "aberto agora": mandou notícia do app nos últimos 2 min (dispositivo_status); "usado há pouco": a sessão
 * dele foi usada nos últimos 15 min (o app consulta os pedidos a cada 30 s, e a sessão marca uso a cada 10 min).
 */
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { FormatoReferencia } from "@/lib/db/schema";
import type { Conta } from "@/lib/google/contas";
import { aspas, chamarDrive, ErroDrive, PASTA_MIME } from "@/lib/google/drive";
import { ID_DRIVE } from "@/lib/proxies/api";
import { pedirProxies } from "@/lib/proxies/pedidos";
import { siteUrl } from "@/lib/site";
import { CAMPOS_ARQUIVO, contasProntas, falhaDe, soMetadados, type ArquivoAchado, type FalhaDrive, type FileDrive } from "./drive-da-z";

export const ACAO_VERSAO = "drive.versao";
export const ACAO_COMPUTADOR = "drive.computador";
const ABERTO_MS = 2 * 60_000;
const RECENTE_MS = 15 * 60_000;

type Alvo = { tipo: RegExp; altura?: number; curto: string; de: RegExp };
const VIDEO = /^video\//;
/** O que conta como "a versão pedida" e de que tipo de original o computador sabe converter (src/referencias/formatos.js). */
export const ALVOS: Record<FormatoReferencia, Alvo> = {
  mp4: { tipo: /^video\/mp4$/, curto: "MP4", de: VIDEO },
  "mp4-1080": { tipo: /^video\/mp4$/, altura: 1080, curto: "MP4 1080p", de: VIDEO },
  "mp4-720": { tipo: /^video\/mp4$/, altura: 720, curto: "MP4 720p", de: VIDEO },
  "mp3-320": { tipo: /^audio\/(mpeg|mp3)$/, curto: "MP3 320", de: /^(video|audio)\// },
  wav: { tipo: /^audio\/(wav|x-wav|wave|vnd\.wave)$/, curto: "WAV", de: /^(video|audio)\// },
  m4a: { tipo: /^audio\/(mp4|x-m4a|m4a|aac)$/, curto: "M4A", de: /^(video|audio)\// },
  jpg: { tipo: /^image\/jpeg$/, curto: "JPG", de: /^image\// },
};

/** O arquivo é a versão pedida? Altura pedida: o lado menor do vídeo (vertical ou deitado); sem metadado, o nome diz. */
export function ehVersao(a: ArquivoAchado, formato: FormatoReferencia): boolean {
  const alvo = ALVOS[formato];
  if (!alvo.tipo.test(a.tipo)) return false;
  if (!alvo.altura) return true;
  const v = a.video;
  if (v?.largura && v.altura) return Math.min(v.largura, v.altura) === alvo.altura;
  return new RegExp(`\\b${alvo.altura}p\\b`, "i").test(a.nome);
}

export type Computador = { nome: string; plataforma: string | null; aberto_agora: boolean; usado_ha_pouco: boolean; visto_em: string };

/** Os computadores conectados à conta (sessões de dispositivo válidas), o mais recente primeiro. */
export async function computadoresDa(usuarioId: string, agora = Date.now()): Promise<Computador[]> {
  const s = schema.sessoes;
  const linhas = await db
    .select({ id: s.id, nome: s.nome, plataforma: s.plataforma, ultimoUsoEm: s.ultimoUsoEm })
    .from(s)
    .where(and(eq(s.usuarioId, usuarioId), eq(s.tipo, "dispositivo"), isNull(s.revogadaEm), gt(s.expiraEm, new Date(agora))));
  if (!linhas.length) return [];
  const status = await db
    .select({ sessaoId: schema.dispositivoStatus.sessaoId, atualizadoEm: schema.dispositivoStatus.atualizadoEm })
    .from(schema.dispositivoStatus)
    .where(inArray(schema.dispositivoStatus.sessaoId, linhas.map((l) => l.id)));
  const aviso = new Map(status.map((x) => [x.sessaoId, x.atualizadoEm.getTime()]));
  return linhas
    .map((l) => {
      const visto = Math.max(l.ultimoUsoEm.getTime(), aviso.get(l.id) ?? 0);
      return {
        nome: l.nome || "Computador",
        plataforma: l.plataforma ?? null,
        aberto_agora: agora - (aviso.get(l.id) ?? 0) < ABERTO_MS,
        usado_ha_pouco: agora - visto < RECENTE_MS,
        visto_em: new Date(visto).toISOString(),
      };
    })
    .sort((a, b) => b.visto_em.localeCompare(a.visto_em));
}

type Original = { conta: Conta; arquivo: ArquivoAchado; pais: string[] };

/** O arquivo pelo id, no Drive da pessoa que o tiver (fora da lixeira, não pasta). */
async function acharOriginal(usuarioId: string, contas: Conta[], fileId: string): Promise<Original | null> {
  for (const conta of contas) {
    try {
      const f = await chamarDrive<FileDrive>(usuarioId, conta.id, `/files/${encodeURIComponent(fileId)}`, { query: { fields: `${CAMPOS_ARQUIVO},trashed` } });
      const a = f && f.trashed !== true && f.mimeType !== PASTA_MIME ? soMetadados(f) : null;
      if (a) return { conta, arquivo: a, pais: Array.isArray(f.parents) ? (f.parents as unknown[]).filter((p): p is string => typeof p === "string") : [] };
    } catch (e) {
      if (!(e instanceof ErroDrive && (e.status === 404 || e.status === 400))) throw e;
    }
  }
  return null;
}

const semExtensao = (nome: string) => nome.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim().slice(0, 100);

export type ResultadoVersao =
  | { ok: true; original: ArquivoAchado; versoes: ArquivoAchado[]; o_proprio: boolean; formato: FormatoReferencia; converte: boolean; computadores: Computador[] }
  | { ok: true; nao_achou: true }
  | FalhaDrive;

export async function procurarVersao(usuarioId: string, fileId: string, formato: FormatoReferencia): Promise<ResultadoVersao> {
  if (!ID_DRIVE.test(fileId)) return { ok: true, nao_achou: true };
  const contas = await contasProntas(usuarioId);
  if (!Array.isArray(contas)) return contas;
  let o: Original | null;
  try {
    o = await acharOriginal(usuarioId, contas, fileId);
  } catch (e) {
    return falhaDe([e]);
  }
  if (!o) return { ok: true, nao_achou: true };
  const computadores = await computadoresDa(usuarioId);
  const alvo = ALVOS[formato];
  const base = { ok: true as const, original: o.arquivo, formato, converte: alvo.de.test(o.arquivo.tipo), computadores };
  if (ehVersao(o.arquivo, formato)) return { ...base, versoes: [o.arquivo], o_proprio: true };
  // Os irmãos na pasta e os de nome parecido (variantes do mesmo arquivo), no mesmo Drive.
  const consultas = [`name contains ${aspas(semExtensao(o.arquivo.nome))} and trashed = false`, ...o.pais.slice(0, 2).map((p) => `${aspas(p)} in parents and trashed = false`)];
  const respostas = await Promise.allSettled(
    consultas.map((q) =>
      chamarDrive<{ files?: FileDrive[] }>(usuarioId, o.conta.id, "/files", {
        query: { q, fields: `files(${CAMPOS_ARQUIVO})`, pageSize: 100, corpora: "allDrives", includeItemsFromAllDrives: true },
      }),
    ),
  );
  const vistos = new Set<string>([o.arquivo.id]);
  const versoes: ArquivoAchado[] = [];
  for (const r of respostas) {
    if (r.status !== "fulfilled") continue;
    for (const f of r.value?.files ?? []) {
      const a = soMetadados(f);
      if (!a || vistos.has(a.id)) continue;
      vistos.add(a.id);
      // Na pasta, só o que tem o nome do original (outro vídeo 720p da pasta não é versão deste).
      if (ehVersao(a, formato) && a.nome.toLowerCase().includes(semExtensao(o.arquivo.nome).toLowerCase().slice(0, 40))) versoes.push(a);
    }
  }
  if (respostas.every((r) => r.status === "rejected")) return falhaDe(respostas.map((r) => (r as PromiseRejectedResult).reason));
  return { ...base, versoes: versoes.slice(0, 5), o_proprio: false };
}

export type ResultadoPedido =
  | {
      ok: true;
      pedido: { id: string; status: string; novo: boolean };
      original: { nome: string; tipo: string };
      formato: string;
      computadores: Computador[];
      destino: string;
      acompanhar: string;
    }
  | { ok: false; erro: "nao_achou" | "formato_incompativel" | "sem_computador"; mensagem: string }
  | FalhaDrive;

/** Cria o pedido "Baixar como…" (o mesmo do celular). Só chamado com a confirmação da pessoa (o HUB confere). */
export async function pedirAoComputador(usuarioId: string, fileId: string, formato: FormatoReferencia): Promise<ResultadoPedido> {
  if (!ID_DRIVE.test(fileId)) return { ok: false, erro: "nao_achou", mensagem: "Arquivo não encontrado no Drive." };
  const contas = await contasProntas(usuarioId);
  if (!Array.isArray(contas)) return contas;
  let o: Original | null;
  try {
    o = await acharOriginal(usuarioId, contas, fileId);
  } catch (e) {
    return falhaDe([e]);
  }
  if (!o) return { ok: false, erro: "nao_achou", mensagem: "Arquivo não encontrado no Drive." };
  const alvo = ALVOS[formato];
  if (!alvo.de.test(o.arquivo.tipo)) return { ok: false, erro: "formato_incompativel", mensagem: `O computador não converte ${o.arquivo.tipo} para ${alvo.curto}.` };
  const computadores = await computadoresDa(usuarioId);
  if (!computadores.length) {
    return { ok: false, erro: "sem_computador", mensagem: `Nenhum computador com o SOBEDESCE conectado a esta conta. Instale em ${siteUrl()} e entre com a mesma conta.` };
  }
  const r = await pedirProxies(usuarioId, o.conta.id, [{ fileId: o.arquivo.id, nome: o.arquivo.nome, tamanho: o.arquivo.tamanho }], {
    tipo: "formato",
    ajustes: { formato },
  });
  const p = r.pedidos[0];
  return {
    ok: true,
    pedido: { id: p.id, status: p.status, novo: r.novos > 0 },
    original: { nome: o.arquivo.nome, tipo: o.arquivo.tipo },
    formato: alvo.curto,
    computadores,
    destino: `Na mesma pasta do original no Drive, como "${semExtensao(o.arquivo.nome)} (${alvo.curto})".`,
    acompanhar: `${siteUrl()}/app/#referencias`,
  };
}
