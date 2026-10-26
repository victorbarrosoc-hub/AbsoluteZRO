/**
 * Catálogo de instalação, no espírito do Creative Cloud: cada ferramenta com o ícone da própria marca, as opções
 * reais (Mac, Windows, celular, navegador) e o jeito sem aviso pelo Terminal. O instalador do sistema do visitante
 * ganha destaque pelo atributo data-os do <html> (OsHint). Links abrem os sites oficiais de cada produto.
 */
import type { ReactNode } from 'react'
import { Pill, ProductMark } from '@zro/ui'
import { DOWNLOADS, hasDesktopInstaller, type DownloadOption, type Os } from '@/lib/downloads'
import { HUB_DESKTOP_OPCOES, SEM_INSTALADOR, type Disponibilidade } from '@/lib/hub-desktop-release'
import { AppActions } from './app-actions'
import { productColor } from './app-tile'
import { CopyButton } from './copy-button'
import { Icon, type IconName } from './icons'

export type CatalogProduct = { id: string; name: string; role: string; provisional?: boolean }

/** Instalação do app Absolute ZRO pelo Terminal (public/instalar.sh e instalar.ps1). */
const HUB_TERMINAL = {
  mac: 'curl -fsSL https://absolutezro.com/instalar.sh | bash',
  windows: 'irm https://absolutezro.com/instalar.ps1 | iex',
}

const OS_ICON: Record<Os, IconName> = { mac: 'laptop', windows: 'monitor', mobile: 'phone', web: 'globe' }

const STATUS: Record<string, { label: string; tone: 'ok' | 'accent' | 'faint' | 'neutral' }> = {
  stable: { label: 'Disponível', tone: 'ok' },
  test: { label: 'Versão de teste', tone: 'accent' },
  web: { label: 'Sem instalar', tone: 'neutral' },
  soon: { label: 'Em desenvolvimento', tone: 'faint' },
}

function Option({ o, name }: { o: DownloadOption; name: string }) {
  const installer = o.os === 'mac' || o.os === 'windows'
  return (
    <a className="dl-opt" data-os={o.os} href={o.href} target="_blank" rel="noopener noreferrer">
      <span className="dl-opt__icon" aria-hidden="true">
        <Icon name={OS_ICON[o.os]} size={20} />
      </span>
      <span className="dl-opt__text">
        <strong>{o.label}</strong>
        <span>{o.detail}</span>
      </span>
      <span className="dl-opt__action">
        <Icon name={installer ? 'download' : 'external'} size={16} />
        <span>{installer ? o.format.replace('Instalador ', '') : 'Abrir'}</span>
      </span>
      <span className="dl-opt__mine" aria-hidden="true">
        Recomendado
      </span>
      <span className="zro-sr-only">{installer ? `Baixar ${name} para ${o.label} (${o.format})` : `Abrir ${name}: ${o.label}`}, abre em nova aba</span>
    </a>
  )
}

export function DownloadCatalog({
  products,
  accessPill,
  hubDisponivel = false,
  liberado,
}: {
  products: CatalogProduct[]
  accessPill?: (productId: string) => ReactNode
  /** Com o Absolute ZRO para computador no ar, o instalador avulso de cada ferramenta fica recolhido (reserva). */
  hubDisponivel?: boolean
  /** Ferramentas que a organização pode instalar pela central (dentro do app). Sem isso, nenhuma ação aparece. */
  liberado?: (productId: string) => boolean
}) {
  const byId = new Map(products.map((p) => [p.id, p]))
  return (
    <div className="dl-list">
      {DOWNLOADS.filter((d) => byId.has(d.productId)).map((d) => {
        const p = byId.get(d.productId)!
        const st = STATUS[d.status]!
        return (
          <article
            key={d.productId}
            id={`app-${d.productId}`}
            className={`dl-app${d.status === 'soon' ? ' dl-app--soon' : ''}`}
            style={productColor(d.productId)}
          >
            <div className="dl-app__glow" aria-hidden="true" />
            <header className="dl-app__head">
              <ProductMark productId={d.productId} name={p.name} size={72} />
              <div className="dl-app__title">
                <h2>
                  {p.name}
                  {p.provisional && <span className="zro-faint"> · nome provisório</span>}
                </h2>
                <p className="zro-mute">{p.role}</p>
              </div>
              <div className="dl-app__pills">
                {accessPill?.(d.productId)}
                <Pill tone={st.tone}>{st.label}</Pill>
              </div>
            </header>
            {d.note && <p className="dl-app__note">{d.note}</p>}
            {liberado && hasDesktopInstaller(d.productId) && <AppActions id={d.productId} nome={p.name} liberado={liberado(d.productId)} />}
            {d.options.length > 0 ? (
              (() => {
                const instaladores = d.options.filter((o) => o.os === 'mac' || o.os === 'windows')
                const outras = d.options.filter((o) => o.os !== 'mac' && o.os !== 'windows')
                const direto = (
                  <div className="dl-opts dl-opts--instalador">
                    {instaladores.map((o) => (
                      <Option key={o.href} o={o} name={p.name} />
                    ))}
                  </div>
                )
                return (
                  <>
                    {outras.length > 0 && (
                      <div className="dl-opts">
                        {outras.map((o) => (
                          <Option key={o.href} o={o} name={p.name} />
                        ))}
                      </div>
                    )}
                    {instaladores.length > 0 &&
                      (hubDisponivel ? (
                        <details className="dl-direto">
                          <summary>Baixar só o {p.name}, sem o Absolute ZRO</summary>
                          {direto}
                        </details>
                      ) : (
                        direto
                      ))}
                  </>
                )
              })()
            ) : (
              <p className="zro-faint">Entra aqui quando for lançado. Nada para instalar ainda.</p>
            )}
            {(d.terminal || d.firstOpen) && (
              <details className="dl-help">
                <summary>
                  <Icon name="terminal" size={16} />
                  Como instalar e abrir na primeira vez
                </summary>
                <div className="dl-help__body">
                  {d.firstOpen?.mac && (
                    <p>
                      <strong>Mac:</strong> {d.firstOpen.mac}
                    </p>
                  )}
                  {d.firstOpen?.windows && (
                    <p>
                      <strong>Windows:</strong> {d.firstOpen.windows}
                    </p>
                  )}
                  {d.terminal?.mac && (
                    <div className="dl-cmd">
                      <span>Mac, pelo Terminal (confere o arquivo e evita o aviso)</span>
                      <div className="dl-cmd__row">
                        <code>{d.terminal.mac}</code>
                        <CopyButton text={d.terminal.mac} label={`Copiar comando de instalação do ${p.name} para Mac`} />
                      </div>
                    </div>
                  )}
                  {d.terminal?.windows && (
                    <div className="dl-cmd">
                      <span>Windows, pelo PowerShell</span>
                      <div className="dl-cmd__row">
                        <code>{d.terminal.windows}</code>
                        <CopyButton text={d.terminal.windows} label={`Copiar comando de instalação do ${p.name} para Windows`} />
                      </div>
                    </div>
                  )}
                  {d.moreUrl && (
                    <p>
                      <a href={d.moreUrl} target="_blank" rel="noopener noreferrer">
                        Página oficial de download do {p.name}
                      </a>
                    </p>
                  )}
                </div>
              </details>
            )}
          </article>
        )
      })}
    </div>
  )
}

/** Cabeçalho comum: o que existe hoje e o app Absolute ZRO para computador (Release "hub-desktop"). */
export function DownloadsIntro({ heading, hub = SEM_INSTALADOR, aviso }: { heading: 'h1' | 'h2'; hub?: Disponibilidade; aviso?: boolean }) {
  const H = heading
  const opcoes = HUB_DESKTOP_OPCOES.filter((o) => hub[o.os])
  return (
    <div className="dl-intro">
      <div className="greet">
        <p className="zro-eyebrow">Downloads</p>
        <H className="display-2 atitle atitle--inline">
          <span className="atitle__thin">Instale</span> <span className="atitle__bold">as ferramentas.</span>
        </H>
        <p className="zro-mute">Tudo num lugar só, com a mesma conta.</p>
      </div>
      <aside id="absolute-zro" className="dl-central zro-card">
        <Icon name="download" size={22} />
        <div>
          <strong>Absolute ZRO para computador{hub.versao ? ` · ${hub.versao}` : ''}</strong>
          {opcoes.length ? (
            <>
              <p>Instale uma vez e baixe, abra e atualize todas as ferramentas por ele, com a mesma conta.</p>
              <p>
                {opcoes.map((o) => (
                  <a key={o.os} className="zro-btn zro-btn--small" href={`/baixar/hub/${o.os}`} title={o.detail}>
                    <Icon name={OS_ICON[o.os]} size={16} />
                    {o.label} ({o.format})
                  </a>
                ))}
              </p>
              {/* Pelo Terminal, como no SOBEDESCE: confere o SHA-256 e instala sem o aviso de app não assinado. */}
              {hub.mac && (
                <div className="dl-cmd">
                  <span>Mac, pelo Terminal (confere o arquivo e evita o aviso)</span>
                  <div className="dl-cmd__row">
                    <code>{HUB_TERMINAL.mac}</code>
                    <CopyButton text={HUB_TERMINAL.mac} label="Copiar comando de instalação do Absolute ZRO para Mac" />
                  </div>
                </div>
              )}
              {hub.windows && (
                <div className="dl-cmd">
                  <span>Windows, pelo PowerShell</span>
                  <div className="dl-cmd__row">
                    <code>{HUB_TERMINAL.windows}</code>
                    <CopyButton text={HUB_TERMINAL.windows} label="Copiar comando de instalação do Absolute ZRO para Windows" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <p>
              {aviso ? 'O instalador ainda não está no ar. ' : ''}Em breve para Mac e Windows. Enquanto isso, o HUB funciona no navegador e cada ferramenta
              baixa daqui.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
