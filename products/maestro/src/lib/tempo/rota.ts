/**
 * /api/tempo: o cronômetro de tarefas (drizzle/0038). GET devolve o estado (o que roda, hoje, totais por card e o
 * relógio do servidor) ou, com `?semana=`, `?tipos=`, `?card=`, `?tipicos=1` e `?lista=tipos`, o Resumo da semana, o
 * painel por tipo de vídeo, as minhas sessões de um card, o típico de cada tipo e a lista de tipos. POST faz uma
 * operação (iniciar, pausar, parado, adicionar, ajustar, apagar, zerar, restaurar, tipo_*). Sessão e acesso no
 * servidor (401/403), Origin nas gravações, papel aqui e de novo no banco (RLS e gatilhos). Só Web API.
 */
import { erro, json, lerJson, origemConfere } from "@/lib/http";
import { exigirAcesso } from "@/lib/auth/requisicao";
import { origensDoSite } from "@/lib/site";
import {
  OPS_DE_TIPO,
  adicionar,
  ajustar,
  apagarSessao,
  descartarParado,
  estado,
  iniciar,
  listarTipos,
  operarTipo,
  painelPorTipo,
  pausar,
  podeCronometrar,
  restaurar,
  semana,
  sessoesDoCard,
  tipicos,
  zerar,
  type Falha,
} from "./servidor";

const responder = (f: Falha) => json({ erro: f.erro, mensagem: f.mensagem }, f.status);

export async function getTempo(req: Request): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  const ctx = { sub: s.sub, orgId: s.orgId };
  const q = new URL(req.url).searchParams;
  if (q.has("semana")) {
    const r = await semana(ctx, s.papel, { dia: q.get("semana") || undefined, quem: q.get("quem") });
    return r.ok ? json({ semana: r.semana, nomes: r.nomes, quem: r.quem, agora: r.agora }) : responder(r);
  }
  if (q.has("tipos")) {
    const r = await painelPorTipo(ctx, s.papel, { periodo: q.get("periodo"), quem: q.get("quem"), cliente: q.get("cliente") });
    return r.ok ? json(r.painel) : responder(r);
  }
  if (q.get("tipicos") === "1") return json({ tipicos: await tipicos(ctx, s.papel) });
  if (q.get("lista") === "tipos") return json({ tipos: await listarTipos(ctx) });
  const card = q.get("card");
  if (card) return json({ sessoes: await sessoesDoCard(ctx, card) });
  if (!podeCronometrar(s.papel))
    return json({ agora: new Date().toISOString(), rodando: null, hoje: [], totais: {}, cards: {}, clientes: {}, time: false, pode: false });
  return json({ ...(await estado(ctx, s.papel)), pode: true });
}

export async function postTempo(req: Request): Promise<Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  if (!podeCronometrar(s.papel)) return erro(403, "sem_permissao", "Seu papel nesta organização só lê.");
  const c = await lerJson(req, 16 * 1024);
  if (!c) return erro(400, "formato", "Pedido inválido.");
  const ctx = { sub: s.sub, orgId: s.orgId };
  if (typeof c.op === "string" && OPS_DE_TIPO.has(c.op)) {
    const r = await operarTipo(ctx, s.papel, c);
    return r.ok ? json({ tipos: r.tipos }) : responder(r);
  }
  const r =
    c.op === "iniciar"
      ? await iniciar(ctx, c.card, c.modo ?? "livre")
      : c.op === "pausar"
        ? await pausar(ctx)
        : c.op === "parado"
          ? await descartarParado(ctx, c.desde, c.continuar)
          : c.op === "adicionar"
            ? await adicionar(ctx, c.card, c.minutos, c.motivo, c.fim)
            : c.op === "ajustar"
              ? await ajustar(ctx, c.id, c.inicio, c.fim, c.motivo)
              : c.op === "apagar"
                ? await apagarSessao(ctx, c.id)
                : c.op === "zerar"
                  ? await zerar(ctx, c.card)
                  : c.op === "restaurar"
                    ? await restaurar(ctx, c.ids)
                    : null;
  if (!r) return erro(400, "formato", "Operação desconhecida.");
  if (!r.ok) return responder(r);
  // a resposta leva o estado novo inteiro: a tela não precisa juntar nada
  const { ok: _ok, ...resto } = r;
  void _ok;
  return json({ ...resto, estado: await estado(ctx, s.papel) });
}
