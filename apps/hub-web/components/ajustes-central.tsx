'use client'
/**
 * Ajustes da central (ADR 0049), lidos e gravados pela ponte do app (window.zroDesktop.apps, central 1.4+): um
 * interruptor "Atualizar sozinho" por app instalado (padrão desligado) e "Abrir com o computador". No navegador, só o
 * convite para instalar a Absolute ZRO.
 */
import Link from 'next/link'
import { ProductMark } from '@zro/ui'
import { useEffect, useState } from 'react'
import type { AppsApi } from './app-actions'

type Ajustes = { atualizarSozinho: Record<string, boolean>; abrirComSistema: boolean | null }

function Interruptor({ ligado, rotulo, onChange }: { ligado: boolean; rotulo: string; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} className="ajustes__interruptor" onClick={() => onChange(!ligado)} />
}

export function AjustesDaCentral({ apps }: { apps: { id: string; nome: string }[] }) {
  const [api, setApi] = useState<AppsApi | null | undefined>(undefined)
  const [ajustes, setAjustes] = useState<Ajustes | null>(null)
  const [instalados, setInstalados] = useState<string[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const a = window.zroDesktop?.apps
    if (!a?.ajustes) return setApi(null)
    setApi(a)
    a.ajustes().then((r) => (r.ok && r.dados ? setAjustes(r.dados) : setErro(r.erro ?? 'Não deu para ler os ajustes.')))
    a.listar().then((r) => setInstalados(r.ok ? (r.dados ?? []).filter((s) => s.instalado && !s.bloqueado).map((s) => s.id) : []))
  }, [])

  if (api === undefined) return <p className="zro-faint">Conferindo este computador…</p>
  if (api === null)
    return (
      <p className="painel-resumo">
        <span>Os ajustes ficam na Absolute ZRO para computador.</span>
        <Link className="glass-btn" href="/baixar#absolute-zro">
          Baixar a Absolute ZRO
        </Link>
      </p>
    )
  if (!ajustes || !instalados) return erro ? <p className="zro-field__error">{erro}</p> : <p className="zro-faint">Conferindo este computador…</p>

  const meus = apps.filter((a) => instalados.includes(a.id))
  const definir = async (id: string, ligado: boolean) => {
    setAjustes({ ...ajustes, atualizarSozinho: { ...ajustes.atualizarSozinho, [id]: ligado } })
    const r = await api.definirAtualizarSozinho?.(id, ligado)
    if (r && !r.ok) setErro(r.erro ?? 'Não deu para guardar.')
  }
  const abrirComSistema = async (ligado: boolean) => {
    setAjustes({ ...ajustes, abrirComSistema: ligado })
    await api.definirAbrirComSistema?.(ligado)
  }

  return (
    <div className="ajustes">
      <ul className="ajustes__grupo" aria-label="Atualizar sozinho">
        {meus.length ? (
          meus.map((a) => (
            <li key={a.id} className="ajustes__linha">
              <ProductMark productId={a.id} name={a.nome} size={36} />
              <span className="ajustes__nome">
                <strong>{a.nome}</strong>
                <span>Atualizar sozinho</span>
              </span>
              <Interruptor ligado={!!ajustes.atualizarSozinho[a.id]} rotulo={`Atualizar o ${a.nome} sozinho`} onChange={(v) => definir(a.id, v)} />
            </li>
          ))
        ) : (
          <li className="ajustes__linha">
            <span className="ajustes__nome">
              <strong>Nenhum app instalado ainda</strong>
              <span>Instale em Apps.</span>
            </span>
          </li>
        )}
      </ul>
      {ajustes.abrirComSistema !== null && (
        <ul className="ajustes__grupo" aria-label="Absolute ZRO">
          <li className="ajustes__linha">
            <span className="ajustes__nome">
              <strong>Abrir com o computador</strong>
              <span>Fica na barra de menus e avisa quando há versão nova.</span>
            </span>
            <Interruptor ligado={ajustes.abrirComSistema} rotulo="Abrir a Absolute ZRO com o computador" onChange={abrirComSistema} />
          </li>
        </ul>
      )}
      {erro && (
        <p className="zro-field__error" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}
