'use client'
/**
 * O fluxo entre as ferramentas, da pauta à aprovação: a linha acende até a etapa ativa e, embaixo, o que ela avisa ao HUB
 * (`avisos`: cada um é um contrato de @zro/media-contracts; o nome técnico fica na dica) ou, se a ferramenta ainda não
 * avisa nada, o que ela faz ali. A trilha tem uma coluna por etapa (--n) e a linha vai do centro da primeira ao da
 * última, sem sobra. Avança sozinho pelo fim de uma animação CSS; clicar numa etapa vai direto a ela. Fora da tela ou
 * com "reduzir movimento", para.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ProductMark } from '@zro/ui'

export type Etapa = {
  /** Única por etapa: a mesma ferramenta pode aparecer em duas (o Maestro na pauta e na aprovação). */
  chave: string
  id: string
  nome: string
  etapa: string
  itens: { id: string; nome: string }[]
  /** `itens` são avisos ao HUB (contratos); senão, o que a ferramenta faz nessa etapa. */
  avisos: boolean
  cor: CSSProperties
}

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
      <div className="pfluxo__pista" style={{ '--n': etapas.length } as CSSProperties}>
        <i className="pfluxo__linha" aria-hidden="true" />
        <ol className="pfluxo__trilho">
          {etapas.map((e, i) => (
            <li key={e.chave} data-estado={i < ativo ? 'feito' : i === ativo ? 'ativo' : undefined} style={e.cor}>
              <button type="button" className="pfluxo__no" aria-current={i === ativo ? 'step' : undefined} onClick={() => setAtivo(i)}>
                <ProductMark productId={e.id} name={e.nome} size={44} />
                <span className="pfluxo__etapa">{e.etapa}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <i className="pfluxo__tempo" key={ativo} aria-hidden="true" onAnimationEnd={() => setAtivo((ativo + 1) % etapas.length)} />
      <div className="pfluxo__detalhe" key={atual.chave}>
        <p className="pfluxo__passo">
          {ativo + 1} de {etapas.length}
        </p>
        <h3>
          <span>{atual.etapa}</span> {atual.nome}
        </h3>
        <ul aria-label={atual.avisos ? `O que ${atual.nome} avisa ao HUB` : `O que ${atual.nome} faz nesta etapa`}>
          {atual.itens.map((ev) => (
            <li key={ev.id} title={atual.avisos ? ev.id : undefined}>
              {ev.nome}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
