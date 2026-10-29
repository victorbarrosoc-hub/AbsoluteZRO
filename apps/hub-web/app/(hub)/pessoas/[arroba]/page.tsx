import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { listMyOrganizations, perfilPorArroba } from '@zro/core'
import { FotoPessoa } from '@/components/pessoas/ficha'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Perfil' }

/**
 * /pessoas/@fulano (ADR 0029): o perfil profissional de alguém, só para quem entrou. Um @ antigo (até 90 dias) leva ao
 * atual; escondido ou inexistente é a mesma página de "não encontrado" (só a própria pessoa vê o dela escondido).
 */
export default async function PaginaDoArroba({ params }: { params: Promise<{ arroba: string }> }) {
  const auth = await requireOrgPage()
  const bruto = decodeURIComponent((await params).arroba)
  if (!bruto.startsWith('@')) notFound()
  const [r, orgs] = await Promise.all([perfilPorArroba(db(), auth, bruto), listMyOrganizations(db(), auth)])
  if (!r) notFound()
  const ativa = orgs.find((o) => o.active)
  const convida = !!ativa && (ativa.role === 'owner' || ativa.role === 'admin')
  if (r.antiga || bruto.slice(1) !== r.perfil.arroba) redirect(`/pessoas/@${r.perfil.arroba}`)
  const p = r.perfil
  return (
    <div className="page">
      <article className="ppagina" aria-labelledby="pp-nome">
        <FotoPessoa p={p} className="ppagina__foto" />
        <h1 id="pp-nome">{p.nome}</h1>
        <p className="ppagina__arroba">
          @{p.arroba}
          {p.cidade ? ` · ${p.cidade}` : ''}
        </p>
        {p.funcoes.length ? (
          <ul className="ppagina__funcoes" aria-label="Funções">
            {p.funcoes.map((f) => (
              <li key={f.chave + f.nome}>{f.nome}</li>
            ))}
          </ul>
        ) : null}
        {p.bio ? <p className="ppagina__bio">{p.bio}</p> : null}
        {p.selos.length ? (
          <div className="pficha__selos" aria-label="Na Absolute ZRO">
            {p.selos.map((s) => (
              <span key={s.produto} className="pselo">
                {s.texto}
              </span>
            ))}
          </div>
        ) : null}
        <div className="ppagina__acoes">
          {r.minha ? (
            <Link className="zro-btn zro-btn--primary" href="/perfil/profissional">
              Editar perfil
            </Link>
          ) : convida ? (
            <Link className="zro-btn zro-btn--primary" href={`/equipe?convidar=${encodeURIComponent(`@${p.arroba}`)}`}>
              Convidar para {ativa!.name}
            </Link>
          ) : null}
          {p.portfolio ? (
            <a className="zro-btn" href={p.portfolio} target="_blank" rel="noopener noreferrer nofollow">
              Portfólio
            </a>
          ) : null}
        </div>
        {r.minha && !r.visivel ? <p className="zro-faint">Escondido da busca: só você vê esta página.</p> : null}
      </article>
    </div>
  )
}
