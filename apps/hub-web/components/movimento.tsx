'use client'
/**
 * Fluidez entre telas (pedido do titular, 29/10/2026: "abrir uma aba tem que ser como no Synquei"):
 * - `Transicao`: a tela nova entra com a View Transitions API do navegador (React `<ViewTransition>`), deslizando do
 *   lado para onde a pessoa foi no menu (frente/volta) ou subindo 8 px (links de dentro da tela, voltar do navegador).
 *   O menu e o topo ficam parados. CSS em app/globals.css (bloco "troca de tela"); com "reduzir movimento", na hora.
 * - `LinkIntencao`: o esqueleto já vem pela pré-busca automática; com a intenção (mouse em cima, foco, toque), a tela
 *   inteira com os dados, para a troca ser imediata. O cache do roteador é deste navegador (staleTimes em
 *   next.config.ts) e toda Server Action com revalidatePath o limpa.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, ViewTransition, type ComponentProps, type ReactNode } from 'react'

const TIPOS = { 'z-frente': 'z-frente', 'z-volta': 'z-volta', default: 'z-troca' }

export function Transicao({ children }: { children: ReactNode }) {
  const caminho = usePathname()
  return (
    <ViewTransition key={caminho} enter={TIPOS} exit={TIPOS} default="none">
      {children}
    </ViewTransition>
  )
}

/** Frente ou volta, pela ordem dos itens de um menu (o primeiro item que casa com cada caminho). */
export function sentido(ordem: string[], de: string, para: string): 'z-frente' | 'z-volta' {
  const i = (c: string) => ordem.findIndex((h) => c === h || c.startsWith(h + '/'))
  return i(para) >= i(de) ? 'z-frente' : 'z-volta'
}

export function LinkIntencao({ onPointerEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [intencao, setIntencao] = useState(false)
  return (
    <Link
      {...props}
      prefetch={intencao ? true : props.prefetch}
      onPointerEnter={(e) => {
        setIntencao(true)
        onPointerEnter?.(e)
      }}
      onFocus={(e) => {
        setIntencao(true)
        onFocus?.(e)
      }}
      onTouchStart={(e) => {
        setIntencao(true)
        onTouchStart?.(e)
      }}
    />
  )
}
