'use client'
/**
 * Fluidez entre telas (pedido do titular, 29/10/2026: "abrir uma aba tem que ser como no Synquei"):
 * - `Transicao`: a troca de tela é da casa, com a View Transitions API chamada aqui (não pelo `<ViewTransition>` do
 *   React: no Safari do iPhone o par "sai/entra" do React deixava a tela velha e a nova uma sobre a outra). O clique
 *   num link de menu (`LinkIntencao` com `transitionTypes`) é segurado na captura; a tela atual vira o grupo `z-sai`,
 *   o Next navega dentro da transição e a tela nova, quando monta, vira `z-entra`. A velha some em 110 ms e só então a
 *   nova entra (frente = da direita, volta = da esquerda): nunca as duas juntas. CSS em app/globals.css (bloco "troca
 *   de tela"); com "reduzir movimento", sem a API ou com tecla modificadora, o Next navega sozinho, na hora. O menu, o
 *   topo e a cápsula do site ficam parados. Mesmo desenho do Maestro (products/maestro/src/components/movimento.tsx).
 * - `LinkIntencao`: o esqueleto já vem pela pré-busca automática; com a intenção (mouse em cima, foco, toque), a tela
 *   inteira com os dados, para a troca ser imediata. O cache do roteador é deste navegador (staleTimes em
 *   next.config.ts) e toda Server Action com revalidatePath o limpa.
 */
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { startTransition, useEffect, useState, type ComponentProps, type ReactNode } from 'react'

type Roteador = ReturnType<typeof useRouter>

/** Quanto a troca segura a foto da tela velha: até a nova montar e, se veio o esqueleto, pelo conteúdo. */
const ESPERA_TELA = 900
const ESPERA_CONTEUDO = 320

let ativa: ViewTransition | null = null

function esperarTela(caminho: string): Promise<HTMLElement | null> {
  const main = document.getElementById('conteudo')
  if (!main) return Promise.resolve(null)
  const t0 = performance.now()
  const achar = () => [...main.querySelectorAll<HTMLElement>(':scope > .z-pagina')].find((el) => el.dataset.caminho === caminho) ?? null
  return new Promise((pronto) => {
    const obs = new MutationObserver(() => olhar())
    let meio = 0
    let fim = 0
    const terminar = (el: HTMLElement | null) => {
      obs.disconnect()
      clearTimeout(meio)
      clearTimeout(fim)
      pronto(el)
    }
    function olhar() {
      const nova = achar()
      const esqueleto = nova?.querySelector(':scope > [aria-busy="true"]')
      if (nova && (!esqueleto || performance.now() - t0 > ESPERA_CONTEUDO)) terminar(nova)
    }
    obs.observe(main, { childList: true, subtree: true })
    meio = window.setTimeout(olhar, ESPERA_CONTEUDO + 5)
    fim = window.setTimeout(() => terminar(achar()), ESPERA_TELA)
    olhar()
  })
}

function instalar(router: Roteador) {
  const aoClicar = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.('a[href]')
    if (!(a instanceof HTMLAnchorElement) || a.dataset.transicao === undefined) return
    if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return
    const url = new URL(a.href, location.href)
    if (url.origin !== location.origin || url.pathname === location.pathname) return
    if (!('startViewTransition' in document) || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (ativa) {
      ativa.skipTransition()
      return
    }
    const velha = [...document.querySelectorAll<HTMLElement>('#conteudo > .z-pagina')].at(-1)
    if (!velha) return

    e.preventDefault() // o next/link não navega (confere defaultPrevented); os onClick do React rodam normalmente
    const destino = url.pathname + url.search + url.hash
    const raiz = document.documentElement
    raiz.dataset.zSentido = a.dataset.transicao === 'volta' ? 'volta' : a.dataset.transicao === 'frente' ? 'frente' : 'troca'
    velha.style.viewTransitionName = 'z-sai'
    let nova: HTMLElement | null = null
    let vt: ViewTransition
    try {
      vt = document.startViewTransition(async () => {
        startTransition(() => router.push(destino))
        nova = await esperarTela(url.pathname)
        if (nova) nova.style.viewTransitionName = 'z-entra'
        else vt.skipTransition()
      })
    } catch {
      velha.style.viewTransitionName = ''
      delete raiz.dataset.zSentido
      router.push(destino)
      return
    }
    ativa = vt
    // pular a troca (dois toques seguidos, tela que não chegou) rejeita estas promessas: não é erro
    const nada = () => {}
    vt.ready.catch(nada)
    vt.updateCallbackDone.catch(nada)
    vt.finished.catch(nada).finally(() => {
      if (ativa === vt) ativa = null
      velha.style.viewTransitionName = ''
      if (nova) (nova as HTMLElement).style.viewTransitionName = ''
      if (!ativa) delete raiz.dataset.zSentido
    })
  }
  document.addEventListener('click', aoClicar, true)
  return () => document.removeEventListener('click', aoClicar, true)
}

/** O invólucro de cada tela (uma caixa por caminho: é ela que vira `z-sai`/`z-entra`). */
export function Transicao({ children }: { children: ReactNode }) {
  const caminho = usePathname()
  const router = useRouter()
  useEffect(() => instalar(router), [router])
  return (
    <div className="z-pagina" key={caminho} data-caminho={caminho}>
      {children}
    </div>
  )
}

/** Frente ou volta, pela ordem dos itens de um menu (o primeiro item que casa com cada caminho). */
export function sentido(ordem: string[], de: string, para: string): 'z-frente' | 'z-volta' {
  const i = (c: string) => ordem.findIndex((h) => c === h || c.startsWith(h + '/'))
  return i(para) >= i(de) ? 'z-frente' : 'z-volta'
}

/**
 * Link de menu: pré-busca com a intenção e, com `transitionTypes` (`z-frente`/`z-volta`), entra na troca animada
 * (`data-transicao` com o sentido, lido pela `Transicao`).
 */
export function LinkIntencao({ onPointerEnter, onFocus, onTouchStart, transitionTypes, ...props }: ComponentProps<typeof Link>) {
  const [intencao, setIntencao] = useState(false)
  const tipos = transitionTypes ?? []
  const transicao = tipos.includes('z-volta') ? 'volta' : tipos.includes('z-frente') ? 'frente' : tipos.length ? 'troca' : undefined
  return (
    <Link
      {...props}
      data-transicao={transicao}
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
