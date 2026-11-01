import type { Metadata } from 'next'
import { avatarVersion, calendariosGoogle, minhaHiggsfield, minhasConexoes, saldoHiggsfield, type Calendario } from '@zro/core'
import { isDomainError } from '@zro/observability'
import { Notice, ProductMark } from '@zro/ui'
import { AccountFrame } from '@/components/account-frame'
import { Desconectar, FormAuto } from '@/components/conexoes'
import { Icon } from '@/components/icons'
import {
  alternarAppAction,
  alternarAppHiggsfieldAction,
  desconectarGoogleAction,
  desconectarHiggsfieldAction,
  escolherAgendasAction,
} from '@/lib/actions/conexoes'
import { ambienteAgenda, ambienteHiggsfield, CONEXAO_ERROS, sobedesceConta } from '@/lib/conexoes'
import { fmtAgo } from '@/lib/labels'
import { db, requireOrgPage } from '@/lib/session'
import './conexoes.css'

export const metadata: Metadata = { title: 'Conexões' }

const OK: Record<string, string> = {
  google: 'Google Agenda conectado.',
  desconectado: 'Google Agenda desconectado.',
  higgsfield: 'Higgsfield conectada.',
  'higgsfield-desconectada': 'Higgsfield desconectada.',
}
const creditos = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/**
 * Conexões (ADR 0026): como o Apple ID com o iCloud. A pessoa conecta o Google Agenda uma vez e os apps da família
 * usam por aqui; o Drive segue no SOBEDESCE (só o link: o HUB não lê o estado do Drive de lá). Cada página confere a
 * sessão por conta própria (Next 16: layout e página em paralelo).
 */
export default async function Conexoes({ searchParams }: PageProps<'/conexoes'>) {
  const auth = await requireOrgPage()
  const sp = await searchParams
  const amb = ambienteAgenda()
  const ambHf = ambienteHiggsfield()
  const [avatar, minhas, hf] = await Promise.all([avatarVersion(db(), auth), minhasConexoes(db(), auth), minhaHiggsfield(db(), auth)])
  const g = minhas.google
  const h = hf.visivel ? hf.conexao : null
  let estadoHf = h?.estado ?? null
  let saldo: { creditos: number | null; plano: string | null } | null = null
  if (h && estadoHf === 'ativa' && ambHf) {
    try {
      saldo = await saldoHiggsfield(db(), ambHf, auth)
    } catch (e) {
      if (isDomainError(e) && e.code === 'sem_conexao') estadoHf = 'reconectar'
    }
  }
  const usadoHf = h?.usoMes ?? 0
  const totalHf = (saldo?.creditos ?? 0) + usadoHf
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

        {hf.visivel && (
          <article className="conexao" aria-labelledby="conexao-higgsfield" data-estado={!h ? 'vazia' : estadoHf}>
            <header className="conexao__cab">
              <span className="conexao__icone" aria-hidden="true">
                <Icon name="sparkle" size={22} />
              </span>
              <div className="conexao__nome">
                <h2 id="conexao-higgsfield">Higgsfield</h2>
                <p className="zro-mute">
                  {!h ? 'Não conectada' : estadoHf === 'reconectar' ? 'Precisa conectar de novo' : <span title="Conta Higgsfield conectada">{h.conta}</span>}
                </p>
              </div>
              {h && estadoHf === 'ativa' && (
                <span className="conexao__selo" title={`Conectada desde ${fmtAgo(h.criadaEm)}`}>
                  <Icon name="check" size={14} /> Conectada
                </span>
              )}
            </header>

            {!ambHf ? (
              <p className="zro-mute conexao__corpo">Indisponível agora. Volte daqui a pouco.</p>
            ) : !h || estadoHf === 'reconectar' ? (
              <div className="conexao__corpo conexao__vazia">
                <ul className="conexao__beneficios" aria-label="O que a conexão faz">
                  <li>
                    <Icon name="check" size={16} /> Imagens e vídeos com IA nos apps
                  </li>
                  <li>
                    <Icon name="check" size={16} /> Com os créditos do seu plano
                  </li>
                </ul>
                <a className="glass-btn glass-btn--ink" href="/conexoes/higgsfield">
                  {estadoHf === 'reconectar' ? 'Conectar de novo' : 'Conectar'}
                </a>
              </div>
            ) : (
              <div className="conexao__corpo">
                <section className="conexao__secao" aria-labelledby="conexao-creditos">
                  <h3 id="conexao-creditos">Créditos</h3>
                  {saldo?.creditos == null ? (
                    <p className="zro-mute">
                      Não deu para ler o saldo agora. <a href="/conexoes">Tentar de novo</a>
                    </p>
                  ) : (
                    <div
                      className="conexao__creditos"
                      title="Saldo e plano informados pela Higgsfield; o uso é o que os apps da Absolute ZRO pediram neste mês"
                    >
                      <p className="conexao__saldo">
                        <strong>{creditos(saldo.creditos)}</strong> <span className="zro-mute">disponíveis{saldo.plano ? ` · ${saldo.plano}` : ''}</span>
                      </p>
                      <div
                        className="conexao__medidor"
                        role="meter"
                        aria-label="Créditos usados pelos apps neste mês"
                        aria-valuemin={0}
                        aria-valuemax={totalHf || 1}
                        aria-valuenow={usadoHf}
                      >
                        <span style={{ width: `${totalHf ? Math.min(100, (usadoHf / totalHf) * 100) : 0}%` }} />
                      </div>
                      <p className="zro-faint">{creditos(usadoHf)} usados pelos apps neste mês</p>
                    </div>
                  )}
                </section>

                <section className="conexao__secao" aria-labelledby="conexao-hf-apps">
                  <h3 id="conexao-hf-apps">Usado por</h3>
                  {hf.apps.length ? (
                    <div className="conexao__lista">
                      {hf.apps.map((a) => (
                        <FormAuto key={a.app} action={alternarAppHiggsfieldAction} className="conexao__linha" rotulo={`${a.nome} gera com a Higgsfield`}>
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
                    <p className="zro-mute">Nenhum app ainda.</p>
                  )}
                </section>

                <footer className="conexao__pe">
                  <Desconectar
                    action={desconectarHiggsfieldAction}
                    conta={h.conta}
                    aviso="Os apps deixam de gerar com a Higgsfield."
                    dica={`Os apps deixam de usar os créditos de ${h.conta}. O que já foi gerado continua na Higgsfield.`}
                  />
                </footer>
              </div>
            )}
            {h && estadoHf === 'reconectar' && ambHf && (
              <footer className="conexao__pe">
                <Desconectar
                  action={desconectarHiggsfieldAction}
                  conta={h.conta}
                  aviso="Os apps deixam de gerar com a Higgsfield."
                  dica="Apaga a conexão daqui."
                />
              </footer>
            )}
          </article>
        )}

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
