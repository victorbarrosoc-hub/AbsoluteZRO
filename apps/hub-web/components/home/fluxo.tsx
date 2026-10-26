'use client'
/**
 * O fluxo entre as ferramentas, da equipe à entrega: a linha acende até a etapa ativa e, embaixo, os eventos que ela
 * manda para o HUB (os contratos de @zro/media-contracts). Avança sozinho pelo fim de uma animação CSS; clicar numa
 * etapa vai direto a ela. Fora da tela ou com "reduzir movimento", para.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ProductMark } from '@zro/ui'

export type Etapa = { id: string; nome: string; etapa: string; eventos: string[]; cor: CSSProperties }

export function Fluxo({ etapas }: { etapas: Etapa[] }) {
  const [ativo, setAtivo] = useState(0)
  const [fora, setFora] = useState(true)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setFora(!e?.isIntersecting), { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const atual = etapas[ativo]!
  const p = etapas.length > 1 ? ativo / (etapas.length - 1) : 0
  return (
    <div ref={raiz} className="pfluxo" data-pausa={fora ? 'sim' : undefined} style={{ ...atual.cor, '--avanco': p } as CSSProperties}>
      <div className="pfluxo__pista">
        <i className="pfluxo__linha" aria-hidden="true" />
        <ol className="pfluxo__trilho">
          {etapas.map((e, i) => (
            <li key={e.id} data-estado={i < ativo ? 'feito' : i === ativo ? 'ativo' : undefined} style={e.cor}>
              <button type="button" className="pfluxo__no" aria-current={i === ativo ? 'step' : undefined} onClick={() => setAtivo(i)}>
                <ProductMark productId={e.id} name={e.nome} size={44} />
                <span className="pfluxo__etapa">{e.etapa}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <i className="pfluxo__tempo" key={ativo} aria-hidden="true" onAnimationEnd={() => setAtivo((ativo + 1) % etapas.length)} />
      <div className="pfluxo__detalhe" key={atual.id}>
        <p className="pfluxo__passo">
          {ativo + 1} de {etapas.length}
        </p>
        <h3>
          <span>{atual.etapa}</span> {atual.nome}
        </h3>
        <ul aria-label={`Eventos que ${atual.nome} manda para o HUB`}>
          {atual.eventos.map((ev) => (
            <li key={ev}>
              <code>{ev}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
