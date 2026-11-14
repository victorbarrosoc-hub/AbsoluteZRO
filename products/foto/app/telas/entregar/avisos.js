// Os avisos na Entregar: o cliente enviou a escolha, um visitante pediu fotos. Uma linha por aviso (o trabalho, quem e
// quantas) com "Abrir"; só aparece quando há aviso. A loja é a da casca (app/casca/avisos.js), que já consulta sozinha.

import { html } from '../../preact.js'
import { marcar, pedirNotificacao, usarAvisos } from '../../casca/avisos.js'
import { dataTexto, fotosTexto } from './comum.js'

const MOSTRAR = 4

/** "agora", "há 5 min", "há 2 h", "ontem" ou a data. */
export function quandoTexto(iso, agora = Date.now()) {
  const min = Math.round((agora - Date.parse(iso)) / 60000)
  if (!Number.isFinite(min) || min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`
  if (min < 48 * 60) return 'ontem'
  return dataTexto(iso)
}

const linha = (a) => `${a.quem} ${a.tipo === 'escolha' ? 'escolheu' : 'pediu'} ${fotosTexto(a.fotos)} · ${quandoTexto(a.em)}`

export function ListaDeAvisos({ aoAbrir }) {
  const { avisos, naoLidos, permissao } = usarAvisos()
  if (!avisos.length) return null
  const mais = naoLidos - Math.min(avisos.length, MOSTRAR)
  return html`<section class="entregar-avisos cartao entra" aria-label="Avisos" data-avisos=${naoLidos}>
    <ul class="entregar-avisos-lista">
      ${avisos.slice(0, MOSTRAR).map(
        (a) =>
          html`<li class="aviso-item" key=${a.id} data-aviso=${a.tipo}>
            <span class="aviso-ponto" aria-hidden="true"></span>
            <span class="aviso-texto"><strong>${a.nome}</strong><small>${linha(a)}</small></span>
            <button type="button" class="vidro" onClick=${() => aoAbrir(a)} data-abrir-aviso>Abrir</button>
          </li>`,
      )}
    </ul>
    ${
      mais > 0 || avisos.length > 1 || permissao === 'default'
        ? html`<div class="entregar-avisos-pe">
            ${mais > 0 ? html`<span class="apoio">E mais ${mais}.</span>` : null}
            ${
              permissao === 'default'
                ? html`<button type="button" class="link" onClick=${pedirNotificacao} data-notificar>Avisar neste computador</button>`
                : null
            }
            ${
              avisos.length > 1
                ? html`<button type="button" class="link" onClick=${() => marcar({ todos: true })} data-lidos>Marcar como lidos</button>`
                : null
            }
          </div>`
        : null
    }
  </section>`
}
