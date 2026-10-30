/**
 * /api/quadro: o endereço fixo do Quadro. GET carrega (ou, com ?desde=, só o que mudou); POST grava uma operação
 * (criar, mudar, apagar, restaurar) ou mexe nas colunas (coluna_*, só administração e gestão). Sessão e acesso
 * conferidos no servidor (401/403), Origin conferida nas gravações (CSRF), papel conferido aqui e de novo pelo banco
 * (RLS e funções card_* e coluna_*). As colunas vêm junto em toda leitura (outro aparelho renomeou: a tela acerta).
 * Só Web API: os testes chamam direto, sem servidor.
 */
import { erro, json, lerJson, origemConfere } from "@/lib/http";
import { exigirAcesso } from "@/lib/auth/requisicao";
import { podeEditarColunas, podeEscrever } from "@/lib/papeis";
import { origensDoSite } from "@/lib/site";
import { sincronizarDepois } from "@/lib/agenda/depois";
import {
  apagarCard,
  carregarCards,
  cardsDesde,
  criarCard,
  lerCapa,
  mudarCard,
  porCapa,
  referenciasDoQuadro,
  selosDesde,
  selosDoQuadro,
  tirarCapa,
  type Falha,
} from "./servidor";
import { CAPA_ENTRADA_MAX } from "./capa-regras";
import { carregarColunas, OPS_DE_COLUNA, operarColuna } from "./colunas-servidor";

const responderFalha = (f: Falha) => json({ erro: f.erro, mensagem: f.mensagem, campo: f.campo, card: f.card ?? undefined }, f.status);

export async function getQuadro(req: Request): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  const ctx = { sub: s.sub, orgId: s.orgId };
  const desde = new URL(req.url).searchParams.get("desde");
  if (desde) {
    const r = await cardsDesde(ctx, desde);
    if (!r.ok) return responderFalha(r);
    const [colunas, selos] = await Promise.all([carregarColunas(ctx), selosDesde(ctx, desde)]);
    return json({ cards: r.cards, cursor: r.cursor, colunas, selos });
  }
  const [cards, refs, colunas, selos] = await Promise.all([carregarCards(ctx), referenciasDoQuadro(ctx), carregarColunas(ctx), selosDoQuadro(ctx)]);
  return json({ ...cards, ...refs, colunas, selos, eu: s.sub, podeEscrever: podeEscrever(s.papel), podeEditarColunas: podeEditarColunas(s.papel) });
}

export async function postQuadro(req: Request): Promise<Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeEscrever(s.papel)) return erro(403, "sem_permissao", "Seu papel nesta organização só lê o Quadro.");
  const corpo = await lerJson(req, 64 * 1024);
  if (!corpo) return erro(400, "formato", "Pedido inválido.");
  const ctx = { sub: s.sub, orgId: s.orgId };
  if (typeof corpo.op === "string" && OPS_DE_COLUNA.has(corpo.op)) {
    if (!podeEditarColunas(s.papel)) return erro(403, "sem_permissao", "Só administração e gestão mudam as colunas.");
    const c = await operarColuna(ctx, corpo);
    return c.ok ? json({ colunas: c.colunas, movidos: c.movidos }) : json({ erro: c.erro, mensagem: c.mensagem }, c.status);
  }
  const r =
    corpo.op === "criar"
      ? await criarCard(ctx, corpo.id, corpo.dados)
      : corpo.op === "mudar"
        ? await mudarCard(ctx, corpo.id, corpo.campos, corpo.base)
        : corpo.op === "apagar"
          ? await apagarCard(ctx, corpo.id)
          : corpo.op === "restaurar"
            ? await apagarCard(ctx, corpo.id, true)
            : null;
  if (!r) return erro(400, "formato", "Operação desconhecida.");
  // Prazo mudou: o Google Agenda de quem sincroniza recebe depois da resposta (drizzle/0021).
  if (r.ok) sincronizarDepois(s);
  return r.ok ? json({ card: r.card }) : responderFalha(r);
}

/* ───────────── a capa do card (drizzle/0035) ───────────── */

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

/**
 * POST /api/quadro/capa?card=<id> (os bytes da imagem no corpo) põe ou troca a capa; DELETE /api/quadro/capa?card=<id>
 * tira. Origin, sessão, acesso e papel de escrita aqui; o banco confere de novo (RLS, card_mudar, cota).
 */
export async function postCapa(req: Request): Promise<Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeEscrever(s.papel)) return erro(403, "sem_permissao", "Seu papel nesta organização só lê o Quadro.");
  const card = new URL(req.url).searchParams.get("card");
  const bytes = await lerBytes(req, CAPA_ENTRADA_MAX);
  if (bytes === null) return erro(413, "grande", "Imagem grande demais (até 12 MB).");
  if (bytes === "vazio") return erro(400, "vazio", "Escolha uma imagem.");
  const r = await porCapa({ sub: s.sub, orgId: s.orgId }, card, bytes);
  return r.ok ? json({ card: r.card }, 201) : responderFalha(r);
}

export async function deleteCapa(req: Request): Promise<Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeEscrever(s.papel)) return erro(403, "sem_permissao", "Seu papel nesta organização só lê o Quadro.");
  const r = await tirarCapa({ sub: s.sub, orgId: s.orgId }, new URL(req.url).searchParams.get("card"));
  return r.ok ? json({ card: r.card }) : responderFalha(r);
}

const NAO_ACHEI = () => new Response("Não encontrado.", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

/** GET /api/quadro/capa/<card>/<sha>: a imagem, só com sessão e o card no alcance (cache privado e imutável). */
export async function getCapa(req: Request, params: Promise<{ card: string; sha: string }>): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  const { card, sha } = await params;
  const b = await lerCapa({ sub: s.sub, orgId: s.orgId }, decodeURIComponent(card), sha).catch(() => null);
  // 404 também para o que existe fora do alcance: nada diz se a capa existe.
  if (!b) return NAO_ACHEI();
  return new Response(new Uint8Array(b), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(b.length),
      // privado: só o navegador de quem viu guarda; o sha256 no endereço muda se a capa mudar
      "Cache-Control": "private, max-age=31536000, immutable",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Robots-Tag": "noindex",
    },
  });
}
