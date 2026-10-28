import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brl, hojeBr, porcento, somarMeses } from "@/lib/dinheiro";
import { fluxoEResultado } from "@/lib/financeiro/servidor";
import { MARGEM_MINIMA } from "@/lib/orcamento/motor";
import { podeVerDinheiro } from "@/lib/papeis";
import { Secao } from "@/components/crm";
import { CabecaFinanceiro, SemDinheiro } from "@/components/financeiro";
import { Cifra, Cifras, GraficoFluxo, Medidor } from "@/components/painel";

export const metadata = { title: "Fluxo e resultado" };

/** Fluxo de caixa (3 meses para trás, 2 para a frente) e o resultado de cada projeto: margem real × orçada. */
export default async function Fluxo() {
  const sessao = await exigirAcessoNaPagina("/app/financeiro/fluxo");
  if (!podeVerDinheiro(sessao.papel))
    return (
      <div className="pagina">
        <CabecaFinanceiro ativa="/app/financeiro/fluxo" />
        <SemDinheiro />
      </div>
    );
  const hoje = hojeBr();
  const mes = hoje.slice(0, 7);
  const { fluxo, resultado } = await fluxoEResultado({ sub: sessao.sub, orgId: sessao.orgId }, somarMeses(mes, -3), somarMeses(mes, 2), hoje);
  const passado = fluxo.filter((m) => m.mes <= mes);
  const entrou = passado.reduce((s, m) => s + m.recebido, 0);
  const saiu = passado.reduce((s, m) => s + m.pago, 0);
  const futuro = fluxo.filter((m) => m.mes > mes);
  const previsto = futuro.reduce((s, m) => s + m.saldo, 0);
  return (
    <div className="pagina">
      <CabecaFinanceiro ativa="/app/financeiro/fluxo" />
      <Cifras>
        <Cifra rotulo="Recebido nos últimos 4 meses" valor={brl(entrou)} tom="ok" />
        <Cifra rotulo="Pago nos últimos 4 meses" valor={brl(saiu)} />
        <Cifra
          rotulo="Próximos 2 meses"
          valor={`${previsto < 0 ? "− " : "+ "}${brl(Math.abs(previsto))}`}
          apoio="saldo previsto"
          tom={previsto < 0 ? "perigo" : undefined}
        />
      </Cifras>
      <Secao titulo="Fluxo de caixa">
        <GraficoFluxo meses={fluxo} atual={mes} />
      </Secao>
      <Secao titulo="Resultado por projeto">
        {resultado.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Projeto</th>
                  <th className="num">Receita</th>
                  <th className="num">Recebido</th>
                  <th className="num">Custos</th>
                  <th className="num">Margem</th>
                  <th>Real × orçada</th>
                </tr>
              </thead>
              <tbody>
                {resultado.map((p) => {
                  const tom = p.margem < 0 ? "perigo" : (p.margemPct ?? 0) < MARGEM_MINIMA ? "aviso" : "ok";
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/app/projetos/${p.id}`}>
                          <span className="codigo">{p.codigo}</span> {p.titulo}
                        </Link>
                        {p.cliente ? <span className="sutil"> · {p.cliente}</span> : null}
                      </td>
                      <td className="num">{brl(p.receita)}</td>
                      <td className="num">
                        {brl(p.recebido)}
                        {p.semLancar > 0 ? (
                          <span className="sutil" title="Contratado sem lançamento de entrada">
                            {" "}
                            +{brl(p.semLancar)}
                          </span>
                        ) : null}
                      </td>
                      <td className="num">{brl(p.custos)}</td>
                      <td className="num">
                        {brl(p.margem)} <span className="sutil">{porcento(p.margemPct)}</span>
                      </td>
                      <td>
                        <span className="real-orcada">
                          <Medidor valor={Math.max(0, p.margemPct ?? 0)} rotulo={`Margem real ${porcento(p.margemPct)}`} tom={tom} />
                          <span className="sutil">{p.margemOrcadaPct != null ? `orçada ${porcento(p.margemOrcadaPct)}` : "sem orçamento"}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="nada">Projetos com valor ou lançamentos aparecem aqui.</p>
        )}
      </Secao>
    </div>
  );
}
