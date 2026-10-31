import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Fragment } from 'react'
import { caixasDoPapel, papelNoConsole, podeVer, requireConsole } from '@zro/core'
import { Correio } from '@/components/admin/correio/correio'
import { Icon } from '@/components/icons'
import { configDoCorreio } from '@/lib/correio/config'
import { getAuth } from '@/lib/session'
import './correio.css'

export const metadata: Metadata = { title: 'Correio · Console', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Correio (ADR 0034): as caixas do domínio próprio, lidas e respondidas direto do iCloud. Admin vê as três; Financeiro,
 * só financeiro@. Sem as variáveis do iCloud, a tela diz isso e não finge caixa nenhuma.
 */
export default async function CorreioPage({ searchParams }: Props) {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth || !podeVer(papelNoConsole(auth), 'correio')) notFound()
  const a = requireConsole(auth, 'correio')
  const caixas = caixasDoPapel(a.papel)
  const { faltam } = configDoCorreio(process.env)
  const pedida = (await searchParams).caixa
  const inicial = caixas.find((c) => c.id === pedida)?.id ?? caixas[0]!.id

  if (faltam.length) {
    return (
      <div className="page adm-page">
        <header className="adm-head">
          <h1>Correio</h1>
        </header>
        <section className="cor-off" aria-labelledby="cor-off-titulo">
          <span className="cor-off__icone" aria-hidden="true">
            <Icon name="mail" />
          </span>
          <h2 id="cor-off-titulo">Correio não configurado</h2>
          <p>
            Falta{faltam.length > 1 ? 'm' : ''}{' '}
            {faltam.map((f, i) => (
              <Fragment key={f}>
                {i > 0 && ' e '}
                <code>{f}</code>
              </Fragment>
            ))}{' '}
            na Vercel.
          </p>
          <details className="cor-off__passos">
            <summary>Como configurar</summary>
            <ol>
              <li>
                Em <strong>account.apple.com</strong> › Entrar e segurança › Senhas específicas de app, gere uma senha (nome: “Console ZRO”).
              </li>
              <li>
                Na Vercel, projeto absolutezro › Settings › Environment Variables: <code>ICLOUD_MAIL_USER</code> = e-mail do Apple ID e{' '}
                <code>ICLOUD_MAIL_APP_PASSWORD</code> = a senha gerada.
              </li>
              <li>Faça um novo deploy. As caixas aparecem aqui.</li>
            </ol>
          </details>
        </section>
      </div>
    )
  }

  return <Correio caixas={caixas.map((c) => ({ id: c.id, endereco: c.endereco, nome: c.nome }))} inicial={inicial} />
}
