/**
 * /api/criacao/roteiros/<id>: o endereço do editor do Roteiro (plano da Criação §4.3, fase F2). Sessão e acesso no
 * servidor (401/403), Origin conferida nas gravações (CSRF), papel por `permissoes.ts` e de novo pelo banco (RLS,
 * gatilhos e `maestro.roteiro_versao_salvar`). Só Web API: os testes chamam direto, sem servidor.
 *
 * GET  ?rev=N          o poll de 5 s: `{ mudou: false, rev, estado, versaoAtual }` ou `{ mudou: true, roteiro }`
 * GET  ?versoes=1      as versões salvas
 * GET  ?versao=n       uma versão com o conteúdo (comparar e enviar)
 * GET  ?envios=1       os últimos envios (só administração e gestão)
 * GET  ?cliente=1      os comentários do cliente (por bloco e versão) e as decisões (F7)
 * GET  ?para-cliente=1 o card, o lote e o cliente antes de mandar (só administração e gestão)
 * GET  ?tpeasy=1       F8: dá para mandar direto ao TPeasy? Para quem? O que já foi (com "Recebido")?
 * POST { op: "salvar", rev, conteudo?, titulo? }   autosave com `rev`; 409 `conflito` traz o atual para juntar
 * POST { op: "versao", nota? }                     "Salvar versão" (congela o que está gravado)
 * POST { op: "restaurar", n, rev }                 o rascunho volta à versão n
 * POST { op: "ligar", projetoId, cardId }          liga a projeto e/ou card (null desliga)
 * POST { op: "estado", estado }                    só administração e gestão
 * POST { op: "lixeira", apagar }                   manda para a lixeira ou tira dela
 * POST { op: "apagar_de_vez" }                     só da lixeira, só administração e gestão, só sem versão salva
 * POST { op: "enviado", n, destino, formato, pessoa? }  anota o que saiu de qual versão (admin e gestão; AEON só aberto)
 * POST { op: "cliente", n, clienteId? }         a versão n vira peça do link de aprovação do card (admin e gestão; F7)
 * POST { op: "tpeasy", n, pessoa?, para? }      F8: a versão n direto na caixa de entrada do TPeasy (admin e gestão + TPeasy no plano)
 * POST { op: "resolver", id, resolvido }        resolve ou reabre um comentário do cliente (quem edita)
 */
import { exigirAcesso } from "@/lib/auth/requisicao";
import { erro, json, lerJson, origemConfere } from "@/lib/http";
import { origemDoSite, origensDoSite } from "@/lib/site";
import { podeApagarDeVezCriacao, podeEditarCriacao, podeEnviarCriacao, podeMandarParaAeon } from "../permissoes";
import { clienteDoRoteiro, enviarAoCliente, paraOClienteEstado, resolverDoRoteiro } from "./cliente";
import { ehSaida, type FormatoSaida } from "./saidas";
import { enviarAoTpeasy, estadoTpeasy } from "./tpeasy";
import {
  apagarRoteiroDeVez,
  type EstadoRoteiro,
  ligarRoteiro,
  listarEnvios,
  listarVersoes,
  lixeiraRoteiro,
  mudarEstadoRoteiro,
  obterRoteiro,
  registrarEnvio,
  obterVersao,
  restaurarVersao,
  salvarRoteiro,
  salvarVersao,
} from "./servidor";

/** O roteiro inteiro passa de 256 KB só fora do limite; folga para o resto do corpo. */
const LIMITE_CORPO = 400 * 1024;

type Falha = { ok: false; erro: string; mensagem: string };
const STATUS: Record<string, number> = {
  nao_existe: 404,
  sem_permissao: 403,
  conflito: 409,
  ja_existe: 409,
  tem_versao: 409,
  sem_card: 409,
  sem_cliente: 409,
  fora_da_lixeira: 409,
};
const responder = (f: Falha & { atual?: unknown }) =>
  json({ erro: f.erro, mensagem: f.mensagem, ...(f.atual ? { atual: f.atual } : {}) }, STATUS[f.erro] ?? 400);

export async function getRoteiro(req: Request, id: string): Promise<Response> {
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  const ctx = { sub: s.sub, orgId: s.orgId };
  const q = new URL(req.url).searchParams;
  if (q.has("versoes")) return json({ versoes: await listarVersoes(ctx, id) });
  if (q.has("envios")) return json({ envios: podeEnviarCriacao(s.papel) ? await listarEnvios(ctx, id) : [] });
  if (q.has("cliente")) return json(await clienteDoRoteiro(ctx, id));
  if (q.has("para-cliente")) {
    if (!podeEnviarCriacao(s.papel)) return erro(403, "sem_permissao", "Só administração e gestão mandam o roteiro ao cliente.");
    const e = await paraOClienteEstado(ctx, id);
    return e ? json(e) : erro(404, "nao_existe", "Esse roteiro não existe mais.");
  }
  if (q.has("tpeasy")) {
    if (!podeEnviarCriacao(s.papel)) return erro(403, "sem_permissao", "Só administração e gestão enviam o roteiro.");
    return json(await estadoTpeasy(s, id));
  }
  if (q.has("versao")) {
    const v = await obterVersao(ctx, id, Number(q.get("versao")));
    return v ? json({ versao: v }) : erro(404, "nao_existe", "Essa versão não existe.");
  }
  const r = await obterRoteiro(ctx, id);
  if (!r || r.apagado) return erro(404, "nao_existe", "Esse roteiro não existe mais.");
  const rev = Number(q.get("rev"));
  if (Number.isInteger(rev) && rev === r.rev) return json({ mudou: false, rev: r.rev, estado: r.estado, versaoAtual: r.versaoAtual });
  return json({ mudou: true, roteiro: r });
}

export async function postRoteiro(req: Request, id: string): Promise<Response> {
  if (!origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem.");
  const s = await exigirAcesso(req);
  if (s instanceof Response) return s;
  const corpo = await lerJson(req, LIMITE_CORPO);
  if (!corpo) return erro(400, "formato", "Pedido inválido.");
  const ctx = { sub: s.sub, orgId: s.orgId };
  if (corpo.op === "estado") {
    if (!podeEnviarCriacao(s.papel)) return erro(403, "sem_permissao", "Só administração e gestão mudam o estado do roteiro.");
    const r = await mudarEstadoRoteiro(ctx, id, corpo.estado as EstadoRoteiro);
    return r.ok ? json({ ok: true }) : responder(r);
  }
  if (corpo.op === "enviado") {
    if (!podeEnviarCriacao(s.papel)) return erro(403, "sem_permissao", "Só administração e gestão enviam o roteiro.");
    // "cliente" é anotado pelo banco ao mandar (op "cliente") e o TPeasy direto pelo envio (op "tpeasy"), nunca à mão.
    if (!ehSaida(corpo.destino, corpo.formato) || corpo.destino === "cliente" || corpo.formato === "direto")
      return erro(400, "formato", "Destino desconhecido.");
    if (corpo.destino === "aeon" && !podeMandarParaAeon(s)) return erro(403, "sem_permissao", "O AEON ainda não está aberto para a sua conta.");
    const r = await registrarEnvio(ctx, id, {
      n: Number(corpo.n),
      destino: corpo.destino,
      formato: corpo.formato as FormatoSaida,
      pessoa: typeof corpo.pessoa === "string" ? corpo.pessoa : null,
    });
    return r.ok ? json({ ok: true, sha256: r.sha256 }) : responder(r);
  }
  if (corpo.op === "cliente") {
    if (!podeEnviarCriacao(s.papel)) return erro(403, "sem_permissao", "Só administração e gestão mandam o roteiro ao cliente.");
    const r = await enviarAoCliente(ctx, id, Number(corpo.n), { clienteId: typeof corpo.clienteId === "string" ? corpo.clienteId : null });
    if (!r.ok) return responder(r);
    return json({ ok: true, url: `${origemDoSite(req.headers.get("origin"))}/a/${r.token}`, novo: r.novo, n: r.n, loteId: r.loteId, loteNovo: r.loteNovo });
  }
  if (corpo.op === "tpeasy") {
    if (!podeEnviarCriacao(s.papel)) return erro(403, "sem_permissao", "Só administração e gestão enviam o roteiro.");
    const r = await enviarAoTpeasy(s, id, {
      n: Number(corpo.n),
      pessoa: typeof corpo.pessoa === "string" ? corpo.pessoa : null,
      para: typeof corpo.para === "string" && corpo.para ? corpo.para : null,
      origem: req.headers.get("origin"),
    });
    return r.ok ? json({ ok: true, envio: r.envio }, r.envio.situacao === "nova" ? 201 : 200) : erro(r.status, r.erro, r.mensagem);
  }
  if (corpo.op === "apagar_de_vez") {
    if (!podeApagarDeVezCriacao(s.papel)) return erro(403, "sem_permissao", "Só administração e gestão apagam de vez.");
    const r = await apagarRoteiroDeVez(ctx, id);
    return r.ok ? json({ ok: true }) : responder(r);
  }
  if (!podeEditarCriacao(s.papel)) return erro(403, "sem_permissao", "Seu papel nesta organização só lê.");
  switch (corpo.op) {
    case "resolver": {
      const r = await resolverDoRoteiro(ctx, id, String(corpo.id ?? ""), corpo.resolvido !== false);
      return r.ok ? json({ ok: true }) : responder(r);
    }
    case "salvar": {
      const r = await salvarRoteiro(ctx, id, {
        rev: Number(corpo.rev),
        titulo: typeof corpo.titulo === "string" ? corpo.titulo : undefined,
        conteudo: corpo.conteudo,
      });
      return r.ok ? json({ rev: r.rev, duracaoSeg: r.duracaoSeg, atualizado: r.atualizado }) : responder(r);
    }
    case "versao": {
      const r = await salvarVersao(ctx, id, typeof corpo.nota === "string" ? corpo.nota : null);
      if (!r.ok) return responder(r);
      return json({ versao: { id: r.id, n: r.n, sha256: r.sha256 }, versoes: await listarVersoes(ctx, id) });
    }
    case "restaurar": {
      const r = await restaurarVersao(ctx, id, Number(corpo.n), Number(corpo.rev));
      if (!r.ok) return responder(r);
      return json({ rev: r.rev, roteiro: await obterRoteiro(ctx, id) });
    }
    case "ligar": {
      const v = (x: unknown) => (typeof x === "string" && x ? x : null);
      const r = await ligarRoteiro(ctx, id, { projetoId: v(corpo.projetoId), cardId: v(corpo.cardId) });
      return r.ok ? json({ roteiro: await obterRoteiro(ctx, id) }) : responder(r);
    }
    case "lixeira": {
      const r = await lixeiraRoteiro(ctx, id, corpo.apagar !== false);
      return r.ok ? json({ ok: true }) : responder(r);
    }
    default:
      return erro(400, "formato", "Operação desconhecida.");
  }
}
