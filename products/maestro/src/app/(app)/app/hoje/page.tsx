import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brl, brlCurto, dataCurta, dataPorExtenso, diasEntre, hojeBr } from "@/lib/dinheiro";
import { quandoRetorno, situacaoRetorno } from "@/lib/funil/regras";
import { resumoDoDia, type DiaDoCaixa } from "@/lib/hoje";
import { metaDoMes } from "@/lib/numeros/servidor";
import { podeEscrever, podeVerDinheiro } from "@/lib/papeis";
import { Saudacao } from "@/components/ambiente";
import { BotaoAcao } from "@/components/acao";
import { Icone, type NomeIcone } from "@/components/icones";
import { horaNoBrasil } from "@/lib/hora";
import { contatoFeitoAcao, reagendarAcao } from "../pedidos/acoes";

export const metadata = { title: "Hoje" };

const SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const CURTOS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

function Cartao({
  href,
  icone,
  n,
  rotulo,
  apoio,
  tom,
  i,
}: {
  href: string;
  icone: NomeIcone;
  n: ReactNode;
  rotulo: string;
  apoio?: ReactNode;
  tom?: "aviso" | "perigo" | "ok";
  i: number;
}) {
  return (
    <Link className="hoje-cartao" href={href} data-tom={tom} style={{ "--i": i } as CSSProperties}>
      <span className="hoje-cartao__icone">
        <Icone nome={icone} size={18} />
      </span>
      <strong className="hoje-cartao__n">{n}</strong>
      <span className="hoje-cartao__rotulo">{rotulo}</span>
      {apoio ? <span className="hoje-cartao__apoio">{apoio}</span> : null}
    </Link>
  );
}

function Painel({ titulo, href, children, classe }: { titulo: string; href?: string; children: ReactNode; classe?: string }) {
  return (
    <section className={`hoje-painel${classe ? ` ${classe}` : ""}`} aria-label={titulo}>
      <header className="hoje-painel__topo">
        <h2>{titulo}</h2>
        {href ? (
          <Link href={href} className="hoje-painel__mais" aria-label={`Abrir ${titulo}`}>
            <Icone nome="seta" size={15} />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** O chip de prazo: "ontem", "hoje", "amanhã" (ponto do tom + texto grafite). */
function Prazo({ data, hoje }: { data: string; hoje: string }) {
  const s = situacaoRetorno(data, hoje);
  return (
    <span className="funil-chip" data-sit={s}>
      {quandoRetorno(data, hoje)}
    </span>
  );
}

/** Caixa da semana: o que entrou (grafite) e saiu (pêssego) em cada dia, de segunda a domingo; hoje marcado. */
function CaixaDaSemana({ dias, hoje }: { dias: DiaDoCaixa[]; hoje: string }) {
  const entrou = dias.reduce((t, d) => t + d.entrou, 0);
  const saiu = dias.reduce((t, d) => t + d.saiu, 0);
  const max = Math.max(1, ...dias.flatMap((d) => [d.entrou, d.saiu]));
  const h = (v: number) => `${v > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0}%`;
  return (
    <>
      <strong className="hoje-caixa__n num">{brl(entrou - saiu)}</strong>
      <p className="hoje-caixa__legenda">
        <span data-serie="entrada">
          <i aria-hidden="true" /> Entrou {brlCurto(entrou)}
        </span>
        <span data-serie="saida">
          <i aria-hidden="true" /> Saiu {brlCurto(saiu)}
        </span>
      </p>
      <figure className="hoje-caixa__grafico" aria-label="Entradas e saídas da semana">
        {dias.map((d, i) => (
          <div key={d.dia} className="hoje-caixa__dia" data-hoje={d.dia === hoje || undefined} data-futuro={d.dia > hoje || undefined}>
            <div className="hoje-caixa__barras">
              <span data-serie="entrada" style={{ height: h(d.entrou) }} title={`Entrou ${brl(d.entrou)} em ${dataCurta(d.dia)}`} />
              <span data-serie="saida" style={{ height: h(d.saiu) }} title={`Saiu ${brl(d.saiu)} em ${dataCurta(d.dia)}`} />
            </div>
            <span className="hoje-caixa__rotulo">{CURTOS[i]}</span>
          </div>
        ))}
        <table className="sr-only">
          <caption>Caixa da semana</caption>
          <tbody>
            {dias.map((d) => (
              <tr key={d.dia}>
                <th>{d.dia}</th>
                <td>{brl(d.entrou)}</td>
                <td>{brl(d.saiu)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </>
  );
}

/**
 * Hoje (plano v2 §3, fase 19; mockup C1-hoje): o dia da produtora. A agenda, o que vence, quem espera o cliente,
 * "Retornar hoje" (o funil, drizzle/0014) e o caixa da semana; embaixo, as contagens que levam a cada painel. Só dados
 * da organização da sessão (e do alcance da pessoa, se ela é restrita a alguns clientes); dinheiro só admin e gestão.
 */
export default async function Hoje() {
  const s = await exigirAcessoNaPagina("/app/hoje");
  const hoje = hojeBr();
  const dinheiro = podeVerDinheiro(s.papel);
  const escreve = podeEscrever(s.papel);
  const ctx = { sub: s.sub, orgId: s.orgId };
  const [r, meta] = await Promise.all([resumoDoDia(ctx, dinheiro, hoje), dinheiro ? metaDoMes(ctx, hoje.slice(0, 7)) : null]);
  const dia = SEMANA[new Date(`${hoje}T12:00:00Z`).getUTCDay()];
  const d = r.dinheiro;
  const pedem = r.retornos.length + r.cards.vencemHoje + r.cards.atrasados + r.pedidosNovos;
  let i = 0;
  return (
    <div className="pagina pagina--larga">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <div>
          <Saudacao nome={s.nome?.trim().split(/\s+/)[0] || null} horaPadrao={horaNoBrasil()} />
          <p className="apoio">
            {dia}, {dataPorExtenso(hoje)}
            {pedem ? ` · ${pedem === 1 ? "1 coisa pede" : `${pedem} coisas pedem`} você hoje.` : " · Dia tranquilo."}
          </p>
        </div>
        <div className="acoes">
          <Link className="glass-btn" href="/app/quadro">
            Abrir Quadro
          </Link>
          {escreve ? (
            <Link className="glass-btn glass-btn--ink" href="/app/quadro?novo=1">
              <Icone nome="mais" size={18} /> Novo card
            </Link>
          ) : null}
        </div>
      </header>

      <div className="hoje-paineis" data-dinheiro={d ? "" : undefined}>
        <div className="hoje-paineis__col">
          <Painel titulo="Agenda" href="/app/agenda">
            {r.agenda.hoje.length ? (
              <ul className="hoje-lista">
                {r.agenda.hoje.map((e) => (
                  <li key={e.id}>
                    <Link href={`/app/agenda/${e.id}`} className="hoje-evento">
                      <span className="hoje-evento__hora num">{e.hora ?? "dia"}</span>
                      <span className="hoje-evento__miolo" data-tipo={e.tipo}>
                        <b>{e.titulo}</b>
                        <small>{[e.projeto, e.local].filter(Boolean).join(" · ")}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hoje-agenda__vazio">
                <Icone nome="agenda" size={18} /> Nada na agenda hoje.
              </p>
            )}
            <Link className="hoje-agenda__mais" href="/app/agenda">
              {r.agenda.semana ? `+${r.agenda.semana} nos próximos 7 dias` : "Agenda"} <Icone nome="seta" size={14} />
            </Link>
          </Painel>

          <Painel titulo="Retornar hoje" href="/app/pedidos" classe="hoje-retornos">
            {r.retornos.length ? (
              <ul className="hoje-lista">
                {r.retornos.map((x) => (
                  <li key={`${x.alvo}-${x.id}`} className="hoje-retorno">
                    <Link href={x.alvo === "pedido" ? `/app/pedidos/${x.id}` : `/app/clientes/${x.id}`} className="hoje-retorno__miolo">
                      <b>{x.nome}</b>
                      <small>{x.nota ?? x.apoio ?? (x.alvo === "pedido" ? "Pedido" : "Cliente")}</small>
                    </Link>
                    <Prazo data={x.data} hoje={hoje} />
                    {escreve ? (
                      <span className="hoje-retorno__acoes">
                        <BotaoAcao
                          acao={contatoFeitoAcao}
                          campos={{ id: x.id, alvo: x.alvo }}
                          rotulo="Feito"
                          icone="check"
                          titulo="Marcar contato feito"
                          classe="glass-btn glass-btn--sm"
                        />
                        <BotaoAcao
                          acao={reagendarAcao}
                          campos={{ id: x.id, alvo: x.alvo, dias: "1" }}
                          rotulo="Amanhã"
                          titulo="Reagendar para amanhã"
                          classe="glass-btn glass-btn--sm"
                        />
                        <BotaoAcao
                          acao={reagendarAcao}
                          campos={{ id: x.id, alvo: x.alvo, dias: "7" }}
                          rotulo="+1 sem."
                          titulo="Reagendar para daqui a uma semana"
                          classe="q-limpar"
                        />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hoje-agenda__vazio">
                <Icone nome="retorno" size={18} /> Ninguém para retornar hoje.
              </p>
            )}
          </Painel>
        </div>

        <div className="hoje-paineis__col">
          <Painel titulo="Vencendo" href="/app/quadro">
            {r.vencendo.length ? (
              <ul className="hoje-lista">
                {r.vencendo.map((k) => (
                  <li key={k.id}>
                    <Link href={`/app/quadro?card=${encodeURIComponent(k.id)}`} className="hoje-item">
                      <i className="hoje-item__ponto" data-col={k.coluna} aria-hidden="true" />
                      <span className="hoje-item__miolo">
                        <b>{k.tema}</b>
                        {k.cliente ? <small>{k.cliente}</small> : null}
                      </span>
                      {k.prazo ? <Prazo data={k.prazo} hoje={hoje} /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hoje-agenda__vazio">
                <Icone nome="check" size={18} /> Nada vencendo.
              </p>
            )}
          </Painel>
          <Painel titulo="Com o cliente" href="/app/aprovacoes">
            {r.comCliente.length ? (
              <ul className="hoje-lista">
                {r.comCliente.map((k) => {
                  const dias = k.desde ? Math.max(0, diasEntre(k.desde, hoje)) : null;
                  return (
                    <li key={k.id}>
                      <Link href={`/app/quadro?card=${encodeURIComponent(k.id)}`} className="hoje-item">
                        <i className="hoje-item__anel" aria-hidden="true" />
                        <span className="hoje-item__miolo">
                          <b>{k.tema}</b>
                          {k.cliente ? <small>{k.cliente}</small> : null}
                        </span>
                        {dias != null ? (
                          <span className="funil-chip" data-sit="cliente">
                            {dias === 0 ? "hoje" : dias === 1 ? "1 dia" : `${dias} dias`}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="hoje-agenda__vazio">
                <Icone nome="aprovacoes" size={18} /> Nada esperando o cliente.
              </p>
            )}
          </Painel>
        </div>

        {d && r.semana ? (
          <div className="hoje-paineis__col">
            <Painel titulo="Caixa da semana" href="/app/financeiro/fluxo" classe="hoje-caixa">
              <CaixaDaSemana dias={r.semana} hoje={hoje} />
            </Painel>
          </div>
        ) : null}
      </div>

      <div className="hoje-grade">
        <Cartao
          i={i++}
          href="/app/quadro"
          icone="quadro"
          n={r.cards.vencemHoje + r.cards.atrasados}
          rotulo="Cards no prazo de hoje"
          apoio={
            r.cards.atrasados
              ? `${r.cards.atrasados} atrasado${r.cards.atrasados > 1 ? "s" : ""}`
              : r.cards.meus
                ? `${r.cards.meus} seu${r.cards.meus > 1 ? "s" : ""}`
                : "Em dia"
          }
          tom={r.cards.atrasados ? "perigo" : undefined}
        />
        <Cartao
          i={i++}
          href="/app/aprovacoes"
          icone="aprovacoes"
          n={r.cliente.pecas}
          rotulo="Peças com o cliente"
          apoio={r.cliente.lotes ? `${r.cliente.lotes} link${r.cliente.lotes > 1 ? "s" : ""} aberto${r.cliente.lotes > 1 ? "s" : ""}` : "Nenhum link aberto"}
        />
        <Cartao
          i={i++}
          href="/app/pedidos?ver=lista&etapa=novo"
          icone="pedidos"
          n={r.pedidosNovos}
          rotulo="Pedidos novos"
          apoio={r.pedidosNovos ? "Esperando orçamento" : "Caixa em dia"}
          tom={r.pedidosNovos ? "aviso" : undefined}
        />
        <Cartao
          i={i++}
          href="/app/orcamentos?status=enviado"
          icone="orcamento"
          n={r.orcamentos.aguardando}
          rotulo="Orçamentos aguardando"
          apoio={
            r.orcamentos.comAjuste
              ? `${r.orcamentos.comAjuste} com ajuste pedido`
              : dinheiro && r.orcamentos.valor
                ? brl(r.orcamentos.valor)
                : "Sem resposta pendente"
          }
          tom={r.orcamentos.comAjuste ? "aviso" : undefined}
        />
        {d ? (
          <>
            <Cartao
              i={i++}
              href="/app/financeiro/contas"
              icone="dinheiro"
              n={brl(d.receberSemana.valor + d.receberAtrasado.valor)}
              rotulo="A receber na semana"
              apoio={d.receberAtrasado.n ? `${brl(d.receberAtrasado.valor)} atrasado` : `${d.receberSemana.n} parcela${d.receberSemana.n === 1 ? "" : "s"}`}
              tom={d.receberAtrasado.n ? "aviso" : undefined}
            />
            <Cartao
              i={i++}
              href="/app/financeiro/contas"
              icone="dinheiro"
              n={brl(d.pagarSemana.valor + d.pagarAtrasado.valor)}
              rotulo="A pagar na semana"
              apoio={d.pagarAtrasado.n ? `${brl(d.pagarAtrasado.valor)} atrasado` : `${d.pagarSemana.n} conta${d.pagarSemana.n === 1 ? "" : "s"}`}
              tom={d.pagarAtrasado.n ? "perigo" : undefined}
            />
            <Cartao
              i={i++}
              href="/app/financeiro/fluxo"
              icone="dinheiro"
              n={brl(d.caixa)}
              rotulo="Caixa"
              apoio="Recebido menos pago"
              tom={d.caixa < 0 ? "perigo" : "ok"}
            />
            <Cartao
              i={i++}
              href="/app/financeiro/numeros"
              icone="numeros"
              n={meta ? `${Math.round((meta.faturado / meta.meta) * 100)}%` : "—"}
              rotulo="Meta do mês"
              apoio={meta ? `${brlCurto(meta.faturado)} de ${brlCurto(meta.meta)}` : "Defina em Números"}
              tom={meta && meta.faturado >= meta.meta ? "ok" : undefined}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
