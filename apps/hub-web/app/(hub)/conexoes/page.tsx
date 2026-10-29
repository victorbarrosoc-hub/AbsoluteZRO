import type { Metadata } from 'next'
import { avatarVersion, calendariosGoogle, minhasConexoes, type Calendario } from '@zro/core'
import { isDomainError } from '@zro/observability'
import { Notice, ProductMark } from '@zro/ui'
import { AccountFrame } from '@/components/account-frame'
import { Desconectar, FormAuto } from '@/components/conexoes'
import { Icon } from '@/components/icons'
import { alternarAppAction, desconectarGoogleAction, escolherAgendasAction } from '@/lib/actions/conexoes'
import { ambienteAgenda, CONEXAO_ERROS, sobedesceConta } from '@/lib/conexoes'
import { fmtAgo } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'
import './conexoes.css'

export const metadata: Metadata = { title: 'Conexões' }

const OK: Record<string, string> = { google: 'Google Agenda conectado.', desconectado: 'Google Agenda desconectado.' }

/**
 * Conexões (ADR 0026): como o Apple ID com o iCloud. A pessoa conecta o Google Agenda uma vez e os apps da família
 * usam por aqui; o Drive segue no SOBEDESCE (só o link: o HUB não lê o estado do Drive de lá). Cada página confere a
 * sessão por conta própria (Next 16: layout e página em paralelo).
 */
export default async function Conexoes({ searchParams }: PageProps<'/conexoes'>) {
  const auth = await requireOrgPage()
  const sp = await searchParams
  const amb = ambienteAgenda()
  const [avatar, minhas] = await Promise.all([avatarVersion(db(), auth), minhasConexoes(db(), auth)])
  const g = minhas.google
  let estado = g?.estado ?? null
  let calendarios: Calendario[] | null = null
  let erroAgendas = false
  if (g && estado === 'ativa' && amb) {
    try {
      calendarios = await calendariosGoogle(db(), amb.cfg, amb.chave, auth)
    } catch (e) {
      if (isDomainError(e) && e.code === 'sem_conexao') estado = 'reconectar'
      else erroAgendas = true
    }
  }
  const erro = typeof sp.erro === 'string' ? (CONEXAO_ERROS[sp.erro] ?? CONEXAO_ERROS.google) : null
  const ok = typeof sp.ok === 'string' ? OK[sp.ok] : null

  return (
    <AccountFrame auth={auth} avatar={avatar} title="Conexões">
      <p className="account-lede zro-mute">Conecte uma vez. Os apps da Absolute ZRO usam daqui.</p>
      {erro && <Notice tone="warn">{erro}</Notice>}
      {ok && !erro && <Notice tone="ok">{ok}</Notice>}

      <div className="conexoes">
        <article className="conexao" aria-labelledby="conexao-agenda" data-estado={!g ? 'vazia' : estado}>
          <header className="conexao__cab">
            <span className="conexao__icone" aria-hidden="true">
              <Icon name="calendar" size={22} />
            </span>
            <div className="conexao__nome">
              <h2 id="conexao-agenda">Google Agenda</h2>
              <p className="zro-mute">
                {!g ? 'Não conectada' : estado === 'reconectar' ? 'Precisa conectar de novo' : <span title="Conta Google conectada">{g.contaEmail}</span>}
              </p>
            </div>
            {g && estado === 'ativa' && (
              <span className="conexao__selo" title={`Conectada desde ${fmtAgo(g.criadaEm)}`}>
                <Icon name="check" size={14} /> Conectada
              </span>
            )}
          </header>

          {!amb ? (
            <p className="zro-mute conexao__corpo">Indisponível agora. Volte daqui a pouco.</p>
          ) : !g || estado === 'reconectar' ? (
            <div className="conexao__corpo conexao__vazia">
              <ul className="conexao__beneficios" aria-label="O que a conexão faz">
                <li>
                  <Icon name="check" size={16} /> Ocupado e livre nos apps
                </li>
                <li>
                  <Icon name="check" size={16} /> Diárias e prazos na sua agenda
                </li>
              </ul>
              <a className="glass-btn glass-btn--ink" href="/conexoes/google">
                {estado === 'reconectar' ? 'Conectar de novo' : 'Conectar'}
              </a>
            </div>
          ) : (
            <div className="conexao__corpo">
              <section className="conexao__secao" aria-labelledby="conexao-agendas">
                <h3 id="conexao-agendas">Agendas</h3>
                {erroAgendas ? (
                  <p className="zro-mute">
                    Não deu para ler suas agendas agora. <a href="/conexoes">Tentar de novo</a>
                  </p>
                ) : calendarios && calendarios.length ? (
                  <FormAuto action={escolherAgendasAction} className="conexao__lista" rotulo="Agendas que contam como ocupado">
                    {calendarios.map((c) => (
                      <label key={c.id} className="conexao__linha">
                        <span className="conexao__cor" style={c.cor ? { background: c.cor } : undefined} aria-hidden="true" />
                        <span className="conexao__linha-nome">
                          {c.nome}
                          {c.principal && <span className="zro-faint"> · principal</span>}
                        </span>
                        <input type="checkbox" className="switch" name="agenda" value={c.id} defaultChecked={c.escolhido} />
                      </label>
                    ))}
                  </FormAuto>
                ) : (
                  <p className="zro-mute">Nenhuma agenda nesta conta.</p>
                )}
              </section>

              <section className="conexao__secao" aria-labelledby="conexao-apps">
                <h3 id="conexao-apps">Usado por</h3>
                {minhas.apps.length ? (
                  <div className="conexao__lista">
                    {minhas.apps.map((a) => (
                      <FormAuto key={a.app} action={alternarAppAction} className="conexao__linha" rotulo={`${a.nome} usa a agenda`}>
                        <input type="hidden" name="app" value={a.app} />
                        <ProductMark productId={a.app} name={a.nome} size={28} />
                        <span className="conexao__linha-nome">
                          {a.nome}
                          <span className="zro-faint"> · {a.usadoEm ? `usou ${fmtAgo(a.usadoEm)}` : 'ainda não usou'}</span>
                        </span>
                        <input type="checkbox" className="switch" name="ativo" defaultChecked={a.ativo} aria-label={`${a.nome} pode usar`} />
                      </FormAuto>
                    ))}
                  </div>
                ) : (
                  <p className="zro-mute">Nenhum app ainda. Abra o Maestro e ele aparece aqui.</p>
                )}
              </section>

              <footer className="conexao__pe">
                <Desconectar action={desconectarGoogleAction} conta={g.contaEmail} />
              </footer>
            </div>
          )}
          {g && estado === 'reconectar' && amb && (
            <footer className="conexao__pe">
              <Desconectar action={desconectarGoogleAction} conta={g.contaEmail} />
            </footer>
          )}
        </article>

        <article className="conexao" aria-labelledby="conexao-drive">
          <header className="conexao__cab">
            <span className="conexao__icone" aria-hidden="true">
              <Icon name="files" size={22} />
            </span>
            <div className="conexao__nome">
              <h2 id="conexao-drive">Google Drive</h2>
              <p className="zro-mute">Pelo SOBEDESCE</p>
            </div>
          </header>
          <div className="conexao__corpo conexao__vazia">
            <a className="glass-btn" href={sobedesceConta()} target="_blank" rel="noopener noreferrer">
              Abrir no SOBEDESCE <Icon name="external" size={14} />
            </a>
          </div>
        </article>
      </div>
    </AccountFrame>
  )
}
