import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brl, dataCurta, hojeBr } from "@/lib/dinheiro";
import { aPagarEReceber, type Grupo } from "@/lib/financeiro/servidor";
import { NOME_STATUS } from "@/lib/financeiro/contas";
import { podeVerDinheiro } from "@/lib/papeis";
import { BotaoAcao } from "@/components/acao";
import { Secao } from "@/components/crm";
import { CabecaFinanceiro, NovoLancamento, SemDinheiro } from "@/components/financeiro";
import { Cifra, Cifras, SeloStatus } from "@/components/painel";
import { darBaixaAcao } from "../acoes";

export const metadata = { title: "A pagar e a receber" };

function Grupos({ grupos, vazio, rotuloBaixa }: { grupos: Grupo[]; vazio: string; rotuloBaixa: string }) {
  if (!grupos.length) return <p className="nada">{vazio}</p>;
  return (
    <ul className="grupos">
      {grupos.map((g) => (
        <li key={g.chave}>
          <details open={g.atrasado || undefined}>
            <summary>
              <span className="item__nome">{g.nome}</span>
              <span className="sutil">
                {g.lancamentos.length} · próximo {dataCurta(g.proximo)}
              </span>
              <strong className="num">{brl(g.aberto)}</strong>
              {g.atrasado ? <SeloStatus status="atrasado">Atrasado</SeloStatus> : null}
            </summary>
            <ul className="linhas">
              {g.lancamentos.map((l) => (
                <li key={l.id} className="linha">
                  <span className="linha__coluna">{dataCurta(l.vencimento)}</span>
                  <Link className="linha__titulo" href={`/app/financeiro/${l.id}`}>
                    {l.descricao}
                  </Link>
                  <span className="linha__meta num">{brl(l.aberto)}</span>
                  <SeloStatus status={l.status}>{NOME_STATUS[l.status]}</SeloStatus>
                  <BotaoAcao acao={darBaixaAcao} campos={{ lancamento: l.id }} rotulo={rotuloBaixa} icone="check" classe="glass-btn glass-btn--sm" />
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** O que está em aberto, de qualquer mês: a receber por cliente, a pagar a freelas e as contas. Baixa em um toque. */
export default async function Contas() {
  const sessao = await exigirAcessoNaPagina("/app/financeiro/contas");
  if (!podeVerDinheiro(sessao.papel))
    return (
      <div className="pagina">
        <CabecaFinanceiro ativa="/app/financeiro/contas" />
        <SemDinheiro />
      </div>
    );
  const r = await aPagarEReceber({ sub: sessao.sub, orgId: sessao.orgId }, hojeBr());
  return (
    <div className="pagina">
      <CabecaFinanceiro ativa="/app/financeiro/contas" acao={<NovoLancamento />} />
      <Cifras>
        <Cifra rotulo="A receber" valor={brl(r.totalReceber)} tom="ok" />
        <Cifra rotulo="A pagar" valor={brl(r.totalPagar)} />
        <Cifra rotulo="Diferença" valor={`${r.totalReceber - r.totalPagar < 0 ? "− " : ""}${brl(Math.abs(r.totalReceber - r.totalPagar))}`} />
      </Cifras>
      <div className="painel painel--meio">
        <Secao titulo="A receber">
          <Grupos grupos={r.receber} vazio="Nada a receber." rotuloBaixa="Recebido" />
        </Secao>
        <div className="painel__lado">
          <Secao titulo="Freelas a pagar">
            <Grupos grupos={r.freelas} vazio="Nenhum freela esperando pagamento." rotuloBaixa="Pago" />
            <p className="sutil">Sem cálculo de INSS ou IRRF: o pagamento é o valor combinado.</p>
          </Secao>
          <Secao titulo="Contas a pagar">
            <Grupos grupos={r.contas} vazio="Nenhuma conta em aberto." rotuloBaixa="Pago" />
          </Secao>
        </div>
      </div>
    </div>
  );
}
