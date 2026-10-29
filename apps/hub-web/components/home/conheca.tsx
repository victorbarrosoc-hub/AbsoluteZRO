'use client'
/**
 * "Conheça de perto", no espírito dos destaques da apple.com: uma ferramenta por vez, a tela real num MacBook e num
 * iPhone, três fatos e o site. Passa sozinha para a próxima quando a barra da aba ativa termina (animação CSS; o
 * React só troca o índice no fim). Pausa com o mouse em cima, com foco dentro ou fora da tela; com "reduzir
 * movimento" não passa sozinha.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ProductMark } from '@zro/ui'

/**
 * `emDesenvolvimento`: fechado ao público (ADR 0023); a ficha mostra o selo e nenhum link. `tela: false`: ainda sem a
 * foto nos aparelhos, mostra o ícone grande no lugar.
 */
export type Destaque = {
  id: string
  nome: string
  linha: string
  fatos: string[]
  site: string | null
  cor: CSSProperties
  emDesenvolvimento?: boolean
  tela?: boolean
}

export function Conheca({ itens }: { itens: Destaque[] }) {
  const [ativo, setAtivo] = useState(0)
  const [fora, setFora] = useState(true)
  const raiz = useRef<HTMLDivElement>(null)
  const abas = useRef<HTMLDivElement>(null)

  // no celular as abas rolam de lado: a ativa vem para o meio (só dentro da faixa, a página não pula)
  useEffect(() => {
    const faixa = abas.current
    const aba = faixa?.children[ativo] as HTMLElement | undefined
    if (!faixa || !aba || faixa.scrollWidth <= faixa.clientWidth) return
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    faixa.scrollTo({ left: aba.offsetLeft - (faixa.clientWidth - aba.clientWidth) / 2, behavior: suave ? 'smooth' : 'auto' })
  }, [ativo])

  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setFora(!e?.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const atual = itens[ativo]!
  return (
    <div ref={raiz} className="pconheca" data-pausa={fora ? 'sim' : undefined} style={atual.cor}>
      <div ref={abas} className="pconheca__abas" role="tablist" aria-label="Ferramentas">
        {itens.map((it, i) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            id={`aba-${it.id}`}
            aria-selected={i === ativo}
            aria-controls="pconheca-painel"
            className="pconheca__aba"
            onClick={() => setAtivo(i)}
          >
            <ProductMark productId={it.id} name={it.nome} size={40} />
            <span>{it.nome}</span>
            {i === ativo && <i className="pconheca__barra" aria-hidden="true" onAnimationEnd={() => setAtivo((ativo + 1) % itens.length)} />}
          </button>
        ))}
      </div>

      <div className="pconheca__palco" id="pconheca-painel" role="tabpanel" aria-labelledby={`aba-${atual.id}`}>
        <div className="pconheca__telas" aria-hidden="true">
          {itens.map((it, i) => (
            <span key={it.id} className={`pconheca__tela${it.tela === false ? ' pconheca__tela--icone' : ''}`} data-on={i === ativo ? 'sim' : undefined}>
              {it.tela === false ? (
                <ProductMark productId={it.id} name={it.nome} size={160} />
              ) : (
                <>
                  <img className="ahero__product--claro" src={`/brand/produto-${it.id}-claro.webp`} alt="" width={1600} height={971} loading="lazy" />
                  <img className="ahero__product--escuro" src={`/brand/produto-${it.id}-escuro.webp`} alt="" width={1600} height={971} loading="lazy" />
                </>
              )}
            </span>
          ))}
        </div>
        <div className="pconheca__ficha" key={atual.id}>
          <h3>{atual.nome}</h3>
          <p className="pconheca__linha">{atual.linha}</p>
          {atual.emDesenvolvimento && <span className="selo-dev">Em breve</span>}
          <ul>
            {atual.fatos.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {atual.site && !atual.emDesenvolvimento && (
            <a className="glass-btn" href={atual.site} target="_blank" rel="noopener noreferrer">
              Visitar o site
              <span className="zro-sr-only"> de {atual.nome} (abre em nova aba)</span>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
