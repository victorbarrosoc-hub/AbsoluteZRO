// Avisos de rede do macOS na tela Dispositivos (components/computadores.js): Rede Local e Firewall (src/server/rede.js).
// Valem para "Entre computadores": sem eles, outro computador não conecta neste.
import { html, useState } from '/vendor/preact-htm.js'
import { api, attempt } from '../lib/api.js'
import { abrirAjustesRede } from '../lib/desktop.js'
import { Icon } from './icons.js'
import { Button } from './common.js'

// macOS 15+ sem a permissão de Rede Local (src/celular/rede-local.js): o outro computador acha este pela conta, mas a
// conexão direta nunca abre. Mostra onde ligar e confere de novo.
export function AvisoRedeLocal({ i = 0 }) {
  const [ocupado, setOcupado] = useState(false)
  const conferir = async () => {
    setOcupado(true)
    await attempt(api.post('/api/rede/conferir', {}))
    setOcupado(false)
  }
  return html`<section class="dv-pedido is-aviso k-entra" style=${`--i:${i}`} role="alert" aria-label="Rede local bloqueada">
    <span class="dv-pedido-ic" aria-hidden="true"><${Icon} name="warning" size=${22} strokeWidth=${1.8} /></span>
    <div class="dv-pedido-txt">
      <span class="k-rot">Entre computadores</span>
      <h2>O Mac está bloqueando a rede local para o SOBEDESCE</h2>
      <p>Sem isso, outro computador acha este mas não conecta. Em Ajustes do Sistema → Privacidade e Segurança → Rede Local, ligue o SOBEDESCE.</p>
    </div>
    <div class="dv-pedido-acoes">
      <${Button} onClick=${conferir} disabled=${ocupado}>Conferir de novo</${Button}>
      <button type="button" class="k-botao dv-aceitar" onClick=${() => abrirAjustesRede()}>
        <${Icon} name="sliders" size=${18} strokeWidth=${2} />Abrir Ajustes
      </button>
    </div>
  </section>`
}

// Firewall do macOS ligado sem "Permitir" para o SOBEDESCE (src/celular/firewall.js): as conexões que chegam de outro
// computador são recusadas.
export function AvisoFirewall({ fw, i = 0 }) {
  const [ocupado, setOcupado] = useState(false)
  const conferir = async () => {
    setOcupado(true)
    await attempt(api.post('/api/rede/conferir', {}))
    setOcupado(false)
  }
  return html`<section class="dv-pedido is-aviso k-entra" style=${`--i:${i}`} role="alert" aria-label="Firewall bloqueando">
    <span class="dv-pedido-ic" aria-hidden="true"><${Icon} name="shield" size=${22} strokeWidth=${1.8} /></span>
    <div class="dv-pedido-txt">
      <span class="k-rot">Entre computadores</span>
      <h2>${fw.bloquearTudo ? 'O Firewall do Mac está bloqueando todas as conexões' : 'O Firewall do Mac não deixa o SOBEDESCE receber conexões'}</h2>
      <p>${fw.bloquearTudo
        ? 'Em Ajustes do Sistema → Rede → Firewall → Opções, desligue “Bloquear todas as conexões de entrada”.'
        : 'Em Ajustes do Sistema → Rede → Firewall → Opções, clique em +, escolha o SOBEDESCE em Aplicativos e deixe “Permitir conexões de entrada”.'}</p>
    </div>
    <div class="dv-pedido-acoes">
      <${Button} onClick=${conferir} disabled=${ocupado}>Conferir de novo</${Button}>
      <button type="button" class="k-botao dv-aceitar" onClick=${() => abrirAjustesRede('firewall')}>
        <${Icon} name="sliders" size=${18} strokeWidth=${2} />Abrir Ajustes
      </button>
    </div>
  </section>`
}
