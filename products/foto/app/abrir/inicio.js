// O início: abrir fotos. O símbolo é o protagonista (o anel se desenha e o raio cruza), o nome fino × pesado com a
// assinatura, UMA ação principal ("Abrir pasta", onde o navegador deixa lembrar a pasta) e a secundária ("Escolher
// fotos", que também é o caminho do Safari, do Firefox e do celular). Soltar pasta ou arquivos funciona em qualquer
// lugar da janela (app/casca/casca.js). Embaixo, os trabalhos recentes em cartões.

import { cx, html, useEffect, useState } from '../preact.js'
import { ASSINATURA, NOME } from '../nome.js'
import { Icone } from '../icones.js'
import { Menu, Numero, Progresso } from '../componentes/base.js'
import { usarLoja } from '../estado.js'
import { Simbolo } from '../casca/simbolo.js'
import { guardar } from './guardar.js'

const plural = (n) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'foto' : 'fotos'}`

/** "hoje", "ontem", "há 5 dias", "12 de out." */
export function quandoFoi(ms, agora = Date.now()) {
  const dia = 86_400_000
  const hoje = new Date(agora).setHours(0, 0, 0, 0)
  const dias = Math.round((hoje - new Date(ms).setHours(0, 0, 0, 0)) / dia)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 7) return `há ${dias} dias`
  return new Date(ms).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

/** As duas ações de abrir. `principal`: a de pasta (ou a de fotos, onde não há pasta) vai em vidro escuro. */
export function AcoesDeAbrir({ loja, aoEscolher, grande = true }) {
  const comPasta = loja.temPasta()
  const tamanho = grande ? 'vidro--grande' : ''
  return html`<div class="inicio-acoes">
    ${comPasta
      ? html`<button type="button" class=${cx('vidro vidro--tinta', tamanho)} data-acao="abrir-pasta" onClick=${() => loja.abrirPasta()}><${Icone} nome="pasta" />Abrir pasta</button>`
      : null}
    <button type="button" class=${cx('vidro', !comPasta && 'vidro--tinta', tamanho)} data-acao="escolher-fotos" onClick=${aoEscolher}><${Icone} nome="fotos" />Escolher fotos</button>
  </div>`
}

function Capa({ ids }) {
  const [urls, definir] = useState([])
  useEffect(() => {
    let vivo = true
    const criadas = []
    Promise.all(ids.slice(0, 4).map((id) => guardar.miniatura(id, 'mini'))).then((blobs) => {
      if (!vivo) return
      for (const b of blobs) if (b) criadas.push(URL.createObjectURL(b))
      definir([...criadas])
    })
    return () => {
      vivo = false
      criadas.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [ids.join(',')])
  return html`<div class="recente-capa" data-fotos=${urls.length || 1}>${urls.length ? urls.map((u) => html`<img src=${u} alt="" decoding="async" draggable=${false} />`) : html`<span></span>`}</div>`
}

/** Os trabalhos guardados neste aparelho. `aoAbrir(id)` depois de abrir (para fechar a folha, por exemplo). */
export function Recentes({ loja, aoAbrir, menos }) {
  const [lista, definir] = useState(null)
  const carregar = () => loja.recentes().then((l) => definir(l.filter((t) => t.id !== menos)))
  useEffect(() => void carregar(), [menos])
  if (!lista?.length) return null
  return html`<section class="recentes" aria-label="Trabalhos recentes">
    <h2 class="sobretitulo">Recentes</h2>
    <div class="recentes-lista cascata">
      ${lista.map(
        (t, i) =>
          html`<article class="recente" key=${t.id} style=${`--i:${i}`} data-trabalho=${t.id}>
            <${Capa} ids=${t.capas || []} />
            <div class="recente-texto">
              <strong>${t.nome}</strong>
              <span>${plural(t.total || 0)} · ${quandoFoi(t.abertoEm || t.criadoEm)}</span>
            </div>
            <button
              type="button"
              class="recente-abrir"
              aria-label=${`Abrir ${t.nome}, ${plural(t.total || 0)}`}
              onClick=${async () => {
                await loja.abrirRecente(t.id)
                aoAbrir?.(t.id)
              }}
            ></button>
            <${Menu} rotulo=${`Mais sobre ${t.nome}`} lado="direita" gatilho=${html`<${Icone} nome="tres" />`} itens=${[{ rotulo: 'Tirar da lista', icone: 'lixo', perigo: true, aoEscolher: () => loja.esquecer(t.id).then(carregar) }]} />
          </article>`,
      )}
    </div>
  </section>`
}

export function Inicio({ loja, aoEscolher }) {
  const { situacao, lendo } = usarLoja(loja, (l) => ({ situacao: l.situacao(), lendo: l.lendo() }))
  const [temRecentes, definir] = useState(false)
  useEffect(() => void loja.recentes().then((l) => definir(l.length > 0)), [situacao])
  const abrindo = situacao === 'abrindo'
  return html`<div class="tela inicio" data-com-recentes=${temRecentes && !abrindo ? '' : undefined}>
    <section class="inicio-heroi">
      <${Simbolo} vivo />
      <h1>${NOME}</h1>
      <p class="inicio-assinatura">${ASSINATURA}</p>
      ${abrindo
        ? html`<div class="inicio-lendo" role="status">
            <${Progresso} valor=${lendo?.total ? lendo.feitas / lendo.total : null} rotulo="Lendo as fotos" />
            <span>${lendo?.total ? html`<${Numero} valor=${lendo.total} /> ${lendo.total === 1 ? 'foto' : 'fotos'}` : 'Lendo a pasta'}</span>
          </div>`
        : html`<${AcoesDeAbrir} loja=${loja} aoEscolher=${aoEscolher} />
            <span class="ficha inicio-nota"><${Icone} nome="cadeado" />Nada sai deste aparelho</span>`}
    </section>
    ${abrindo ? null : html`<${Recentes} loja=${loja} />`}
  </div>`
}
