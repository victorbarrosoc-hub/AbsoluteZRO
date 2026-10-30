import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { notFound } from 'next/navigation'
import { after } from 'next/server'
import {
  atualizarDolar,
  CUSTO_CATEGORIAS,
  CUSTO_ESTADOS,
  CUSTO_PERIODICIDADES,
  dadosFinanceiros,
  dolarPrecisaAtualizar,
  fmtDiaBR,
  fmtMoeda,
  hojeNoFuso,
  lerConfigCustos,
  lerGastoDoLab,
  listarCustos,
  mensalDoItem,
  pontoDeEquilibrio,
  progressoDasMetas,
  recomendacoes,
  requirePlatformAdmin,
  resumoCustos,
  type Custo,
  type Recomendacao,
} from '@zro/core'
import { ContaAte } from '@/components/admin/custos/conta-ate'
import { ConfigCustos } from '@/components/admin/custos/config'
import { DolarCustos } from '@/components/admin/custos/dolar'
import { PorFornecedor, Progresso, Projecao, Rosca } from '@/components/admin/custos/graficos'
import { CustosItens, type ItemVista } from '@/components/admin/custos/itens'
import { db, getAuth } from '@/lib/session'
import './custos.css'

export const metadata: Metadata = { title: 'Custos · Console', robots: { index: false, follow: false } }

const POR: Record<string, string> = { mensal: '/mês', anual: '/ano' }

function vista(c: Custo): ItemVista {
  if (c.periodicidade === 'por_uso')
    return {
      ...c,
      valorTexto: c.valor > 0 ? `${fmtMoeda(c.valor, c.moeda)} est.` : 'Por uso',
      mesTexto: c.tetoMensal != null ? `teto ${fmtMoeda(c.tetoMensal, c.moeda)}` : null,
    }
  return {
    ...c,
    valorTexto: `${fmtMoeda(c.valor, c.moeda)}${POR[c.periodicidade]}`,
    mesTexto: c.periodicidade === 'anual' && c.valor > 0 ? `${fmtMoeda(mensalDoItem(c), c.moeda)}/mês` : null,
  }
}

const TOM: Record<Recomendacao['tom'], string> = { economia: 'ok', atencao: 'warn', info: 'faint' }

export default async function Custos() {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria. Custos: só admin.
  if (!auth?.user.platformRole || !auth.user.emailVerified || auth.user.platformRole !== 'admin') notFound()
  requirePlatformAdmin(auth, ['admin'])
  const d = await db().asSystem('admin: custos', async (tx) => ({
    custos: await listarCustos(tx),
    config: await lerConfigCustos(tx),
    fin: await dadosFinanceiros(tx),
    produtos: (await tx`select id, name from zro.products order by step_order`).map((p) => ({ id: p.id as string, name: p.name as string })),
    // Laboratório da Z (ADR 0033): o uso de cada chamada paga, registrado com o custo estimado.
    lab: await lerGastoDoLab(tx),
  }))
  const hoje = hojeNoFuso()
  // Dólar do Banco Central com mais de 24 h: busca depois de responder (a página não espera). O próximo acesso já vê.
  if (dolarPrecisaAtualizar({ buscadaEm: d.config.cotacaoAutoBuscadaEm, erroEm: d.config.cotacaoAutoErroEm }))
    after(() => atualizarDolar(db()).then(() => undefined))
  const resumo = resumoCustos(d.custos, d.config, hoje)
  const recs = recomendacoes({ custos: d.custos, resumo, config: d.config, dados: d.fin, hoje })
  const equilibrio = pontoDeEquilibrio(resumo.mensal.brl, d.fin.planos)
  const metas = progressoDasMetas(d.config, d.fin, hoje)
  // Nos gráficos, de 100 para cima sem centavos (o número exato fica na planilha).
  const fmtBase = (v: number) => fmtMoeda(v >= 100 ? Math.round(v) : v, resumo.base)
  const totalBase = resumo.categorias.reduce((n, c) => n + c.valor, 0)
  const mensalPrincipal = resumo.mensal.brl ?? resumo.mensal.usd
  const moedaPrincipal = resumo.mensal.brl != null ? 'BRL' : 'USD'
  const anualPrincipal = moedaPrincipal === 'BRL' ? resumo.anual.brl : resumo.anual.usd
  const cobertura = resumo.mensal.brl && resumo.mensal.brl > 0 ? d.fin.receita.mensalBRL / resumo.mensal.brl : null

  return (
    <div className="page adm-page cst">
      <header className="adm-head">
        <h1>Custo do ecossistema</h1>
        <p>Quanto custa manter tudo no ar.</p>
      </header>

      <section className="cst-hero" aria-label="Resumo">
        <div className="cst-hero__mes">
          <span className="cst-hero__rotulo">Por mês hoje</span>
          <span className="cst-hero__n">{mensalPrincipal != null ? <ContaAte valor={mensalPrincipal} moeda={moedaPrincipal} /> : '—'}</span>
          <span className="cst-hero__sub">
            {moedaPrincipal === 'BRL' && resumo.mensal.usd != null ? fmtMoeda(resumo.mensal.usd, 'USD') : ''}
            {resumo.uso.length > 0 && (
              <span className="cst-uso" title={resumo.uso.map((u) => u.nome).join(', ')}>
                + uso
              </span>
            )}
          </span>
        </div>
        <div className="cst-hero__lado">
          <div className="kpi" style={{ '--i': 1 } as CSSProperties}>
            <span className="kpi__label">Por ano</span>
            <span className="kpi__value">{anualPrincipal != null ? <ContaAte valor={anualPrincipal} moeda={moedaPrincipal} duracao={1300} /> : '—'}</span>
            <span className="kpi__hint">
              {moedaPrincipal === 'BRL' && resumo.anual.usd != null ? `${fmtMoeda(resumo.anual.usd, 'USD')} · ` : ''}anual ÷ 12 no mês
            </span>
          </div>
          <div className="kpi" style={{ '--i': 2 } as CSSProperties}>
            <span className="kpi__label">Dólar hoje</span>
            <DolarCustos config={d.config} hoje={hoje} />
            {resumo.aConferir > 0 && (
              <a className="kpi__hint cst-conferir" href="#lista">
                {resumo.aConferir} {resumo.aConferir === 1 ? 'item' : 'itens'} a conferir
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="adm-grid">
        <section className="adm-card" aria-labelledby="por-categoria">
          <h2 id="por-categoria">
            Por categoria <span className="adm-card__aside">por mês</span>
          </h2>
          <Rosca partes={resumo.categorias} rotulos={CUSTO_CATEGORIAS} fmt={fmtBase} total={totalBase} />
        </section>
        <section className="adm-card" aria-labelledby="por-fornecedor">
          <h2 id="por-fornecedor">
            Por fornecedor <span className="adm-card__aside">por mês</span>
          </h2>
          <PorFornecedor itens={resumo.fornecedores} fmt={fmtBase} />
        </section>
      </div>

      <section className="adm-card" aria-labelledby="projecao">
        <h2 id="projecao">
          Próximos 12 meses <span className="adm-card__aside">{resumo.semData.length ? `${resumo.semData.length} sem data` : 'mensalizado'}</span>
        </h2>
        <Projecao meses={resumo.projecao} fmt={fmtBase} />
        {resumo.semData.length > 0 && (
          <p className="adm-hint" title={resumo.semData.map((s) => `${s.nome}${s.gatilho ? `: ${s.gatilho}` : ''}`).join('\n')}>
            Fora do gráfico até ganhar um mês estimado: {resumo.semData.map((s) => s.nome).join(', ')}.
          </p>
        )}
      </section>

      <div className="adm-grid">
        <section className="adm-card cst-eq" aria-labelledby="equilibrio">
          <h2 id="equilibrio">
            Ponto de equilíbrio <span className="adm-card__aside">assinantes por plano</span>
          </h2>
          {resumo.mensal.brl == null ? (
            <p className="adm-empty">Sem cotação do dólar, não dá para comparar com os planos ainda.</p>
          ) : equilibrio.length ? (
            <ul className="cst-eq__planos">
              {equilibrio.map((p, i) => (
                <li key={p.nome} style={{ '--i': i } as CSSProperties} title={`${p.nome}: ${fmtMoeda(p.precoMensal, 'BRL')} por mês`}>
                  <strong className="cst-eq__n">{p.assinantes}</strong>
                  <span className="cst-eq__nome">{p.nome}</span>
                  <span className="cst-eq__preco">{fmtMoeda(p.precoMensal, 'BRL')}/mês</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="adm-empty">Nenhum plano pago publicado.</p>
          )}
          <div className="cst-eq__hoje">
            <div className="cst-eq__linha">
              <span>Receita hoje</span>
              <strong>
                {fmtMoeda(d.fin.receita.mensalBRL, 'BRL')}
                <span className="zro-faint">
                  {' '}
                  · {d.fin.receita.assinantes} {d.fin.receita.assinantes === 1 ? 'assinante pago' : 'assinantes pagos'}
                </span>
              </strong>
            </div>
            {cobertura != null && <Progresso fracao={cobertura} rotulo={`Receita cobre ${Math.round(cobertura * 100)}% do custo`} />}
          </div>
          {metas.receita || metas.assinantes || metas.diasAteAlvo != null ? (
            <div className="cst-metas">
              {metas.receita && (
                <div className="cst-eq__linha cst-eq__linha--meta">
                  <span>Meta de receita</span>
                  <strong>
                    {fmtMoeda(metas.receita.atual, 'BRL')} <span className="zro-faint">de {fmtMoeda(metas.receita.meta, 'BRL')}</span>
                  </strong>
                  <Progresso fracao={metas.receita.fracao} rotulo="Meta de receita" />
                </div>
              )}
              {metas.assinantes && (
                <div className="cst-eq__linha cst-eq__linha--meta">
                  <span>Meta de assinantes</span>
                  <strong>
                    {metas.assinantes.atual} <span className="zro-faint">de {metas.assinantes.meta}</span>
                  </strong>
                  <Progresso fracao={metas.assinantes.fracao} rotulo="Meta de assinantes" />
                </div>
              )}
              {metas.diasAteAlvo != null && d.config.dataAlvo && (
                <div className="cst-eq__linha">
                  <span>Data-alvo</span>
                  <strong>
                    {fmtDiaBR(d.config.dataAlvo)}{' '}
                    <span className="zro-faint">
                      ·{' '}
                      {metas.diasAteAlvo >= 0
                        ? `faltam ${metas.diasAteAlvo} ${metas.diasAteAlvo === 1 ? 'dia' : 'dias'}`
                        : `passou há ${-metas.diasAteAlvo} ${metas.diasAteAlvo === -1 ? 'dia' : 'dias'}`}
                    </span>
                  </strong>
                </div>
              )}
              <ConfigCustos config={d.config}>Mudar metas</ConfigCustos>
            </div>
          ) : (
            <ConfigCustos config={d.config} className="glass-btn cst-btn cst-eq__definir">
              Definir metas
            </ConfigCustos>
          )}
        </section>

        <section className="adm-card" aria-labelledby="recomendacoes">
          <h2 id="recomendacoes">Recomendações</h2>
          {recs.length ? (
            <ul className="cst-recs">
              {recs.map((r, i) => (
                <li key={r.id} className={`cst-rec cst-rec--${TOM[r.tom]}`} style={{ '--i': i } as CSSProperties}>
                  <span className="cst-rec__ponto" aria-hidden="true" />
                  <span className="cst-rec__texto">
                    <strong>{r.titulo}</strong>
                    {r.detalhe && <span>{r.detalhe}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="adm-empty">Tudo em ordem.</p>
          )}
        </section>
      </div>

      <section className="adm-card" aria-labelledby="laboratorio-z">
        <h2 id="laboratorio-z">
          Laboratório da Z <span className="adm-card__aside">uso estimado, US$</span>
        </h2>
        <div className="cst-lab">
          <div className="kpi">
            <span className="kpi__label">Hoje</span>
            <span className="kpi__value">{fmtMoeda(d.lab.hoje, 'USD')}</span>
            <span className="kpi__hint">{d.lab.teto == null ? 'sem teto: bloqueado' : `teto ${fmtMoeda(d.lab.teto, 'USD')}/dia`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__label">Este mês</span>
            <span className="kpi__value">{fmtMoeda(d.lab.mes, 'USD')}</span>
            <span className="kpi__hint">
              {(
                [
                  ['claude', 'Claude'],
                  ['voz', 'voz'],
                  ['escuta', 'escuta'],
                  ['transcricao', 'transcrição'],
                  ['design', 'criar voz'],
                ] as const
              )
                .filter(([k]) => d.lab.porServico[k] > 0)
                .map(([k, nome]) => `${nome} ${fmtMoeda(d.lab.porServico[k], 'USD')}`)
                .join(' · ') || 'nada ainda'}
            </span>
          </div>
        </div>
      </section>

      <CustosItens
        itens={d.custos.map(vista)}
        categorias={CUSTO_CATEGORIAS}
        estados={CUSTO_ESTADOS}
        periodicidades={CUSTO_PERIODICIDADES}
        produtos={d.produtos}
        hoje={hoje}
      />
    </div>
  )
}
