"use server";
/**
 * "Gerar versões com o Relay" (src/lib/relay/entregaveis.ts): sessão e acesso conferidos aqui; organização, pessoa e
 * papel da sessão (`podeEntregas` em src/lib/acessos.ts); o banco confere de novo (RLS e acesso por cliente) e o HUB
 * confere o plano (SOBEDESCE e Relay) ao assinar o pedido.
 */
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import * as rel from "@/lib/relay/entregaveis";

type Erro = { ok: false; erro: string; mensagem: string };
const erro = (r: { erro: string; mensagem: string }): Erro => ({ ok: false, erro: r.erro, mensagem: r.mensagem });

export async function prepararRelayAcao(versaoId: string): Promise<({ ok: true } & rel.Preparo) | Erro> {
  const s = await exigirAcessoNaAcao();
  const r = await rel.prepararRelay(s, versaoId);
  return r.ok ? { ok: true, ...r.dados } : erro(r);
}

export async function gerarVersoesAcao(e: rel.Pedir): Promise<({ ok: true } & rel.Pedido) | Erro> {
  const s = await exigirAcessoNaAcao();
  const r = await rel.gerarVersoes(s, {
    versaoId: String(e?.versaoId ?? ""),
    presets: e?.presets,
    destino: e?.destino === "original" ? "original" : "entregas",
    conta: typeof e?.conta === "string" ? e.conta : null,
  });
  return r.ok ? { ok: true, ...r.dados } : erro(r);
}

/** Os entregáveis do card; `acompanhar` só com a ficha ou o lote à vista (a tela chama a cada 5 s). */
export async function entregaveisDoCardAcao(cardId: string, acompanhar: boolean): Promise<{ ok: true } & rel.Andamento> {
  const s = await exigirAcessoNaAcao();
  return { ok: true, ...(await rel.entregaveisDoCard(s, String(cardId), acompanhar === true)) };
}

/** "Conferir" um item em revisão: só com o toque da pessoa (pede de novo a mesma chave; a fila devolve o que existe). */
export async function conferirEntregavelAcao(id: string): Promise<({ ok: true } & rel.Pedido) | Erro> {
  const s = await exigirAcessoNaAcao();
  const r = await rel.conferirEntregavel(s, String(id));
  return r.ok ? { ok: true, ...r.dados } : erro(r);
}

export async function cancelarEntregavelAcao(id: string): Promise<{ ok: true; entregavel: rel.Entregavel } | Erro> {
  const s = await exigirAcessoNaAcao();
  const r = await rel.cancelarEntregavel(s, String(id));
  return r.ok ? { ok: true, entregavel: r.dados } : erro(r);
}
