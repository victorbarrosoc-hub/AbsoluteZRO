// Conta e Ajustes: a conta (a Absolute ZRO: nome e foto da conta, o "você" do topo), qual Drive recebe (com o
// e-mail e a foto do Drive), o espaço nele e o tipo de rede (que define quantos arquivos sobem juntos e o pedaço).
import { html, useState } from '../vendor/preact-htm.js'
import { ACCOUNT, CHUNK_AUTO, DEV, LAN, VERSION, getSettings, saveSettings } from '../lib/config.js'
import { bytes, percent } from '../lib/format.js'
import { fraction, isActive } from '../lib/computador.js'
import { closeSheet, openSheet, useApp } from '../lib/state.js'
import { engine } from '../lib/uploader.js'
import { Icon } from './icons.js'
import { SheetHead } from './ui.js'
import { Barra, Linha, Linhas, Opcoes, Passo } from './kit.js'
import { Avatar, contaComoUser } from './main.js'
import { AceitarOutros } from './p2p.js'
import { DICA_MODO, NOME_MODO, modoDe } from '../lib/modo-drive.js'

/** Drive híbrido: o modo deste Drive numa linha, com o que muda recolhido (os mesmos textos de Sua conta no site). */
export function ModoDoDrive({ drive }) {
  if (!drive) return null
  const modo = modoDe(drive)
  return html`<div class="k-modo" data-modo-drive=${modo}>
    <div class="k-modo-linha">
      <span>Acesso ao Drive</span>
      <b><span class=${modo === 'total' ? 'k-modo-ponto is-total' : 'k-modo-ponto'} aria-hidden="true"></span>${NOME_MODO[modo]}</b>
    </div>
    <details class="k-modo-dica">
      <summary>O que muda</summary>
      <ul>${DICA_MODO[modo].map((t) => html`<li>${t}</li>`)}</ul>
    </details>
  </div>`
}

// Os outros apps da Absolute ZRO, cada um com o próprio ícone (cópias em icons/familia/). Abrem fora do app.
const FAMILIA = [
  { href: 'https://absolutezro.com', nome: 'Absolute ZRO', img: 'icons/familia/absolute-zro.png' },
  { href: 'https://carro.absolutezro.com', nome: 'Carro do Freela', img: 'icons/familia/carro-do-freela.png' },
  { href: 'https://relay.absolutezro.com', nome: 'Relay', img: 'icons/familia/relay.svg' },
  { href: 'https://synquei.absolutezro.com', nome: 'Synquei', img: 'icons/familia/synquei.svg' },
  { href: 'https://tpeasy.absolutezro.com', nome: 'TPeasy', img: 'icons/familia/tpeasy.svg' },
]
// Maestro na família (lançamento em Beta grátis, docs/operations/lancamento-maestro.md): fica de fora até o titular
// abrir; vira com `node scripts/lancamento-maestro.mjs --abrir` (e volta com --fechar).
const MAESTRO_NA_FAMILIA = true
// em ordem alfabética, depois da Absolute ZRO e do Carro do Freela
if (MAESTRO_NA_FAMILIA) FAMILIA.splice(2, 0, { href: 'https://maestro.absolutezro.com', nome: 'Maestro', img: 'icons/familia/maestro.svg' })

function Familia() {
  return html`<section class="k-familia k-entra" style="--i:5" aria-label="Absolute ZRO">
    <p class="list-label">Absolute ZRO</p>
    <div class="k-linhas">
      ${FAMILIA.map(
        (f) => html`<a class="k-linha is-botao" href=${f.href} target="_blank" rel="noopener noreferrer">
          <img class="k-familia-ic" src=${f.img} alt="" width="30" height="30" />
          <span class="k-linha-txt"><b>${f.nome}</b></span>
          <span class="k-linha-ctl"><${Icon} name="external" size=${15} class="k-seta" /></span>
        </a>`,
      )}
    </div>
  </section>`
}

function Storage({ quota }) {
  if (!quota) return null
  const usage = Number(quota.usage) || 0
  const limit = quota.limit != null ? Number(quota.limit) : null
  const frac = limit ? Math.min(1, usage / limit) : 0
  return html`<div class="k-espaco">
    <div class="k-espaco-num"><b>${limit ? bytes(Math.max(0, limit - usage)) : bytes(usage)}</b><span>${limit ? 'livres' : 'usados · sem limite'}</span></div>
    ${limit ? html`<${Barra} p=${frac} tom=${frac > 0.9 ? 'erro' : null} label="Espaço usado no Drive" />` : null}
    ${limit ? html`<span class="k-espaco-sub">${bytes(usage)} de ${bytes(limit)} usados</span>` : null}
  </div>`
}

// Uma escolha só, no lugar de "arquivos ao mesmo tempo" e "tamanho do pedaço": por baixo, os mesmos valores que o
// motor de envio usa. Automático (o padrão) mede a rede e escolhe o pedaço sozinho; as outras duas são tamanhos
// fixos para quem prefere. Quem tinha valores salvos à mão: 3 ou mais arquivos juntos conta como Wi-Fi rápido.
const NETWORKS = {
  auto: { label: 'Automático', curto: 'Mede a rede', icone: 'gauge', help: 'Mede a rede e ajusta o tamanho de cada pedaço.', concurrency: 2, chunkMiB: CHUNK_AUTO },
  mobile: { label: 'Celular', curto: '4G e 5G', icone: 'phone', help: 'Pedaços pequenos: mais estável no 4G e 5G.', concurrency: 2, chunkMiB: 8 },
  wifi: { label: 'Wi-Fi rápido', curto: 'Rede boa', icone: 'wifi', help: 'Mais arquivos ao mesmo tempo, para rede boa.', concurrency: 4, chunkMiB: 16 },
}
const networkOf = (s) => (s.chunkMiB === CHUNK_AUTO ? 'auto' : s.concurrency >= 3 ? 'wifi' : 'mobile')

/** A linha de "No computador" em Ajustes: sempre aparece, mesmo sem nada nas últimas 24 h. */
function pcSummary(pcs = []) {
  const ativo = pcs.find((pc) => isActive(pc))
  if (ativo) return `${ativo.nome} · ${percent(fraction(ativo.snapshot))}`
  if (pcs.length) return pcs.length === 1 ? `${pcs[0].nome} · nada passando agora` : `${pcs.length} computadores · nada passando agora`
  return 'Acompanhe o app do computador'
}

/** Você: a conta Absolute ZRO (nome e foto da conta), no topo da folha que o avatar abre. Drives e sair ficam nela. */
function Conta({ account, drives }) {
  const voce = contaComoUser(account)
  return html`<${Passo} icone="user" cor="up" titulo=${voce?.displayName || 'Sua conta'} frase=${account?.email || 'Drives, computadores e sair ficam na sua conta.'} i=${0}
    class="settings-conta" acao=${html`<${Avatar} user=${voce} size=${40} />`}
  >
    <${Linhas}>
      <a class="k-linha is-botao" href=${ACCOUNT.manage}>
        <span class="k-linha-ic" style="--c:var(--up)"><${Icon} name="user" size=${17} strokeWidth=${1.8} /></span>
        <span class="k-linha-txt"><b>Minha conta</b><span>Drives, computadores e sair</span></span>
        <span class="k-linha-ctl"><${Icon} name="chevron-right" size=${16} class="k-seta" /></span>
      </a>
      <${Linha} icone="drive" titulo=${drives.length > 1 ? 'Trocar de Google Drive' : 'Google Drive'} onClick=${() => openSheet('drives')} />
    </${Linhas}>
  </${Passo}>`
}

export function SettingsSheet() {
  const { user, quota, lan, account, drives, pcs, drive } = useApp((s) => ({ user: s.user, quota: s.quota, lan: s.lan, account: s.account, drives: s.drives, pcs: s.pc.computadores, drive: s.drive }))
  const [settings, setSettings] = useState(getSettings())
  const network = networkOf(settings)

  const update = (patch) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
    engine.pump()
  }

  return html`<${SheetHead}
      title="Ajustes"
      right=${html`<button type="button" class="link-btn is-strong" onClick=${closeSheet}>OK</button>`}
    />
    <div class="sheet-body sheet-scroll settings k-folha">
      ${LAN ? null : html`<${Conta} account=${account} drives=${drives} />`}

      <${Passo} icone=${LAN ? 'wifi' : 'drive'} cor="down" titulo=${LAN ? user?.displayName || 'Google Drive' : 'Google Drive'} frase=${user?.emailAddress || (LAN ? `Pelo ${LAN.label} “${lan?.mac || LAN.mac}”` : 'O Drive que recebe os envios')} i=${LAN ? 0 : 1}
        acao=${html`<${Avatar} user=${user} size=${40} />`}
      >
        ${quota ? html`<${Storage} quota=${quota} />` : null}
        ${LAN ? null : html`<${ModoDoDrive} drive=${drive} />`}
      </${Passo}>

      <${Passo} icone="bolt" cor="up" titulo="Envio" frase=${NETWORKS[network].help} i=${2}>
        <${Opcoes}
          label="Sua rede"
          valor=${network}
          onEscolher=${(v) => update({ concurrency: NETWORKS[v].concurrency, chunkMiB: NETWORKS[v].chunkMiB })}
          itens=${Object.entries(NETWORKS).map(([value, n]) => ({ value, titulo: n.label, sub: n.curto, icone: n.icone, up: true }))}
        />
      </${Passo}>

      ${LAN
        ? html`<${Passo} icone="wifi" cor="ok" titulo="Wi-Fi" i=${2}>
            <p class="k-texto">
              Os arquivos vão deste celular para o ${LAN.label} pela rede local, e o SOBEDESCE de lá sobe pro Drive na conta
              acima${lan?.deleteAfterUpload ? ' (e apaga a cópia do computador depois de conferir)' : ''}. A pasta padrão e a conta
              se trocam no computador, em Ajustes → Celular.
            </p>
          </${Passo}>`
        : html`<${Passo} icone="laptop" cor="down" titulo="No computador" i=${3}>
            <${Linhas}>
              <${Linha} icone="transfers" titulo="Transferências do computador" sub=${pcSummary(pcs)} onClick=${() => openSheet('computador')} />
            </${Linhas}>
          </${Passo}>
          <${Passo} icone="users" cor="warn" titulo="No Wi-Fi" i=${4}>
            <${AceitarOutros} />
          </${Passo}>`}

      <${Familia} />

      <p class="foot">
        SOBEDESCE Celular ${VERSION}${DEV ? ' · modo de teste' : LAN ? ' · pelo Wi-Fi' : ''}<br />${LAN
          ? 'Nada passa pela internet até o computador; de lá, direto pro Google.'
          : 'Os arquivos vão direto deste aparelho para o Google.'}
      </p>
    </div>`
}
SettingsSheet.label = 'Ajustes'
SettingsSheet.tall = false
