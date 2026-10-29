import type { ReactNode } from 'react'
import type { Authenticated } from '@zro/auth'
import { AccountNav } from './account-nav'
import { Avatar } from './avatar'

/** Moldura da central da conta: quem é a pessoa, as seções e o conteúdo. Cada página confere a sessão antes. */
export function AccountFrame({ auth, avatar, title, children }: { auth: Authenticated; avatar: number | null; title: string; children: ReactNode }) {
  const name = auth.user.displayName || auth.user.email
  return (
    <div className="account">
      <header className="account__id">
        <Avatar userId={auth.user.id} name={name} version={avatar} size={64} />
        <div className="account__who">
          <p className="account__name">{name}</p>
          <p className="zro-mute">{auth.user.email}</p>
        </div>
      </header>
      <AccountNav />
      <section className="account__body" aria-labelledby="account-title">
        <h1 id="account-title" className="account__title">
          {title}
        </h1>
        {children}
      </section>
    </div>
  )
}
