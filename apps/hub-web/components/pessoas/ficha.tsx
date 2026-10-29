/**
 * A ficha de uma pessoa do ecossistema (perfil profissional, ADR 0029): foto, nome, @, funções, cidade e selos. Nunca
 * e-mail nem telefone (o perfil público não tem). Serve na busca do Convidar, no editor (prévia) e em listas.
 */
import type { ReactNode } from 'react'
import type { PerfilPublico } from '@zro/core'
import { initials } from '../avatar'
import './pessoas.css'

export function FotoPessoa({ p, className }: { p: Pick<PerfilPublico, 'foto' | 'nome'>; className: string }) {
  return (
    <span className={`avatar ${className}`} aria-hidden="true">
      {p.foto ? <img src={p.foto} alt="" loading="lazy" /> : initials(p.nome)}
    </span>
  )
}

export const linhaDaPessoa = (p: Pick<PerfilPublico, 'funcoes' | 'cidade'>) =>
  [
    p.funcoes
      .slice(0, 3)
      .map((f) => f.nome)
      .join(', '),
    p.cidade,
  ]
    .filter(Boolean)
    .join(' · ')

export function FichaPessoa({ p, acao, link = true, titulo = 'h3' }: { p: PerfilPublico; acao?: ReactNode; link?: boolean; titulo?: 'h2' | 'h3' | 'p' }) {
  const Titulo = titulo
  const linha = linhaDaPessoa(p)
  return (
    <article className="pficha" aria-label={`${p.nome}, @${p.arroba}`}>
      <FotoPessoa p={p} className="pficha__foto" />
      <div className="pficha__miolo">
        <Titulo className="pficha__nome">
          {link ? <a href={`/pessoas/@${p.arroba}`}>{p.nome}</a> : p.nome} <span className="pficha__arroba">@{p.arroba}</span>
        </Titulo>
        {linha ? <p className="pficha__linha">{linha}</p> : null}
        {p.selos.length ? (
          <div className="pficha__selos">
            {p.selos.map((s) => (
              <span key={s.produto} className="pselo">
                {s.texto}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {acao ? <div className="pficha__acao">{acao}</div> : null}
    </article>
  )
}
