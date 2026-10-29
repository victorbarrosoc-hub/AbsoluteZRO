'use client'
/**
 * Celular: instalar o Absolute ZRO na tela de início (app da web). O iPhone não deixa um app instalar outros, então
 * no celular o Absolute ZRO é o ponto de partida: abre cada ferramenta já logada e guia a instalação de cada uma.
 * Android/Chrome: um toque (beforeinstallprompt). iPhone/iPad: o caminho pelo Compartilhar. Já instalado: some.
 */
import { useEffect, useState } from 'react'
import { Icon } from './icons'

type PedidoDeInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export function InstalarHub() {
  const [modo, setModo] = useState<'android' | 'ios' | null>(null)
  const [pedido, setPedido] = useState<PedidoDeInstalacao | null>(null)

  useEffect(() => {
    const instalado = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
    if (instalado) return
    const ua = navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    if (ios) setModo('ios')
    // no computador quem instala é o app Absolute ZRO; o "instalar como app da web" fica só no celular
    const android = /android/i.test(ua)
    const aoPedir = (e: Event) => {
      if (!android) return
      e.preventDefault()
      setPedido(e as PedidoDeInstalacao)
      setModo('android')
    }
    const aoInstalar = () => setModo(null)
    window.addEventListener('beforeinstallprompt', aoPedir)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', aoPedir)
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [])

  if (!modo) return null
  return (
    <aside className="instalar-hub zro-card" aria-label="Instalar o Absolute ZRO no celular">
      <img src="/icons/icon-192.png" alt="" width={52} height={52} />
      <div className="instalar-hub__texto">
        <strong>Absolute ZRO no celular</strong>
        {modo === 'android' ? (
          <span>Na tela de início, abre cada ferramenta já com a sua conta.</span>
        ) : (
          <span>
            Toque em <Icon name="upload" size={14} />
            <span className="zro-sr-only">Compartilhar</span> e depois em <b>Adicionar à Tela de Início</b>.
          </span>
        )}
      </div>
      {modo === 'android' && pedido && (
        <button
          type="button"
          className="zro-btn zro-btn--primary zro-btn--small"
          onClick={async () => {
            await pedido.prompt()
            const { outcome } = await pedido.userChoice
            if (outcome === 'accepted') setModo(null)
          }}
        >
          Instalar
        </button>
      )}
    </aside>
  )
}
