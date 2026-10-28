import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brl, dataPorExtenso, hojeBr } from "@/lib/dinheiro";
import { resumoDoDia } from "@/lib/hoje";
import { podeVerDinheiro } from "@/lib/papeis";
import { Icone, type NomeIcone } from "@/components/icones";

export const metadata = { title: "Hoje" };

const SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

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

/**
 * Hoje (plano v2 §3, fase 19): o dia da produtora em números, cada um levando ao painel dele. Só contagens da organização
 * da sessão; o dinheiro só para administração e gestão.
 */
export default async function Hoje() {
  const s = await exigirAcessoNaPagina("/app/hoje");
  const hoje = hojeBr();
  const dinheiro = podeVerDinheiro(s.papel);
  const r = await resumoDoDia({ sub: s.sub, orgId: s.orgId }, dinheiro, hoje);
  const dia = SEMANA[new Date(`${hoje}T12:00:00Z`).getUTCDay()];
  const d = r.dinheiro;
  let i = 0;
  return (
    <div className="pagina">
      <header className="pagina__cabeca">
        <h1 className="atitle">
          {dia}, <strong>hoje.</strong>
        </h1>
        <p className="apoio">{dataPorExtenso(hoje)}</p>
      </header>

      <section className="hoje-agenda" aria-label="Agenda de hoje">
        {r.agenda.hoje.length ? (
          <ul>
            {r.agenda.hoje.map((e) => (
              <li key={e.id}>
                <Link href={`/app/agenda/${e.id}`} className="hoje-evento">
                  <span className="hoje-evento__hora num">{e.hora ?? "dia todo"}</span>
                  <span className="hoje-evento__miolo">
                    <b>{e.titulo}</b>
                    <small>{[e.projeto, e.local].filter(Boolean).join(" · ")}</small>
                  </span>
                  <Icone nome="seta" size={15} />
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
      </section>

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
          href="/app/pedidos?status=novo"
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
          </>
        ) : null}
      </div>
    </div>
  );
}
