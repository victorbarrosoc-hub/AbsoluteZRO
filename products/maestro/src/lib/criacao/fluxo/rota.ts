/**
 * As rotas do Fluxo (fase F4; a tela é da F5). Sessão e acesso ao Maestro conferidos no servidor (401/403), Origin
 * conferida nas gravações (CSRF), papel conferido aqui (`podeEditarCriacao`, apagar de vez = administração e gestão) e
 * de novo pelo banco (RLS, gatilhos, cota). Só Web API: os testes chamam direto, sem servidor.
 *
 *   GET  /api/criacao/fluxo                       lista (?projeto=, ?card=, ?lixeira=1) + uso da cota
 *   GET  /api/criacao/fluxo?id=<id>               o fluxo inteiro (nós, ligações, referências, cursor)
 *   GET  /api/criacao/fluxo?id=<id>&desde=<c>     o que mudou desde o cursor (poll de 5 s)
 *   POST /api/criacao/fluxo                       { op: criar | titulo | ligar | lixeira | restaurar | apagar_de_vez | ops | limpar }
 *   POST /api/criacao/img?fluxo=<id>              bytes da imagem (PNG/JPEG/WebP) → WebP + miniatura no fluxo
 *   GET  /api/criacao/img/<id>/<sha>[?mini=1]     a imagem, só com sessão e alcance (cache privado e imutável)
 */
import { erro, json, lerJson, origemConfere } from "@/lib/http";
import { exigirAcesso } from "@/lib/auth/requisicao";
import { origensDoSite } from "@/lib/site";
import type { Falha } from "@/lib/crm/comum";
import { podeEditarCriacao, podeEnviarCriacao, podeVerCriacao } from "../permissoes";
import { IMAGEM_ENTRADA_MAX } from "./imagem";
import { lerOps } from "./modelo";
import * as srv from "./servidor";

const STATUS: Record<string, number> = {
  nao_existe: 404,
  sem_permissao: 403,
  conflito: 409,
  ja_existe: 409,
  na_lixeira: 409,
  fora_da_lixeira: 409,
  cota: 413,
  cota_fluxo: 413,
  grande: 413,
  limite: 422,
  secao: 422,
  referencia: 422,
  ponta: 422,
  vinculo: 422,
  tipo: 415,
  invalido: 422,
};
const responderFalha = (f: Falha & { atual?: unknown }) =>
  json({ erro: f.erro, mensagem: f.mensagem, ...(f.atual ? { atual: f.atual } : {}) }, STATUS[f.erro] ?? 400);

const SEM_PAPEL = () => erro(403, "sem_permissao", "Seu papel nesta organização só lê.");
const ctxDe = (s: { sub: string; orgId: string }) => ({ sub: s.sub, orgId: s.orgId });
const texto = (v: unknown) => (typeof v === "string" ? v : "");

export async function getFluxo(req: Request): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeVerCriacao(s.papel)) return SEM_PAPEL();
  const ctx = ctxDe(s);
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  if (id) {
    const desde = q.get("desde");
    if (desde) {
      const r = await srv.fluxoDesde(ctx, id, desde);
      return r.ok ? json(r) : responderFalha(r);
    }
    const f = await srv.obterFluxo(ctx, id);
    if (!f) return erro(404, "nao_existe", "Esse fluxo não existe mais.");
    return json({ ...f, eu: s.sub, podeEditar: podeEditarCriacao(s.papel), podeEnviar: podeEnviarCriacao(s.papel) });
  }
  const filtro = {
    ...(q.get("projeto") ? { projetoId: q.get("projeto")! } : {}),
    ...(q.get("card") ? { cardId: q.get("card")! } : {}),
    lixeira: q.get("lixeira") === "1",
  };
  const [fluxos, uso] = await Promise.all([srv.listarFluxos(ctx, filtro), srv.usoDasImagens(ctx)]);
  return json({ fluxos, uso, podeEditar: podeEditarCriacao(s.papel), podeEnviar: podeEnviarCriacao(s.papel) });
}

export async function postFluxo(req: Request): Promise<Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeEditarCriacao(s.papel)) return SEM_PAPEL();
  // 500 operações de colar com notas grandes cabem com folga; acima disso é engano ou abuso.
  const corpo = await lerJson(req, 1024 * 1024);
  if (!corpo) return erro(400, "formato", "Pedido inválido.");
  const ctx = ctxDe(s);
  const id = texto(corpo.id);
  switch (corpo.op) {
    case "criar": {
      const r = await srv.criarFluxo(ctx, {
        titulo: texto(corpo.titulo),
        projetoId: (corpo.projetoId as string | null | undefined) ?? null,
        cardId: (corpo.cardId as string | null | undefined) ?? null,
      });
      return r.ok ? json({ id: r.id, rev: r.rev }, 201) : responderFalha(r);
    }
    case "titulo": {
      const r = await srv.salvarFluxo(ctx, id, { rev: corpo.rev as number, titulo: texto(corpo.titulo) });
      return r.ok ? json({ rev: r.rev }) : responderFalha(r);
    }
    case "ligar": {
      const r = await srv.ligarFluxo(ctx, id, {
        projetoId: (corpo.projetoId as string | null | undefined) ?? null,
        cardId: (corpo.cardId as string | null | undefined) ?? null,
      });
      return r.ok ? json({ ok: true }) : responderFalha(r);
    }
    case "lixeira":
    case "restaurar": {
      const r = await srv.lixeiraFluxo(ctx, id, corpo.op === "lixeira");
      return r.ok ? json({ ok: true }) : responderFalha(r);
    }
    case "apagar_de_vez": {
      if (!podeEnviarCriacao(s.papel)) return erro(403, "sem_permissao", "Só administração e gestão apagam de vez.");
      const r = await srv.apagarFluxoDeVez(ctx, id);
      return r.ok ? json({ bytes: r.bytes }) : responderFalha(r);
    }
    case "ops": {
      const l = lerOps(corpo.ops);
      if (!l.ok) return json({ erro: "formato", mensagem: l.mensagem, indice: l.indice }, 400);
      const r = await srv.aplicarOps(ctx, id, l.ops);
      return r.ok ? json({ resultados: r.resultados, refs: r.refs }) : responderFalha(r);
    }
    case "limpar": {
      const r = await srv.limparFluxos(ctx);
      return r.ok ? json({ nos: r.nos, ligacoes: r.ligacoes, imagens: r.imagens, bytes: r.bytes }) : responderFalha(r);
    }
    default:
      return erro(400, "formato", "Operação desconhecida.");
  }
}

/** Lê o corpo até `max` bytes (null = passou). Confere o Content-Length antes e conta de novo enquanto lê. */
async function lerBytes(req: Request, max: number): Promise<Uint8Array | null | "vazio"> {
  const declarado = Number(req.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declarado) && declarado > max) return null;
  if (!req.body) return "vazio";
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  if (!total) return "vazio";
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.byteLength;
  }
  return out;
}

export async function postImagem(req: Request): Promise<Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeEditarCriacao(s.papel)) return SEM_PAPEL();
  const fluxo = new URL(req.url).searchParams.get("fluxo") ?? "";
  const bytes = await lerBytes(req, IMAGEM_ENTRADA_MAX);
  if (bytes === null) return erro(413, "grande", "Imagem grande demais (até 12 MB).");
  if (bytes === "vazio") return erro(400, "vazio", "Cole ou escolha uma imagem.");
  const r = await srv.enviarImagem(ctxDe(s), fluxo, bytes);
  return r.ok ? json({ imagem: r.imagem, jaExistia: r.jaExistia }, r.jaExistia ? 200 : 201) : responderFalha(r);
}

const NAO_ACHEI = () => new Response("Não encontrado.", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

export async function getImagem(req: Request, params: Promise<{ id: string; sha: string }>): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeVerCriacao(s.papel)) return SEM_PAPEL();
  const { id, sha } = await params;
  const mini = new URL(req.url).searchParams.get("mini") === "1";
  const b = await srv.lerImagem(ctxDe(s), id, sha, mini).catch(() => null);
  // 404 também para o que existe fora do alcance: nada diz se a imagem existe.
  if (!b) return NAO_ACHEI();
  return new Response(new Uint8Array(b), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(b.length),
      // privado: só o navegador de quem viu guarda; o sha256 no endereço muda se a imagem mudar
      "Cache-Control": "private, max-age=31536000, immutable",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Robots-Tag": "noindex",
    },
  });
}
