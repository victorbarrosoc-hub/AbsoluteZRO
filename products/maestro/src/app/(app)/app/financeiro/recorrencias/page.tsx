import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarClientes } from "@/lib/crm/clientes";
import { brl, centavosParaCampo, hojeBr, mesPorExtenso } from "@/lib/dinheiro";
import { nomeCategoria } from "@/lib/financeiro/contas";
import { camposRecorrencia } from "@/lib/financeiro/formularios";
import { listarRecorrencias } from "@/lib/financeiro/servidor";
import { podeVerDinheiro } from "@/lib/papeis";
import { BotaoAcao } from "@/components/acao";
import { Secao } from "@/components/crm";
import { CabecaFinanceiro, SemDinheiro } from "@/components/financeiro";
import { Formulario } from "@/components/form";
import { Icone } from "@/components/icones";
import { gerarRecorrenciasAcao, removerRecorrenciaAcao, salvarRecorrenciaAcao } from "../acoes";

export const metadata = { title: "Recorrências" };

/** Aluguel, software, contrato mensal: cada mês vira lançamento (e cards na Pauta), uma vez só. */
export default async function Recorrencias() {
  const sessao = await exigirAcessoNaPagina("/app/financeiro/recorrencias");
  if (!podeVerDinheiro(sessao.papel))
    return (
      <div className="pagina">
        <CabecaFinanceiro ativa="/app/financeiro/recorrencias" />
        <SemDinheiro />
      </div>
    );
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [lista, clientes] = await Promise.all([listarRecorrencias(ctx), listarClientes(ctx)]);
  const mes = hojeBr().slice(0, 7);
  const campos = camposRecorrencia(clientes.map((c) => ({ id: c.id, nome: c.nome })));
  const mensal = (t: "entrada" | "saida") => lista.filter((r) => r.ativo && r.tipo === t).reduce((s, r) => s + r.valorCents, 0);
  return (
    <div className="pagina">
      <CabecaFinanceiro
        ativa="/app/financeiro/recorrencias"
        acao={
          <BotaoAcao acao={gerarRecorrenciasAcao} campos={{ mes }} rotulo={`Gerar ${mesPorExtenso(mes).split(" de ")[0]}`} icone="check" classe="glass-btn" />
        }
      />
      <p className="apoio">
        Todo mês: entra {brl(mensal("entrada"))} e sai {brl(mensal("saida"))}.
      </p>
      <Secao titulo="Recorrências">
        {lista.length ? (
          <ul className="tabela-precos">
            {lista.map((r) => (
              <li key={r.id} data-ativo={r.ativo || undefined}>
                <details>
                  <summary>
                    <span className="tp__nome">
                      {r.descricao}
                      <span className="sutil">
                        {nomeCategoria(r.categoria)} · dia {r.dia}
                        {r.cliente ? ` · ${r.cliente}` : ""}
                        {r.ultimoMes ? ` · gerado até ${mesPorExtenso(r.ultimoMes)}` : ""}
                      </span>
                    </span>
                    <span className="tp__faixas">
                      {r.entregas.map((e) => (
                        <span key={e.titulo} className="chip">
                          {e.qtd} {e.titulo}
                        </span>
                      ))}
                    </span>
                    <span className="tp__preco" data-tipo={r.tipo}>
                      {r.tipo === "saida" ? "− " : ""}
                      {brl(r.valorCents)}
                    </span>
                    {!r.ativo ? <span className="selo">Pausada</span> : null}
                  </summary>
                  <div className="tp__editar">
                    <Formulario
                      acao={salvarRecorrenciaAcao}
                      campos={[
                        ...campos,
                        {
                          nome: "ativo",
                          rotulo: "Situação",
                          tipo: "segmentos",
                          opcoes: [
                            { valor: "sim", nome: "Ativa" },
                            { valor: "nao", nome: "Pausada" },
                          ],
                        },
                      ]}
                      id={r.id}
                      compacto
                      inicial={{
                        descricao: r.descricao,
                        tipo: r.tipo,
                        categoria: r.categoria,
                        valor: centavosParaCampo(r.valorCents),
                        dia: String(r.dia),
                        inicio: r.inicioMes,
                        fim: r.fimMes ?? "",
                        cliente: r.clienteId ?? "",
                        entregas: r.entregas.map((e) => `${e.qtd} ${e.titulo}`).join("\n"),
                        ativo: r.ativo ? "sim" : "nao",
                      }}
                      rotulo="Salvar"
                    />
                    <BotaoAcao
                      acao={removerRecorrenciaAcao}
                      campos={{ id: r.id }}
                      rotulo="Remover"
                      classe="q-perigo"
                      icone="lixo"
                      confirmar="Remover? Os lançamentos já gerados ficam."
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nada">Nada recorrente ainda.</p>
        )}
        <details className="secao--abrir">
          <summary>
            <Icone nome="mais" size={16} /> Nova recorrência
          </summary>
          <Formulario
            acao={salvarRecorrenciaAcao}
            campos={campos}
            compacto
            inicial={{ tipo: "saida", categoria: "fixo", dia: "5", inicio: mes }}
            rotulo="Criar"
          />
        </details>
      </Secao>
    </div>
  );
}
