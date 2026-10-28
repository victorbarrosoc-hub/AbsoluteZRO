/**
 * Topo da página Downloads (o app Absolute ZRO para computador) e a lista de ferramentas para o DownloadPicker. O
 * instalador do sistema do visitante ganha destaque pelo atributo data-os do <html> (OsHint).
 */
import { downloadsLiberados, type Os } from '@/lib/downloads'
import { HUB_DESKTOP_OPCOES, SEM_INSTALADOR, type Disponibilidade } from '@/lib/hub-desktop-release'
import { productColor } from './app-tile'
import { CopyButton } from './copy-button'
import type { PickerApp } from './download-picker'
import { Icon, type IconName } from './icons'

export type CatalogProduct = { id: string; name: string; role: string; provisional?: boolean }

/** Instalação do app Absolute ZRO pelo Terminal (public/instalar.sh e instalar.ps1). */
const HUB_TERMINAL = {
  mac: 'curl -fsSL https://absolutezro.com/instalar.sh | bash',
  windows: 'irm https://absolutezro.com/instalar.ps1 | iex',
}

const OS_ICON: Record<Os, IconName> = { mac: 'laptop', windows: 'monitor', mobile: 'phone', web: 'globe' }

/**
 * As ferramentas do catálogo com o que cada uma tem para baixar, na ordem do fluxo (para o DownloadPicker). Só os
 * `liberados` (canal download, ADR 0023) trazem instalador; os outros aparecem como "Em desenvolvimento".
 */
export function appsParaBaixar(products: CatalogProduct[], liberados: ReadonlySet<string>, extra?: (id: string) => Partial<PickerApp>): PickerApp[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const downloads = downloadsLiberados(liberados)
  return products
    .map((p) => downloads.find((d) => d.productId === p.id))
    .filter((d): d is (typeof downloads)[number] => !!d && byId.has(d.productId))
    .map((d) => ({
      ...d,
      name: byId.get(d.productId)!.name,
      role: byId.get(d.productId)!.role,
      cor: productColor(d.productId),
      ...(d.status === 'soon' ? {} : extra?.(d.productId)),
    }))
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
      <aside id="absolute-zro" className="dl-central" aria-labelledby="dl-central-titulo">
        <img className="dl-central__icone" src="/brand/app-icon-mac-1024.png" alt="" width={88} height={88} />
        <div className="dl-central__texto">
          <h2 id="dl-central-titulo">Absolute ZRO para computador{hub.versao ? <span> · {hub.versao}</span> : null}</h2>
          {opcoes.length ? (
            <>
              <p>Instale uma vez. Baixe, abra e atualize todas as ferramentas por ele.</p>
              <div className="dl-central__botoes">
                {opcoes.map((o, i) => (
                  <a key={o.os} className={`glass-btn${i === 0 ? ' glass-btn--ink' : ''}`} href={`/baixar/hub/${o.os}`} title={o.detail}>
                    <Icon name={OS_ICON[o.os]} size={16} />
                    {o.label} <span className="dl-central__fmt">{o.format}</span>
                  </a>
                ))}
              </div>
            </>
          ) : (
            <p>
              {aviso ? 'O instalador ainda não está no ar. ' : ''}Em breve para Mac e Windows. Enquanto isso, o HUB funciona no navegador e cada ferramenta
              baixa daqui.
            </p>
          )}
        </div>
        {/* Pelo Terminal, como no SOBEDESCE: confere o SHA-256 e instala sem o aviso de app não assinado. */}
        {(hub.mac || hub.windows) && (
          <details className="dl-help dl-central__terminal">
            <summary>
              <Icon name="terminal" size={16} />
              Instalar pelo Terminal
            </summary>
            <div className="dl-help__body">
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
            </div>
          </details>
        )}
      </aside>
    </div>
  )
}
