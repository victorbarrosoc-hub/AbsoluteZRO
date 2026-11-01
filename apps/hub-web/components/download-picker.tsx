'use client'
/**
 * Downloads em dois tempos: primeiro só os ícones das ferramentas; ao tocar num, abre embaixo a parte dele: "Instale
 * pela Absolute ZRO" (no computador, todo app se instala e se atualiza pela central, ADR 0035), o navegador e o celular,
 * e o "Conheça mais", que leva à página da plataforma. O endereço guarda a escolha (#app-<id>), então os links
 * "absolutezro.com/baixar#app-synquei" dos sites de cada app abrem direto no lugar certo. Dentro do app de computador,
 * quem instala é a central (AppActions).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Pill, ProductMark } from '@zro/ui'
import type { DownloadEntry, DownloadOption, Os } from '@/lib/downloads'
import { AppActions } from './app-actions'
import { Icon, type IconName } from './icons'

/** `liberado` só existe dentro do HUB logado: com ele, a central do app de computador instala por aqui. */
export type PickerApp = DownloadEntry & { name: string; role: string; cor: CSSProperties; contratada?: boolean; liberado?: boolean }

const OS_ICON: Record<Os, IconName> = { mac: 'laptop', windows: 'monitor', mobile: 'phone', web: 'globe' }

const STATUS: Record<string, { label: string; tone: 'ok' | 'accent' | 'faint' | 'neutral' }> = {
  stable: { label: 'Disponível', tone: 'ok' },
  test: { label: 'Versão de teste', tone: 'accent' },
  web: { label: 'Sem instalar', tone: 'neutral' },
  soon: { label: 'Em desenvolvimento', tone: 'faint' },
}

function Opcao({ o, name }: { o: DownloadOption; name: string }) {
  const instalador = o.os === 'mac' || o.os === 'windows'
  return (
    <a className="dl-opt" data-os={o.os} href={o.href} target={instalador ? undefined : '_blank'} rel="noopener noreferrer">
      <span className="dl-opt__icon" aria-hidden="true">
        <Icon name={OS_ICON[o.os]} size={20} />
      </span>
      <span className="dl-opt__text">
        <strong>{o.label}</strong>
        <span>{o.detail}</span>
      </span>
      <span className="dl-opt__action">
        <Icon name={instalador ? 'download' : 'external'} size={16} />
        <span>{instalador ? o.format.replace('Instalador ', '') : 'Abrir'}</span>
      </span>
      <span className="dl-opt__mine" aria-hidden="true">
        Recomendado
      </span>
      <span className="zro-sr-only">{instalador ? `Baixar ${name} para ${o.label} (${o.format})` : `Abrir ${name}: ${o.label}, em nova aba`}</span>
    </a>
  )
}

/** No computador, cada app se instala e se atualiza pela Absolute ZRO: o cartão leva ao download dela, no topo. */
function PelaCentral({ name }: { name: string }) {
  return (
    <a className="dl-opt dl-opt--central" href="#absolute-zro">
      <span className="dl-opt__icon" aria-hidden="true">
        <img src="/brand/app-icon-mac-1024.png" alt="" width={28} height={28} />
      </span>
      <span className="dl-opt__text">
        <strong>Instale pela Absolute ZRO</strong>
        <span>Mac e Windows</span>
      </span>
      <span className="dl-opt__action">
        <Icon name="download" size={16} />
        <span>Baixar</span>
      </span>
      <span className="zro-sr-only">{`Instalar ${name} no computador pela Absolute ZRO`}</span>
    </a>
  )
}

export function DownloadPicker({ apps }: { apps: PickerApp[] }) {
  const [ativo, setAtivo] = useState<string | null>(null)
  const painel = useRef<HTMLDivElement>(null)

  // #app-<id> no endereço abre o app certo (links dos sites de cada ferramenta e do app de computador)
  useEffect(() => {
    const ler = () => {
      const id = decodeURIComponent(location.hash.replace(/^#app-/, ''))
      if (location.hash.startsWith('#app-') && apps.some((a) => a.productId === id)) {
        setAtivo(id)
        requestAnimationFrame(() => painel.current?.scrollIntoView({ block: 'nearest' }))
      }
    }
    ler()
    addEventListener('hashchange', ler)
    return () => removeEventListener('hashchange', ler)
  }, [apps])

  const escolher = (id: string) => {
    const novo = ativo === id ? null : id
    setAtivo(novo)
    history.replaceState(null, '', novo ? `#app-${novo}` : location.pathname + location.search)
  }

  const app = apps.find((a) => a.productId === ativo) ?? null
  // o app tem versão para computador: instala pela Absolute ZRO (o instalador avulso saiu da página, ADR 0035)
  const noComputador = !!app?.options.some((o) => o.os === 'mac' || o.os === 'windows')
  const outras = app?.options.filter((o) => o.os !== 'mac' && o.os !== 'windows') ?? []
  const st = app ? STATUS[app.status]! : null

  return (
    <div className="dl-picker">
      <ul className="dl-picker__icones" aria-label="Ferramentas">
        {apps.map((a, i) => (
          <li key={a.productId} style={{ ...a.cor, '--i': i } as CSSProperties}>
            <button
              type="button"
              className="dl-picker__app"
              aria-expanded={ativo === a.productId}
              aria-controls="dl-painel"
              onClick={() => escolher(a.productId)}
            >
              <ProductMark productId={a.productId} name={a.name} size={72} />
              <span>{a.name}</span>
              {a.status === 'soon' && <span className="selo-dev">Em desenvolvimento</span>}
            </button>
          </li>
        ))}
      </ul>

      <div ref={painel} id="dl-painel" className="dl-painel" data-aberto={app ? 'sim' : undefined}>
        <div className="dl-painel__dobra">
          {app && st && (
            <article id={`app-${app.productId}`} key={app.productId} className="dl-painel__app" style={app.cor} aria-label={`Baixar ${app.name}`}>
              <span className="dl-app__glow" aria-hidden="true" />
              <header className="dl-painel__topo">
                <ProductMark productId={app.productId} name={app.name} size={64} />
                <div className="dl-app__title">
                  <h2>{app.name}</h2>
                  <p className="zro-mute">{app.role}</p>
                </div>
                <div className="dl-app__pills">
                  {app.contratada && <Pill tone="ok">Contratada</Pill>}
                  <Pill tone={st.tone}>{st.label}</Pill>
                </div>
              </header>
              {app.note && <p className="dl-app__note">{app.note}</p>}
              {app.liberado !== undefined && app.status !== 'soon' && noComputador && (
                <AppActions id={app.productId} nome={app.name} liberado={app.liberado} web={null} />
              )}
              <div className="dl-opts dl-painel__opcoes">
                {noComputador && (
                  <span className="dl-opts--instalador">
                    <PelaCentral name={app.name} />
                  </span>
                )}
                {outras.map((o) => (
                  <Opcao key={o.href} o={o} name={app.name} />
                ))}
              </div>
              {app.site && (
                <div className="dl-painel__fim">
                  <a className="glass-btn" href={app.site} target="_blank" rel="noopener noreferrer">
                    Conheça mais
                    <span className="zro-sr-only"> sobre {app.name} (abre em nova aba)</span>
                  </a>
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  )
}
