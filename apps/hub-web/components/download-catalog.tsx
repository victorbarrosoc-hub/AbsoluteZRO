/**
 * Topo da página Downloads e a lista de ferramentas para o DownloadPicker. Central única (ADR 0049, titular,
 * 01/11/2026): o único download é a Absolute ZRO (Mac e Windows), com o passo a passo e a linha do Terminal; cada app
 * se instala e se atualiza por ela. O sistema do visitante ganha destaque pelo atributo data-os do <html> (OsHint).
 */
import { downloadsLiberados, HUB_TERMINAL, PASSOS, SO_PARA_ADMIN, type Os } from '@/lib/downloads'
import { HUB_DESKTOP_OPCOES, SEM_INSTALADOR, type Disponibilidade } from '@/lib/hub-desktop-release'
import { productColor } from './app-tile'
import { CopyButton } from './copy-button'
import type { PickerApp } from './download-picker'
import { Icon, type IconName } from './icons'

export type CatalogProduct = { id: string; name: string; role: string; provisional?: boolean }

const OS_ICON: Record<Os, IconName> = { mac: 'laptop', windows: 'monitor', mobile: 'phone', web: 'globe' }

/**
 * As ferramentas do catálogo com o que cada uma tem para baixar, na ordem do fluxo (para o DownloadPicker). Os
 * `liberados` (canal download, ADR 0023) instalam pela Absolute ZRO; os de `naWeb` (web aberta, download fechado), só o
 * navegador e o celular; os outros aparecem como "Em desenvolvimento", ou nem aparecem com `soDisponiveis` (página
 * pública: o que não está no ar não é divulgado, titular 30/10/2026). AEON, Revela, NOSSOM e Rift Motion só para
 * `admin` (titular, 01/11/2026).
 */
export function appsParaBaixar(
  products: CatalogProduct[],
  liberados: ReadonlySet<string>,
  extra?: (id: string) => Partial<PickerApp>,
  opcoes: { naWeb?: ReadonlySet<string>; soDisponiveis?: boolean; admin?: boolean } = {},
): PickerApp[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const downloads = downloadsLiberados(liberados, opcoes.naWeb)
  return products
    .map((p) => downloads.find((d) => d.productId === p.id))
    .filter((d): d is (typeof downloads)[number] => !!d && byId.has(d.productId) && !(opcoes.soDisponiveis && d.status === 'soon'))
    .filter((d) => opcoes.admin || !SO_PARA_ADMIN.has(d.productId))
    .map((d) => ({
      ...d,
      name: byId.get(d.productId)!.name,
      role: byId.get(d.productId)!.role,
      cor: productColor(d.productId),
      ...(d.status === 'soon' ? {} : extra?.(d.productId)),
    }))
}

function Comando({ titulo, cmd, rotulo, os }: { titulo: string; cmd: string; rotulo: string; os: 'mac' | 'windows' }) {
  return (
    <div className="dl-cmd" data-os={os}>
      <span>{titulo}</span>
      <div className="dl-cmd__row">
        <code>{cmd}</code>
        <CopyButton text={cmd} label={rotulo} />
      </div>
    </div>
  )
}

/** O download da Absolute ZRO: os dois botões, o passo a passo de cada sistema e, ao lado, o jeito pelo Terminal. */
export function DownloadsIntro({ heading, hub = SEM_INSTALADOR, aviso }: { heading: 'h1' | 'h2'; hub?: Disponibilidade; aviso?: boolean }) {
  const H = heading
  const opcoes = HUB_DESKTOP_OPCOES.filter((o) => hub[o.os])
  return (
    <div className="dl-intro">
      <div className="greet">
        <p className="zro-eyebrow">Downloads</p>
        <H className="display-2 atitle atitle--inline">
          <span className="atitle__thin">Um app.</span> <span className="atitle__bold">Todas as ferramentas.</span>
        </H>
        <p className="zro-mute">A Absolute ZRO instala e atualiza cada uma, com a sua conta.</p>
      </div>
      <section id="absolute-zro" className="dl-central" aria-labelledby="dl-central-titulo">
        <img className="dl-central__icone" src="/brand/app-icon-mac-1024.png" alt="" width={88} height={88} />
        <div className="dl-central__texto">
          <h2 id="dl-central-titulo">Absolute ZRO{hub.versao ? <span> · {hub.versao}</span> : null}</h2>
          {opcoes.length ? (
            <div className="dl-central__botoes">
              {opcoes.map((o) => (
                <a key={o.os} className="glass-btn dl-central__baixar" data-os={o.os} href={`/baixar/hub/${o.os}`} title={o.detail}>
                  <Icon name={OS_ICON[o.os]} size={16} />
                  Baixar para {o.label}
                </a>
              ))}
            </div>
          ) : (
            <p>{aviso ? 'Estamos preparando a próxima versão. ' : ''}Em breve para Mac e Windows.</p>
          )}
        </div>
        {opcoes.length > 0 && (
          <div className="dl-passos">
            {opcoes.map((o) => (
              <div key={o.os} className="dl-passos__sistema" data-os={o.os}>
                <h3>
                  <Icon name={OS_ICON[o.os]} size={16} /> {o.label}
                </h3>
                <ol>
                  {PASSOS[o.os].map((p, i) => (
                    <li key={i}>
                      <span>{p.texto}</span>
                      {p.dica && <small>{p.dica}</small>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <div className="dl-passos__terminal">
              <h3>
                <Icon name="terminal" size={16} /> Pelo Terminal
              </h3>
              <p>Cole e aperte Enter. Baixa, confere e instala.</p>
              {hub.mac && <Comando os="mac" titulo="Mac · Terminal" cmd={HUB_TERMINAL.mac} rotulo="Copiar comando de instalação da Absolute ZRO para Mac" />}
              {hub.windows && (
                <Comando
                  os="windows"
                  titulo="Windows · PowerShell"
                  cmd={HUB_TERMINAL.windows}
                  rotulo="Copiar comando de instalação da Absolute ZRO para Windows"
                />
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
