import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePlatformAdmin } from '@zro/core'
import { Icon } from '@/components/icons'
import { TesteDrive } from '@/components/admin/teste-drive/teste-drive'
import { isProduction } from '@/lib/env'
import { requirePageAuth } from '@/lib/session'
import { configDoTesteDrive, VARIAVEIS } from '@/lib/teste-drive/config'
import { EXEMPLO, EXEMPLO_ESCOPOS } from '@/lib/teste-drive/exemplo'
import './teste-drive.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Teste do Drive · Console', robots: { index: false, follow: false } }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const PARA: Record<string, string> = {
  [VARIAVEIS.clientId]: 'Cliente OAuth (Aplicativo da Web)',
  [VARIAVEIS.apiKey]: 'Chave de API do Picker',
  [VARIAVEIS.appId]: 'Número do projeto no Cloud',
}

/**
 * Console › Teste do Drive: descobre num clique se drive.file + Google Picker cobrem os fluxos do SOBEDESCE
 * (docs/operations/google-drive-sobedesce-teste.md). Só o papel admin; para qualquer outra pessoa a rota não existe. Fora
 * do menu de propósito. Tudo roda no navegador do admin; o servidor só diz se a configuração existe.
 */
export default async function TesteDrivePage({ searchParams }: Props) {
  const auth = await requirePageAuth()
  if (auth.user.platformRole !== 'admin' || !auth.user.emailVerified) notFound()
  requirePlatformAdmin(auth, ['admin'])
  const { config, faltam, clienteDoLogin } = configDoTesteDrive(process.env)
  const exemplo = !isProduction && (await searchParams).exemplo === '1'

  return (
    <div className="page adm-page td">
      <header className="adm-head">
        <h1>Teste do Drive</h1>
        <p>drive.file e o Picker bastam para o SOBEDESCE? Uma pasta responde.</p>
      </header>
      {exemplo ? (
        <TesteDrive exemplo={{ checagens: EXEMPLO, escopos: EXEMPLO_ESCOPOS }} />
      ) : config ? (
        <TesteDrive config={{ clientId: config.clientId, apiKey: config.apiKey, appId: config.appId }} />
      ) : (
        <Configurar faltam={faltam} clienteDoLogin={clienteDoLogin} />
      )}
    </div>
  )
}

/** Faltam configurações: o que ligar no Google Cloud e quais variáveis pôr na Vercel. Nunca pede nem mostra valor. */
function Configurar({ faltam, clienteDoLogin }: { faltam: string[]; clienteDoLogin: boolean }) {
  return (
    <section className="td-card td-config" aria-labelledby="td-config">
      <span className="td-config__icone" aria-hidden="true">
        <Icon name="key" size={28} />
      </span>
      <h2 id="td-config">Faltam configurações</h2>
      <p>Valores públicos, sem segredo. A tela nunca mostra nenhum.</p>
      <ul className="td-vars">
        {Object.values(VARIAVEIS).map((nome) => {
          const ok = !faltam.includes(nome)
          return (
            <li key={nome} data-ok={ok ? '' : undefined}>
              <code>{nome}</code>
              <span>{nome === VARIAVEIS.clientId && ok && clienteDoLogin ? 'Usando o cliente do Entrar com Google' : PARA[nome]}</span>
              <b>{ok ? 'Ok' : 'Falta'}</b>
            </li>
          )
        })}
      </ul>
      <ol className="td-passos">
        <li>
          No Google Cloud Console, ative a <b>Google Drive API</b> e a <b>Google Picker API</b>.
        </li>
        <li>
          Crie uma chave de API restrita ao referenciador HTTP <code>https://absolutezro.com/*</code> e só à Google Picker API.
        </li>
        <li>
          No cliente OAuth (Aplicativo da Web), adicione <code>https://absolutezro.com</code> em Origens JavaScript autorizadas.
        </li>
        <li>
          Em Data Access, deixe só o escopo <code>drive.file</code> do Drive. Em Teste, ponha seu e-mail como usuário de teste.
        </li>
        <li>
          Na Vercel, projeto <b>absolutezro</b>: crie <code>{VARIAVEIS.clientId}</code>, <code>{VARIAVEIS.apiKey}</code> e <code>{VARIAVEIS.appId}</code>{' '}
          (número do projeto, no Painel do Cloud). Depois, Redeploy.
        </li>
      </ol>
      <p className="td-faint">Chave, cliente e número precisam ser do mesmo projeto do Cloud.</p>
    </section>
  )
}
