'use client'
/**
 * Topo do painel do app: quantas ferramentas estão instaladas e quantas têm versão nova, com "Atualizar tudo".
 * Lê a central do app de computador (window.zroDesktop.apps); no navegador mostra o convite para baixar o app.
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'

type Situacao = { id: string; instalado: unknown; atualizar: boolean; ocupado: boolean }

export function PainelResumo({ liberados }: { liberados: string[] }) {
  const [noApp, setNoApp] = useState<boolean | null>(null)
  const [lista, setLista] = useState<Situacao[] | null>(null)
  const [atualizando, setAtualizando] = useState(false)

  useEffect(() => {
    const api = window.zroDesktop?.apps
    setNoApp(!!api)
    if (!api) return
    document.documentElement.classList.add('zro-desktop')
    let vivo = true
    const ler = () =>
      api.listar().then((r) => {
        if (vivo && r.ok) setLista((r.dados as Situacao[] | undefined) ?? [])
      })
    ler()
    const off = api.aoProgresso((ev) => {
      if (ev.fase === 'pronto' || ev.fase === 'removido' || ev.fase === 'erro') ler()
    })
    return () => {
      vivo = false
      off()
    }
  }, [])

  if (noApp === null) return <p className="painel-resumo zro-faint">Conferindo este computador…</p>
  if (!noApp)
    return (
      <p className="painel-resumo">
        <span>Instale e atualize as ferramentas pelo app Absolute ZRO para computador.</span>
        <Link className="glass-btn" href="/baixar#absolute-zro">
          Baixar o app
        </Link>
      </p>
    )
  if (!lista) return <p className="painel-resumo zro-faint">Conferindo este computador…</p>

  const instalados = lista.filter((s) => s.instalado).length
  const novas = lista.filter((s) => s.atualizar && liberados.includes(s.id))
  async function atualizarTudo() {
    const api = window.zroDesktop?.apps
    if (!api) return
    setAtualizando(true)
    // um de cada vez: a central baixa e instala em sequência, com o progresso em cada cartão
    for (const s of novas) await api.instalar(s.id)
    setAtualizando(false)
  }
  return (
    <p className="painel-resumo" role="status">
      <span>
        <strong>{instalados}</strong> {instalados === 1 ? 'instalada' : 'instaladas'} neste computador
        {novas.length > 0 ? (
          <>
            {' · '}
            <strong>{novas.length}</strong> {novas.length === 1 ? 'atualização' : 'atualizações'}
          </>
        ) : (
          ' · tudo em dia'
        )}
      </span>
      {novas.length > 0 && (
        <button type="button" className="glass-btn glass-btn--ink" onClick={atualizarTudo} disabled={atualizando} aria-busy={atualizando}>
          {atualizando ? 'Atualizando…' : 'Atualizar tudo'}
        </button>
      )}
    </p>
  )
}
