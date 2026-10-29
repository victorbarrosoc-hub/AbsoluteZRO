/**
 * /api/quadro: o endereço fixo do Quadro. GET carrega (ou, com ?desde=, só o que mudou); POST grava uma operação
 * (criar, mudar, apagar, restaurar). Sessão e acesso conferidos no servidor (401/403), Origin conferida nas
 * gravações (CSRF), papel conferido aqui e de novo pelo banco (RLS e funções card_*).
 * Só Web API: os testes chamam direto, sem servidor.
 */
import { erro, json, lerJson, origemConfere } from "@/lib/http";
import { exigirAcesso } from "@/lib/auth/requisicao";
import { podeEscrever } from "@/lib/papeis";
import { origensDoSite } from "@/lib/site";
import { sincronizarDepois } from "@/lib/agenda/depois";
import { apagarCard, carregarCards, cardsDesde, criarCard, mudarCard, referenciasDoQuadro, type Falha } from "./servidor";

const responderFalha = (f: Falha) => json({ erro: f.erro, mensagem: f.mensagem, campo: f.campo, card: f.card ?? undefined }, f.status);

export async function getQuadro(req: Request): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  const ctx = { sub: s.sub, orgId: s.orgId };
  const desde = new URL(req.url).searchParams.get("desde");
  if (desde) {
    const r = await cardsDesde(ctx, desde);
    return r.ok ? json({ cards: r.cards, cursor: r.cursor }) : responderFalha(r);
  }
  const [cards, refs] = await Promise.all([carregarCards(ctx), referenciasDoQuadro(ctx)]);
  return json({ ...cards, ...refs, eu: s.sub, podeEscrever: podeEscrever(s.papel) });
}

export async function postQuadro(req: Request): Promise<Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeEscrever(s.papel)) return erro(403, "sem_permissao", "Seu papel nesta organização só lê o Quadro.");
  const corpo = await lerJson(req, 64 * 1024);
  if (!corpo) return erro(400, "formato", "Pedido inválido.");
  const ctx = { sub: s.sub, orgId: s.orgId };
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
