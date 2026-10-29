import Link from "next/link";
import { Contar } from "@/components/movimento";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brl, brlCurto, centavosParaCampo, hojeBr, mesCurto, mesPorExtenso, porcento, somarMeses } from "@/lib/dinheiro";
import { periodoDe, ritmoEsperado } from "@/lib/numeros/formulas";
import { numerosDoNegocio, type LinhaMargem } from "@/lib/numeros/servidor";
import { podeVerDinheiro } from "@/lib/papeis";
import { Pilulas } from "@/components/crm";
import { CabecaFinanceiro, SemDinheiro } from "@/components/financeiro";
import { Icone } from "@/components/icones";
import { MetaDoMes } from "@/components/meta";
import { Cifra, Cifras, Medidor } from "@/components/painel";

export const metadata = { title: "Números" };

function Margens({ titulo, linhas, href }: { titulo: string; linhas: LinhaMargem[]; href: (id: string) => string }) {
  return (
    <section className="secao" aria-label={titulo}>
      <header className="secao__topo">
        <h2>{titulo}</h2>
      </header>
      {linhas.length ? (
        <ul className="numeros-margens">
          {linhas.map((l) => (
            <li key={l.id}>
              <Link href={href(l.id)} className="numeros-margem">
                <span className="numeros-margem__nome">
                  <b>{l.nome}</b>
                  {l.apoio ? <small>{l.apoio}</small> : null}
                </span>
                <span className="numeros-margem__valor num" title={`Entrou ${brl(l.entradas)} · saiu ${brl(l.saidas)}`}>
                  {brlCurto(l.entradas)}
                </span>
                <Medidor
                  valor={l.margem ?? 0}
                  rotulo={`Margem ${porcento(l.margem)}`}
                  tom={l.margem == null ? undefined : l.margem < 0.2 ? "perigo" : l.margem < 0.4 ? "aviso" : "ok"}
                />
                <span className="numeros-margem__pct num">{porcento(l.margem)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="nada">Sem lançamentos ligados no período.</p>
      )}
    </section>
  );
}

function Barras({ itens, rotulo }: { itens: { nome: string; valor: number }[]; rotulo: (v: number) => string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="numeros-barras">
      {itens.map((i) => (
        <li key={i.nome}>
          <span className="numeros-barras__nome">{i.nome}</span>
          <span className="numeros-barras__trilho" aria-hidden="true">
            <i style={{ width: `${Math.max(2, Math.round((i.valor / max) * 100))}%` }} />
          </span>
          <span className="numeros-barras__valor num">{rotulo(i.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Números do negócio (estudo MakersHub §4.3; só administração e gestão, também no banco): meta do mês e progresso,
 * faturado e recebido, ticket médio, conversão (pedido → orçamento aprovado), taxa de ganho, margem por projeto e por
 * cliente, receita por nicho e os motivos de perda; período (mês, trimestre, ano). Só dados reais.
 */
export default async function Numeros({ searchParams }: PageProps<"/app/financeiro/numeros">) {
  const s = await exigirAcessoNaPagina("/app/financeiro/numeros");
  if (!podeVerDinheiro(s.papel))
    return (
      <div className="pagina">
        <CabecaFinanceiro ativa="/app/financeiro/numeros" />
        <SemDinheiro />
      </div>
    );
  const sp = await searchParams;
  const hoje = hojeBr();
  const p = periodoDe(sp.periodo, sp.mes, hoje);
  const r = await numerosDoNegocio({ sub: s.sub, orgId: s.orgId }, p);
  const href = (o: { periodo?: string; mes?: string }) => {
    const q = new URLSearchParams();
    const per = o.periodo ?? p.tipo;
    const mes = o.mes ?? p.mes;
    if (per !== "mes") q.set("periodo", per);
    if (mes !== hoje.slice(0, 7)) q.set("mes", mes);
    const t = q.toString();
    return t ? `/app/financeiro/numeros?${t}` : "/app/financeiro/numeros";
  };
  const ritmo = p.tipo === "mes" ? ritmoEsperado(p.mes, hoje) : null;
  const maxSerie = Math.max(1, ...r.serie.flatMap((m) => [m.faturado, m.meta ?? 0]));
  const vazio = !r.faturado && !r.recebido && !r.aprovados && !r.pedidos;
  return (
    <div className="pagina">
      <CabecaFinanceiro ativa="/app/financeiro/numeros" />
      <div className="filtros numeros-filtros">
        <Pilulas
          ativo={p.tipo}
          itens={[
            { valor: "mes", nome: "Mês", href: href({ periodo: "mes" }) },
            { valor: "tri", nome: "Trimestre", href: href({ periodo: "tri" }) },
            { valor: "ano", nome: "Ano", href: href({ periodo: "ano" }) },
          ]}
        />
        <nav className="mes-nav" aria-label="Período">
          <Link
            className="q-icone-btn"
            href={href({ mes: somarMeses(p.mes, p.tipo === "ano" ? -12 : p.tipo === "tri" ? -3 : -1) })}
            aria-label="Período anterior"
          >
            <Icone nome="voltar" size={16} />
          </Link>
          <strong>{p.tipo === "mes" ? mesPorExtenso(p.mes) : p.rotulo}</strong>
          <Link className="q-icone-btn" href={href({ mes: somarMeses(p.mes, p.tipo === "ano" ? 12 : p.tipo === "tri" ? 3 : 1) })} aria-label="Próximo período">
            <Icone nome="seta" size={16} />
          </Link>
        </nav>
      </div>

      <section className="numeros-meta-painel" aria-label="Meta">
        <div className="numeros-meta-painel__topo">
          <div>
            <span className="cifra__rotulo">Faturado</span>
            <strong className="numeros-grande num">{brl(r.faturado)}</strong>
            <span className="sutil">{r.meta ? `de ${brl(r.meta)} · ${porcento(r.progresso)}` : "Sem meta para o período"}</span>
          </div>
          {p.tipo === "mes" ? <MetaDoMes mes={p.mes} valor={centavosParaCampo(r.metaDoMes)} rotulo={mesPorExtenso(p.mes).split(" ")[0]} /> : null}
        </div>
        {r.meta ? (
          <div
            className="numeros-progresso"
            role="img"
            aria-label={`${porcento(r.progresso)} da meta${ritmo != null ? `; o esperado hoje é ${porcento(ritmo)}` : ""}`}
            data-tom={r.progresso != null && ritmo != null && r.progresso + 0.05 < ritmo ? "aviso" : r.progresso != null && r.progresso >= 1 ? "ok" : undefined}
          >
            <i style={{ width: `${Math.min(100, Math.round((r.progresso ?? 0) * 100))}%` }} />
            {ritmo != null && ritmo > 0 && ritmo < 1 ? <b style={{ left: `${Math.round(ritmo * 100)}%` }} title={`Esperado hoje: ${porcento(ritmo)}`} /> : null}
          </div>
        ) : null}
      </section>

      {vazio ? <p className="nada">Nada lançado nem vendido em {p.tipo === "mes" ? mesPorExtenso(p.mes) : p.rotulo}.</p> : null}

      <Cifras>
        <Cifra rotulo="Recebido" valor={brl(r.recebido)} apoio={`Despesas ${brlCurto(r.despesas)}`} />
        <Cifra
          rotulo="Ticket médio"
          valor={r.ticket ? brl(r.ticket) : "—"}
          apoio={`${r.aprovados} orçamento${r.aprovados === 1 ? "" : "s"} aprovado${r.aprovados === 1 ? "" : "s"}`}
        />
        <Cifra rotulo="Conversão" valor={porcento(r.conversao)} apoio={`${r.pedidosConvertidos} de ${r.pedidos} pedido${r.pedidos === 1 ? "" : "s"}`} />
        <Cifra
          rotulo="Taxa de ganho"
          valor={porcento(r.taxaGanho)}
          apoio={`${r.ganhos} ganho${r.ganhos === 1 ? "" : "s"} · ${r.perdidos} perdido${r.perdidos === 1 ? "" : "s"}`}
          tom={r.taxaGanho == null ? undefined : r.taxaGanho >= 0.5 ? "ok" : "aviso"}
        />
      </Cifras>

      <section className="secao" aria-label="Faturado por mês">
        <header className="secao__topo">
          <h2>Seis meses</h2>
          <span className="numeros-legenda">
            <span data-serie="entrada">
              <i aria-hidden="true" /> Faturado
            </span>
            <span data-serie="meta">
              <i aria-hidden="true" /> Meta
            </span>
          </span>
        </header>
        <figure className="numeros-serie" aria-label="Faturado e meta, mês a mês">
          {r.serie.map((m) => (
            <div key={m.mes} className="numeros-serie__mes" data-atual={m.mes === p.mes || undefined}>
              <div className="numeros-serie__barra">
                <span style={{ height: `${Math.round((m.faturado / maxSerie) * 100)}%` }} title={`${mesCurto(m.mes)}: ${brl(m.faturado)}`} />
                {m.meta ? <b style={{ bottom: `${Math.round((m.meta / maxSerie) * 100)}%` }} title={`Meta: ${brl(m.meta)}`} /> : null}
              </div>
              <span className="numeros-serie__rotulo">{mesCurto(m.mes)}</span>
              <span className="numeros-serie__valor num">{m.faturado ? brlCurto(m.faturado) : "—"}</span>
            </div>
          ))}
          <table className="sr-only">
            <caption>Faturado e meta por mês</caption>
            <tbody>
              {r.serie.map((m) => (
                <tr key={m.mes}>
                  <th>{m.mes}</th>
                  <td>{brl(m.faturado)}</td>
                  <td>{m.meta ? brl(m.meta) : "sem meta"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      </section>

      <div className="painel">
        <Margens titulo="Margem por projeto" linhas={r.projetos} href={(id) => `/app/projetos/${id}`} />
        <div className="painel__lado">
          <Margens titulo="Clientes que mais faturam" linhas={r.clientes} href={(id) => `/app/clientes/${id}`} />
          <section className="secao" aria-label="Receita por nicho">
            <header className="secao__topo">
              <h2>Por nicho</h2>
            </header>
            {r.nichos.length ? <Barras itens={r.nichos} rotulo={brlCurto} /> : <p className="nada">Nenhum orçamento aprovado no período.</p>}
          </section>
          {r.motivosPerda.length ? (
            <section className="secao" aria-label="Motivos de perda">
              <header className="secao__topo">
                <h2>Por que perdemos</h2>
              </header>
              <Barras itens={r.motivosPerda} rotulo={(v) => String(v)} />
            </section>
          ) : null}
        </div>
      </div>
      <Contar />
    </div>
  );
}
