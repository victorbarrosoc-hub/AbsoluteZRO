/**
 * Gráficos dos custos (/admin/custos): rosca por categoria, barras por fornecedor e projeção de 12 meses empilhada.
 * SVG e CSS, sem biblioteca. Cada marca tem o valor no title; cada gráfico tem rótulo para leitor de tela e tabela
 * escondida. O traço se desenha na entrada (CSS) e fica parado com "reduzir movimento".
 */
import type { CSSProperties } from 'react'
import type { CustoCategoria } from '@zro/core'

export type Fmt = (v: number) => string

/** Rosca: uma cor fixa por categoria (a cor segue a categoria, não a posição). */
export function Rosca({
  partes,
  rotulos,
  fmt,
  total,
}: {
  partes: { categoria: CustoCategoria; valor: number }[]
  rotulos: Record<string, string>
  fmt: Fmt
  total: number
}) {
  if (!partes.length || total <= 0) return <p className="adm-empty">Nenhum custo fixo ativo.</p>
  const GAP = partes.length > 1 ? 0.8 : 0
  let acumulado = 0
  const arcos = partes.map((p, i) => {
    const pct = (p.valor / total) * 100
    const arco = { ...p, pct, inicio: acumulado, i }
    acumulado += pct
    return arco
  })
  const resumo = arcos.map((a) => `${rotulos[a.categoria]}: ${fmt(a.valor)} (${Math.round(a.pct)}%)`).join(', ')
  return (
    <div className="cst-rosca">
      <div className="cst-rosca__fig">
        <svg viewBox="0 0 120 120" role="img" aria-label={`Por categoria, por mês: ${resumo}.`}>
          <circle cx="60" cy="60" r="48" pathLength={100} className="cst-rosca__trilho" />
          <g transform="rotate(-90 60 60)">
            {arcos.map((a) => (
              <circle
                key={a.categoria}
                cx="60"
                cy="60"
                r="48"
                pathLength={100}
                className={`cst-rosca__arco cst-cat--${a.categoria}`}
                strokeDasharray={`${Math.max(a.pct - GAP, 0.4)} 100`}
                strokeDashoffset={-a.inicio}
                style={{ '--i': a.i } as CSSProperties}
              >
                <title>{`${rotulos[a.categoria]}: ${fmt(a.valor)} por mês (${Math.round(a.pct)}%)`}</title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="cst-rosca__centro" aria-hidden="true">
          <strong>{fmt(total)}</strong>
          <span>por mês</span>
        </div>
      </div>
      <ul className="cst-legenda">
        {arcos.map((a) => (
          <li key={a.categoria}>
            <span className={`cst-legenda__cor cst-cat--${a.categoria}`} aria-hidden="true" />
            <span className="cst-legenda__nome">{rotulos[a.categoria]}</span>
            <span className="cst-legenda__valor">{fmt(a.valor)}</span>
            <span className="cst-legenda__pct">{Math.round(a.pct)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Barras horizontais por fornecedor (uma série: cor única, sem legenda). */
export function PorFornecedor({ itens, fmt }: { itens: { fornecedor: string; valor: number }[]; fmt: Fmt }) {
  if (!itens.length) return <p className="adm-empty">Nenhum custo fixo ativo.</p>
  const max = Math.max(...itens.map((i) => i.valor))
  return (
    <ul className="hbars">
      {itens.map((it, i) => (
        <li key={it.fornecedor} title={`${it.fornecedor}: ${fmt(it.valor)} por mês`}>
          <div className="hbars__row">
            <span className="hbars__name">
              <span>{it.fornecedor}</span>
            </span>
            <span className="hbars__n">{fmt(it.valor)}</span>
            <span className="hbars__track" aria-hidden="true">
              <span className="hbars__bar" style={{ width: `${(it.valor / max) * 100}%`, '--i': i } as CSSProperties} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const ESTADOS = [
  { k: 'ativo', rotulo: 'Ativo' },
  { k: 'previsto', rotulo: 'Previsto' },
  { k: 'futuro', rotulo: 'Futuro' },
] as const

/** Próximos 12 meses: barras empilhadas (ativo embaixo, depois previsto e futuro). */
export function Projecao({ meses, fmt }: { meses: { mes: string; ativo: number; previsto: number; futuro: number }[]; fmt: Fmt }) {
  const totais = meses.map((m) => m.ativo + m.previsto + m.futuro)
  const max = Math.max(0, ...totais)
  if (max <= 0) return <p className="adm-empty">Nada previsto para os próximos 12 meses.</p>
  const nome = (mes: string) => `${MES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`
  const usados = ESTADOS.filter((e) => meses.some((m) => m[e.k] > 0))
  return (
    <figure className="cst-proj">
      <div
        className="cst-proj__plot"
        role="img"
        aria-label={`Próximos 12 meses: de ${fmt(totais[0] ?? 0)} em ${nome(meses[0]!.mes)} a ${fmt(totais.at(-1) ?? 0)} em ${nome(meses.at(-1)!.mes)}. Pico de ${fmt(max)}.`}
      >
        <span className="cst-proj__max" aria-hidden="true">
          {fmt(max)}
        </span>
        {meses.map((m, i) => {
          const total = totais[i]!
          return (
            <div
              key={m.mes}
              className="cst-proj__col"
              title={`${nome(m.mes)}: ${fmt(total)}${usados.length > 1 ? ` · ${usados.map((e) => `${e.rotulo.toLowerCase()} ${fmt(m[e.k])}`).join(' · ')}` : ''}`}
            >
              <div className="cst-proj__pilha" style={{ height: `${(total / max) * 100}%`, '--i': i } as CSSProperties}>
                {ESTADOS.map((e) => (m[e.k] > 0 ? <span key={e.k} className={`cst-proj__parte cst-est--${e.k}`} style={{ flexGrow: m[e.k] }} /> : null))}
              </div>
              <span className="cst-proj__mes" aria-hidden="true">
                {MES[Number(m.mes.slice(5, 7)) - 1]}
              </span>
            </div>
          )
        })}
      </div>
      {usados.length > 1 && (
        <figcaption className="cst-proj__legenda">
          {usados.map((e) => (
            <span key={e.k}>
              <span className={`cst-legenda__cor cst-est--${e.k}`} aria-hidden="true" />
              {e.rotulo}
            </span>
          ))}
        </figcaption>
      )}
      <table className="zro-sr-only">
        <caption>Projeção por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            {ESTADOS.map((e) => (
              <th key={e.k} scope="col">
                {e.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.mes}>
              <th scope="row">{nome(m.mes)}</th>
              {ESTADOS.map((e) => (
                <td key={e.k}>{fmt(m[e.k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** Barra de progresso fina (metas, receita × custo). */
export function Progresso({ fracao, rotulo }: { fracao: number; rotulo: string }) {
  const pct = Math.max(0, Math.min(1, fracao)) * 100
  return (
    <span className="cst-prog" role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span className="cst-prog__barra" style={{ width: `${pct}%` }} />
    </span>
  )
}
