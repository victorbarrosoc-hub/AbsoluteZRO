import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { dataBr } from "@/lib/dinheiro";
import { carregarTabela } from "@/lib/orcamento/precos";
import { codigoOrcamento, nomeStatus } from "@/lib/orcamento/motor";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { obterPedido } from "@/lib/pedidos/equipe";
import { whatsappDaProdutora } from "@/lib/publico/porta";
import { FAIXAS_INVESTIMENTO, nomeStatusPedido, periodoDoPedido, TOM_PEDIDO } from "@/lib/pedidos/formulario";
import { BotaoAcao } from "@/components/acao";
import { Monograma, Secao } from "@/components/crm";
import { Icone } from "@/components/icones";
import { SeloStatus } from "@/components/painel";
import { apagarPedidoAcao, gerarOrcamentoAcao, statusPedidoAcao } from "../acoes";

export const metadata = { title: "Pedido" };

/** O pedido: o que o cliente pediu (nas palavras da tabela de preços), o contato e "Gerar orçamento". */
export default async function FichaPedido({ params }: PageProps<"/app/pedidos/[id]">) {
  const { id } = await params;
  const s = await exigirAcessoNaPagina(`/app/pedidos/${id}`);
  const ctx = { sub: s.sub, orgId: s.orgId };
  const [p, tabela] = await Promise.all([obterPedido(ctx, id), carregarTabela(ctx)]);
  if (!p) notFound();
  const r = p.respostas;
  const escreve = podeEscrever(s.papel);
  const rotuloVar = (k: string, v: string | number) => {
    const d = tabela.variaveis.find((x) => x.chave === k);
    return [d?.rotulo ?? k, typeof v === "number" ? String(v) : (d?.opcoes.find((o) => o.valor === v)?.rotulo ?? v)] as const;
  };
  const nicho = r.nicho ? rotuloVar("nicho", r.nicho)[1] : null;
  const periodo = periodoDoPedido(r);
  const faixa = r.investimento ? FAIXAS_INVESTIMENTO.find((f) => f.valor === r.investimento)?.rotulo : null;
  const wpp = whatsappDaProdutora(p.whatsapp, `Oi, ${p.nome.split(" ")[0]}! Aqui é da ${s.orgNome}, sobre o seu pedido ${p.protocolo}.`);
  return (
    <div className="pagina">
      <Link className="voltar" href="/app/pedidos">
        <Icone nome="voltar" size={16} /> Pedidos
      </Link>
      <header className="perfil">
        <Monograma nome={p.empresa ?? p.nome} grande />
        <div className="perfil__miolo">
          <h1 className="atitle">
            <strong>{p.empresa ?? p.nome}</strong>
          </h1>
          <p className="apoio">{[p.tipo, p.empresa ? p.nome : null, `protocolo ${p.protocolo}`].filter(Boolean).join(" · ")}</p>
          <div className="perfil__selos">
            <SeloStatus status={TOM_PEDIDO[p.status] ?? "neutro"}>{nomeStatusPedido(p.status)}</SeloStatus>
          </div>
        </div>
        <div className="acoes perfil__acoes">
          {p.orcamento ? (
            <Link className="glass-btn glass-btn--ink" href={`/app/orcamentos/${p.orcamento.id}`}>
              <Icone nome="orcamento" size={18} /> Orçamento {codigoOrcamento(p.orcamento.numero, p.orcamento.versao)}
            </Link>
          ) : escreve && p.status !== "recusado" ? (
            <BotaoAcao acao={gerarOrcamentoAcao} campos={{ id: p.id }} rotulo="Gerar orçamento" icone="orcamento" classe="glass-btn glass-btn--ink" />
          ) : null}
          {wpp ? (
            <a className="glass-btn" href={wpp} target="_blank" rel="noreferrer">
              <Icone nome="whatsapp" size={18} /> WhatsApp
            </a>
          ) : null}
          {p.email ? (
            <a className="glass-btn glass-btn--icone" href={`mailto:${p.email}`} title={p.email} aria-label={`E-mail para ${p.email}`}>
              <Icone nome="email" size={18} />
            </a>
          ) : null}
        </div>
      </header>

      <div className="painel">
        <Secao titulo="O pedido">
          <dl className="dados">
            <dt>Tipo</dt>
            <dd>{p.tipo ?? "—"}</dd>
            {nicho ? (
              <>
                <dt>Nicho</dt>
                <dd>{nicho}</dd>
              </>
            ) : null}
            {Object.entries(r.vars).map(([k, v]) => {
              const [rot, val] = rotuloVar(k, v);
              return (
                <div key={k} className="dados__par">
                  <dt>{rot}</dt>
                  <dd className="num">{val}</dd>
                </div>
              );
            })}
            <dt>Quando</dt>
            <dd>{periodo ?? "A combinar"}</dd>
            <dt>Onde</dt>
            <dd>{r.local ?? "—"}</dd>
            {faixa ? (
              <>
                <dt>Investimento</dt>
                <dd>{faixa}</dd>
              </>
            ) : null}
          </dl>
          {r.ideia ? <p className="observacoes">{r.ideia}</p> : null}
        </Secao>
        <div className="painel__lado">
          <Secao titulo="Contato">
            <dl className="dados">
              <dt>Nome</dt>
              <dd>{p.nome}</dd>
              <dt>WhatsApp</dt>
              <dd>{p.whatsapp ?? "—"}</dd>
              <dt>E-mail</dt>
              <dd>{p.email ?? "—"}</dd>
              <dt>Chegou</dt>
              <dd>{dataBr(p.criadoEm.slice(0, 10))}</dd>
            </dl>
            <p className="sutil">Consentimento em {dataBr(p.consentimentoEm.slice(0, 10))}. Apague se a pessoa pedir.</p>
            {p.clienteId ? (
              <Link className="atalho" href={`/app/clientes/${p.clienteId}`}>
                <Icone nome="clientes" size={18} /> {p.clienteNome} <Icone nome="seta" size={15} />
              </Link>
            ) : null}
          </Secao>
          {p.orcamento ? (
            <Secao titulo="Orçamento">
              <p>
                <Link href={`/app/orcamentos/${p.orcamento.id}`}>{codigoOrcamento(p.orcamento.numero, p.orcamento.versao)}</Link> ·{" "}
                {nomeStatus(p.orcamento.status)}
              </p>
            </Secao>
          ) : null}
          {escreve || podeRemover(s.papel) ? (
            <div className="acoes">
              {escreve && p.status === "novo" ? (
                <BotaoAcao acao={statusPedidoAcao} campos={{ id: p.id, para: "recusado" }} rotulo="Recusar" confirmar="Recusar o pedido?" />
              ) : null}
              {escreve && p.status === "recusado" ? <BotaoAcao acao={statusPedidoAcao} campos={{ id: p.id, para: "novo" }} rotulo="Reabrir" /> : null}
              {podeRemover(s.papel) ? (
                <BotaoAcao acao={apagarPedidoAcao} campos={{ id: p.id }} rotulo="Apagar dados" icone="lixo" classe="q-perigo" confirmar="Apagar de vez?" />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
