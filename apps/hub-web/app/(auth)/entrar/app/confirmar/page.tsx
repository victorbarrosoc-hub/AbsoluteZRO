import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { parseDesktopLoginRequest } from '@zro/auth'
import { VoltarAoApp } from '@/components/voltar-ao-app'
import { DESKTOP_LOGIN_NOMES, desktopLoginQuery } from '@/lib/desktop-login'
import { getAuth } from '@/lib/session'

export const metadata: Metadata = { title: 'Voltar para o app', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * Entrar pelo navegador (ADR 0041): o app de computador abriu o HUB aqui porque o Google não deixa entrar dentro da
 * janela dele. Sem sessão, vai para /entrar (Google, e-mail e senha) e volta para cá; com sessão, um toque devolve a
 * pessoa ao app com um código de uso único.
 */
export default async function ConfirmarApp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const parsed = parseDesktopLoginRequest(await searchParams.then((q) => ({ ...q, next: q.next ?? null })))
  if (!parsed.ok) redirect('/entrar?erro=app')
  const req = parsed.req
  const aqui = `/entrar/app/confirmar?${desktopLoginQuery(req)}`
  const auth = await getAuth()
  if (!auth) redirect(`/entrar?next=${encodeURIComponent(aqui)}`)
  const nome = DESKTOP_LOGIN_NOMES[req.app]
  return (
    <>
      <div className="stack">
        <h1>Pronto, {auth.user.displayName.split(' ')[0]}.</h1>
        <p className="zro-mute">Você entrou como {auth.user.email}.</p>
      </div>
      <VoltarAoApp app={req.app} state={req.state} challenge={req.challenge} next={req.next} nome={nome} />
      <p className="zro-faint">
        <Link href={`/entrar?outra=1&next=${encodeURIComponent(aqui)}`}>Usar outra conta</Link>
      </p>
    </>
  )
}
