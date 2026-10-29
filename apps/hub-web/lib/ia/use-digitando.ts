'use client'
/**
 * A sugestão que se escreve sozinha no campo da Z, no HUB. A conta e a ligação com o campo são as do painel das
 * plataformas (public/ia/v1/digitando.js): um módulo só, sem copiar a lógica. Aqui só se liga e desliga com o React.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { Digitando, ligarCampo } from '@/public/ia/v1/digitando.js'

/** Liga enquanto `ativo` (início da conversa, IA ligada e com crédito). O campo continua controlado pelo React. */
export function useDigitando(campo: RefObject<HTMLTextAreaElement | null>, fantasma: RefObject<HTMLElement | null>, frases: readonly string[], ativo: boolean) {
  const motor = useRef<Digitando | null>(null)
  const chave = frases.join('\n')

  useEffect(() => {
    const c = campo.current
    const f = fantasma.current
    if (!ativo || !c || !f || !chave) return
    motor.current ??= new Digitando()
    const m = motor.current
    if (m.frases.join('\n') !== chave) m.frases = chave.split('\n')
    return ligarCampo(c, f, m)
  }, [campo, fantasma, chave, ativo])
}
