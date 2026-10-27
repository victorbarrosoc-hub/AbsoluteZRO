'use client'
/**
 * Abertura da marca no app instalado no celular (Safari › Compartilhar › Adicionar à Tela de Início), a mesma do app
 * de computador: o anel se desenha, a estrela aparece inteira e recolhe, o nome entra e tudo some num fade. Só aparece
 * com o app aberto pelo ícone (display-mode standalone, no CSS) e uma vez por sessão; no navegador e no app de
 * computador (que tem a própria abertura) não aparece. Animação em CSS; com "reduzir movimento", só um fade curto.
 */
import { useEffect, useState } from 'react'
import { ZroWordmark } from '@zro/ui'
import { BrandSymbol } from './brand-symbol'

const CHAVE = 'zro-abertura-vista'

export function AberturaApp() {
  const [fim, setFim] = useState(false)
  useEffect(() => {
    if (window.zroDesktop) return setFim(true)
    try {
      if (sessionStorage.getItem(CHAVE)) setFim(true)
      else sessionStorage.setItem(CHAVE, '1')
    } catch {
      // sem sessionStorage (modo privado): mostra e segue
    }
  }, [])
  if (fim) return null
  return (
    <div className="abertura-app" aria-hidden="true" onAnimationEnd={(e) => e.target === e.currentTarget && setFim(true)}>
      <BrandSymbol className="abertura-app__simbolo" />
      <ZroWordmark className="abertura-app__nome" height={18} title="" />
    </div>
  )
}
