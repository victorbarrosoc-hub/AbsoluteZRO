import type { Metadata } from 'next'
import Link from 'next/link'
import { avatarVersion, exclusaoPrevia } from '@zro/core'
import { AccountFrame } from '@/components/account-frame'
import { ExcluirConta } from '@/components/excluir-conta'
import { conferirExclusaoAction, excluirContaAction } from '@/lib/actions/account'
import { db, requireOrgPage } from '@/lib/session'

export const metadata: Metadata = { title: 'Excluir conta' }

const pessoas = (n: number) => (n === 1 ? '1 pessoa' : `${n} pessoas`)

/** Excluir a conta: o que impede (com as organizações) ou as duas etapas de confirmação. */
export default async function Excluir() {
  const auth = await requireOrgPage()
  const [avatar, previa] = await Promise.all([avatarVersion(db(), auth), exclusaoPrevia(db(), auth)])
  return (
    <AccountFrame auth={auth} avatar={avatar} title="Excluir conta">
      <p className="zro-mute account-lede">Sua conta e o acesso a todos os apps deixam de existir.</p>
      <section className="excluir-cartao" aria-label="Excluir conta">
        {previa.bloqueio === 'admin_plataforma' ? (
          <p className="zro-mute">Contas da administração da plataforma não são excluídas por aqui.</p>
        ) : previa.bloqueio === 'organizacao_com_membros' ? (
          <Pendencia
            titulo="Antes, a sua equipe."
            apoio="Transfira a posse ou remova as pessoas destas organizações."
            itens={previa.comMembros.map((o) => ({ id: o.id, nome: o.name, detalhe: pessoas(o.members) }))}
            acao={{ href: '/equipe', texto: 'Abrir Equipe' }}
          />
        ) : previa.bloqueio === 'assinatura_paga' ? (
          <Pendencia
            titulo="Antes, a assinatura."
            apoio="Cancele a assinatura paga destas organizações."
            itens={previa.comAssinatura.map((o) => ({ id: o.id, nome: o.name, detalhe: 'assinatura ativa' }))}
            acao={{ href: '/perfil/plano', texto: 'Abrir Plano' }}
          />
        ) : (
          <ExcluirConta confirmarCom={previa.confirmarCom} email={auth.user.email} conferir={conferirExclusaoAction} excluir={excluirContaAction} />
        )}
      </section>
      {!previa.bloqueio && previa.encerradas.length > 0 && (
        <details className="account-more excluir-detalhe">
          <summary>Encerradas junto</summary>
          <ul className="list-plain zro-mute">
            {previa.encerradas.map((o) => (
              <li key={o.id}>{o.name}</li>
            ))}
          </ul>
        </details>
      )}
    </AccountFrame>
  )
}

function Pendencia({
  titulo,
  apoio,
  itens,
  acao,
}: {
  titulo: string
  apoio: string
  itens: { id: string; nome: string; detalhe: string }[]
  acao: { href: string; texto: string }
}) {
  return (
    <div className="excluir">
      <h2 className="excluir__titulo">{titulo}</h2>
      <p className="zro-mute">{apoio}</p>
      <ul className="list-rows">
        {itens.map((o) => (
          <li key={o.id} className="list-rows__item">
            <strong className="list-rows__main">{o.nome}</strong>
            <span className="zro-faint">{o.detalhe}</span>
          </li>
        ))}
      </ul>
      <div className="excluir__acoes">
        <Link className="zro-btn zro-btn--primary" href={acao.href}>
          {acao.texto}
        </Link>
        <Link className="zro-btn zro-btn--ghost" href="/perfil/seguranca">
          Voltar
        </Link>
      </div>
    </div>
  )
}
