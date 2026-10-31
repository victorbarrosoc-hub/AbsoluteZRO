import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { papelNoConsole, podeMudar, podeVer, requirePlatformAdmin, type PainelDrive } from '@zro/core'
import { EmptyState, Notice, Pill, ProductMark } from '@zro/ui'
import { ActionForm } from '@/components/action-form'
import { sobedesceAcessoDriveAction } from '@/lib/actions/admin'
import { db, getAuth } from '@/lib/session'
import { lerDriveDoSobedesce } from '@/lib/sobedesce-console'

export const metadata: Metadata = { title: 'SOBEDESCE · Console', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Quem tem o Drive inteiro no SOBEDESCE (titular, 31/10/2026). Os dados vêm do SOBEDESCE na hora, por pedido assinado
 * (@zro/core › sobedesce-console). Ver: admin e suporte. Ligar ou desligar: só admin, com motivo e confirmação.
 */
export default async function SobedesceDrive() {
  const auth = await getAuth()
  // Layout e página renderizam em paralelo no Next: a página confere por conta própria.
  if (!auth || !podeVer(papelNoConsole(auth), 'apps')) notFound()
  requirePlatformAdmin(auth, ['admin', 'support'])
  const pode = podeMudar(papelNoConsole(auth), 'apps')

  let painel: PainelDrive | null = null
  try {
    painel = await lerDriveDoSobedesce(db(), auth)
  } catch {
    painel = null
  }
  const pessoas = painel ? [...painel.pessoas].sort((a, b) => Number(b.acessoTotal) - Number(a.acessoTotal) || a.nome.localeCompare(b.nome, 'pt-BR')) : []
  const v = painel?.vagas

  return (
    <div className="page adm-page">
      <Link href="/admin/apps" className="zro-faint">
        ← Apps
      </Link>
      <header className="adm-head adm-head--row adm-head--mark">
        <ProductMark productId="sobedesce" name="SOBEDESCE" size={44} />
        <div>
          <h1>Drive inteiro</h1>
          <p>Quem usa o Google Drive completo no SOBEDESCE.</p>
        </div>
      </header>
      {!pode && <Notice title="Só leitura">Ligar e desligar exige papel admin.</Notice>}

      {!painel || !v ? (
        <Notice tone="warn" title="O SOBEDESCE não respondeu agora.">
          Tente de novo em instantes.
        </Notice>
      ) : (
        <>
          <section
            className="zro-card vagas-drive"
            title={`O Google aceita 100 contas na vida do projeto; o limite aqui é ${v.limite}. Vaga usada não volta, nem desligando.`}
          >
            <p className="vagas-drive__num">
              <strong>{v.usadas}</strong>
              <span> / {v.limite}</span>
            </p>
            <div className="meter" role="img" aria-label={`${v.usadas} de ${v.limite} vagas usadas`}>
              <span style={{ width: `${Math.min(100, ((v.usadas + v.liberadasSemUso) / Math.max(1, v.limite)) * 100)}%` }} />
            </div>
            <p className={v.livres > 0 ? 'zro-faint' : 'zro-field__error'}>
              {v.livres > 0 ? `${v.livres} para liberar` : 'Sem vaga para liberar'}
              {v.liberadasSemUso ? ` · ${v.liberadasSemUso} liberada${v.liberadasSemUso > 1 ? 's' : ''} sem uso` : ''}
            </p>
          </section>

          {pessoas.length ? (
            <ul className="adm-rows">
              {pessoas.map((p) => (
                <li key={p.id}>
                  <span className="vagas-drive__quem">
                    <strong>{p.nome}</strong>
                    <span className="zro-faint">{p.email}</span>
                  </span>
                  <span className="row">
                    {p.acessoTotal ? <Pill tone="ok">Drive inteiro</Pill> : <Pill tone="faint">Arquivos escolhidos</Pill>}
                    {p.usouVaga && <Pill title="Já gastou uma vaga. Ela não volta.">vaga usada</Pill>}
                    {pode && (p.acessoTotal || p.usouVaga || v.livres > 0) && (
                      <details className="adm-confirm">
                        <summary className="zro-btn zro-btn--small">{p.acessoTotal ? 'Desligar…' : 'Ligar…'}</summary>
                        <ActionForm
                          action={sobedesceAcessoDriveAction}
                          submit={p.acessoTotal ? 'Desligar o Drive inteiro' : 'Ligar o Drive inteiro'}
                          variant={p.acessoTotal ? 'danger' : 'primary'}
                        >
                          <p className="zro-mute">
                            {p.acessoTotal
                              ? 'Os Drives da pessoa pedem nova conexão, só com os arquivos escolhidos. A vaga não volta.'
                              : p.usouVaga
                                ? 'Já tem vaga usada: religar não gasta outra.'
                                : 'Gasta uma vaga quando a pessoa conectar. A vaga não volta.'}
                          </p>
                          <input type="hidden" name="usuarioId" value={p.id} />
                          <input type="hidden" name="ligar" value={p.acessoTotal ? '0' : '1'} />
                          <input className="zro-input" name="reason" placeholder="Motivo" aria-label={`Motivo para mudar ${p.nome}`} required maxLength={500} />
                        </ActionForm>
                      </details>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Ninguém no SOBEDESCE ainda." />
          )}
        </>
      )}
    </div>
  )
}
