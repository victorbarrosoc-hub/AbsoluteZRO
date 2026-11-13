// As folhas da Revelar: escolher os grupos (copiar e sincronizar) e as versões nomeadas da foto.

import { html, useEffect, useRef, useState } from '../../preact.js'
import { Chave, Folha } from '../../componentes/index.js'
import { GRUPOS } from './logica.js'
import { Icone } from './icones.js'

/** Escolher os grupos que vão junto. `acao`: o texto do botão; `aoConfirmar(ids)`. */
export function FolhaGrupos({ aberta, titulo, acao, escolhidos, aoConfirmar, aoFechar, apoio }) {
  const [marcados, definir] = useState(() => new Set(escolhidos))
  useEffect(() => {
    if (aberta) definir(new Set(escolhidos))
  }, [aberta])
  const todos = marcados.size === GRUPOS.length
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${titulo} largura=${460} classe="folha-grupos">
    ${apoio ? html`<div class="apoio">${apoio}</div>` : null}
    <div class="rv-lista-grupos">
      ${GRUPOS.map(
        (g) => html`<${Chave}
          key=${g.id}
          rotulo=${g.rotulo}
          ligada=${marcados.has(g.id)}
          aoMudar=${(v) => {
            const s = new Set(marcados)
            if (v) s.add(g.id)
            else s.delete(g.id)
            definir(s)
          }}
        />`,
      )}
    </div>
    <div class="folha-pe">
      <button type="button" class="vidro" onClick=${() => definir(todos ? new Set() : new Set(GRUPOS.map((g) => g.id)))}>${todos ? 'Nenhum' : 'Todos'}</button>
      <button type="button" class="vidro vidro--tinta" data-confirmar disabled=${!marcados.size} onClick=${() => aoConfirmar([...marcados])}>${acao}</button>
    </div>
  <//>`
}

const quando = (t) => new Date(t).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** As versões nomeadas desta foto: guardar a de agora, voltar a uma, apagar. */
export function FolhaVersoes({ aberta, versoes, aoGuardar, aoUsar, aoApagar, aoFechar }) {
  const campo = useRef(null)
  const guardar = (e) => {
    e.preventDefault()
    const nome = campo.current?.value.trim()
    aoGuardar(nome || `Versão ${versoes.length + 1}`)
    if (campo.current) campo.current.value = ''
  }
  return html`<${Folha} aberta=${aberta} aoFechar=${aoFechar} titulo=${['Versões', 'desta foto.']} largura=${460} classe="folha-versoes">
    <form class="rv-versao-nova" onSubmit=${guardar}>
      <label class="campo">
        <span class="so-leitor">Nome da versão</span>
        <input ref=${campo} type="text" maxlength="60" placeholder=${`Versão ${versoes.length + 1}`} autocomplete="off" />
      </label>
      <button type="submit" class="vidro vidro--tinta">Guardar</button>
    </form>
    ${
      versoes.length
        ? html`<ul class="rv-versoes">
            ${versoes.map(
              (v, i) => html`<li key=${v.quando}>
                <button type="button" class="rv-versao" onClick=${() => aoUsar(v)}><strong>${v.nome}</strong><span>${quando(v.quando)}</span></button>
                <button type="button" class="liso" aria-label=${`Apagar ${v.nome}`} onClick=${() => aoApagar(i)}><${Icone} nome="lixo" /></button>
              </li>`,
            )}
          </ul>`
        : html`<div class="apoio">Nenhuma versão guardada.</div>`
    }
  <//>`
}
