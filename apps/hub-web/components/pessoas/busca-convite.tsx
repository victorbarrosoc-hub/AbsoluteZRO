'use client'
/**
 * Equipe › Convidar (ADR 0029): um campo só. "@fulano" ou um nome acha perfis visíveis; um e-mail completo convida pelo
 * e-mail exato (o caminho de quem escondeu o perfil). A pessoa sempre aceita antes de entrar. A busca roda no servidor
 * (buscarPessoasAction, com o limite de buscas); a tela nunca recebe e-mail de ninguém.
 */
import { useEffect, useRef, useState, useTransition } from 'react'
import type { PerfilPublico } from '@zro/core'
import type { FormState } from '../action-form'
import { Icon } from '../icons'
import { FichaPessoa } from './ficha'

type Papel = { valor: string; nome: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function BuscaConvite({
  inicial = '',
  papeis,
  buscar,
  convidarArroba,
  convidarEmail,
}: {
  /** Vem do perfil de alguém ("Convidar para…"): a busca já abre com o @. */
  inicial?: string
  papeis: Papel[]
  buscar: (q: string) => Promise<{ pessoas: PerfilPublico[]; erro?: string }>
  convidarArroba: (arroba: string, papel: string) => Promise<FormState>
  convidarEmail: (prev: FormState, fd: FormData) => Promise<FormState>
}) {
  const [q, setQ] = useState(inicial)
  const [papel, setPapel] = useState(papeis.find((p) => p.valor === 'editor')?.valor ?? papeis[0]!.valor)
  const [res, setRes] = useState<{ q: string; pessoas: PerfilPublico[]; erro?: string } | null>(null)
  const [feitos, setFeitos] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<FormState>(null)
  const [buscando, startBusca] = useTransition()
  const [enviando, startEnvio] = useTransition()
  const ultima = useRef('')

  const texto = q.trim()
  const ehEmail = EMAIL.test(texto)
  const curta = texto.replace(/^@/, '').length < 2

  useEffect(() => {
    if (ehEmail || curta) return
    const t = setTimeout(() => {
      ultima.current = texto
      startBusca(async () => {
        const r = await buscar(texto)
        if (ultima.current === texto) setRes({ q: texto, ...r })
      })
    }, 220)
    return () => clearTimeout(t)
  }, [texto, ehEmail, curta, buscar])

  function convidar(arroba: string) {
    setAviso(null)
    startEnvio(async () => {
      const r = await convidarArroba(arroba, papel)
      setAviso(r)
      if (r?.ok) setFeitos((f) => ({ ...f, [arroba]: papel }))
    })
  }

  function convidarPorEmail() {
    setAviso(null)
    const fd = new FormData()
    fd.set('email', texto)
    fd.set('role', papel)
    startEnvio(async () => {
      const r = await convidarEmail(null, fd)
      setAviso(r)
      if (r?.ok) setQ('')
    })
  }

  const lista = !curta && !ehEmail && res?.q === texto ? res.pessoas : []
  return (
    <div className="pbusca">
      <label className="pbusca__campo">
        <span className="zro-sr-only">Buscar por @, nome ou e-mail</span>
        <Icon name="search" size={18} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="@fulano, nome ou e-mail"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          aria-describedby="pbusca-ajuda"
        />
      </label>
      <div className="pbusca__papel">
        <label htmlFor="pbusca-papel">Entra como</label>
        <select id="pbusca-papel" className="zro-select" value={papel} onChange={(e) => setPapel(e.target.value)}>
          {papeis.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.nome}
            </option>
          ))}
        </select>
        <span id="pbusca-ajuda" className="zro-sr-only">
          A pessoa aceita o convite antes de entrar.
        </span>
      </div>

      {ehEmail ? (
        <div className="pficha">
          <span className="avatar pficha__foto" aria-hidden="true">
            <Icon name="mail" size={20} />
          </span>
          <div className="pficha__miolo">
            <p className="pficha__nome">{texto}</p>
            <p className="pficha__linha">Convite pelo e-mail exato</p>
          </div>
          <div className="pficha__acao">
            <button type="button" className="zro-btn zro-btn--primary zro-btn--small" onClick={convidarPorEmail} disabled={enviando}>
              Convidar
            </button>
          </div>
        </div>
      ) : lista.length ? (
        <ul className="pbusca__lista" aria-label="Pessoas encontradas" aria-busy={buscando}>
          {lista.map((p) => (
            <li key={p.id}>
              <FichaPessoa
                p={p}
                acao={
                  feitos[p.arroba] ? (
                    <span className="pbusca__feito">
                      <Icon name="check" size={16} /> Convidado
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="zro-btn zro-btn--primary zro-btn--small"
                      onClick={() => convidar(p.arroba)}
                      disabled={enviando}
                      aria-label={`Convidar @${p.arroba}`}
                    >
                      Convidar
                    </button>
                  )
                }
              />
            </li>
          ))}
        </ul>
      ) : !curta && res?.q === texto && !buscando ? (
        <p className="pbusca__vazio" role="status">
          {res.erro ?? 'Ninguém com esse @ ou nome. Perfil escondido? Convide pelo e-mail.'}
        </p>
      ) : null}

      {aviso?.error ? (
        <p className="zro-field__error" role="alert">
          {aviso.error}
        </p>
      ) : aviso?.ok ? (
        <p className="zro-mute" role="status">
          {aviso.ok}
        </p>
      ) : null}
      {aviso?.devLink ? (
        <p className="zro-faint">
          Link de desenvolvimento (sem provedor de e-mail): <a href={aviso.devLink}>{aviso.devLink}</a>
        </p>
      ) : null}
    </div>
  )
}
