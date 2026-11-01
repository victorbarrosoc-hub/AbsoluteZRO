// Voz e instrumental no Inspector (a separação da NOSSOM dentro do AEON). Antes: "Separar", com os minutos do plano
// NOSSOM que o pedido usa. Durante: a etapa que a NOSSOM diz (sem porcentagem inventada) e Cancelar. Depois: as duas
// faixas alinhadas ao clipe, cada uma com Solo, Mudo e volume, e os atalhos Tudo, Só voz e Só instrumental. As contas
// ficam em src/faixas.js; o pedido, em app/nossom.js.

import { FAIXAS, PRESETS_MIX, presetDoMix, ROTULOS, VOLUME_MAX, VOLUME_MIN } from '../src/faixas.js'

const db = (v) => (v === null ? 'mudo' : `${v > 0 ? '+' : ''}${String(v).replace('.', ',')} dB`)

/**
 * caixa: onde montar. o: { obter() → { p, clipe, midia, liberado, andamento: { texto, frac } | null, faltam, trecho },
 * separar(), cancelar(), ajustar(mix, gravar), desligar() }
 */
export function montarFaixas(caixa, o) {
  const sec = document.createElement('div')
  sec.className = 'insp-faixas'
  sec.innerHTML = `<div class="vel-cabeca"><span class="insp-rotulo">Voz e instrumental</span><span class="faixas-selo" title="Separado no Quasar Audio Lab, com o seu plano">Quasar</span></div>
<div class="faixas-antes"><button type="button" class="ficha" data-acao="separar">Separar</button><span class="vel-dica faixas-dica"></span></div>
<div class="faixas-andamento" hidden><div class="barra-progresso"><div class="faixas-barra"></div></div><div class="faixas-linha"><span class="apoio faixas-estado" aria-live="polite"></span><button type="button" class="link" data-acao="cancelar">Cancelar</button></div></div>
<div class="faixas-depois" hidden>
  <div class="faixas-presets" role="radiogroup" aria-label="O que toca">${PRESETS_MIX.map((x) => `<button type="button" class="ficha" role="radio" data-preset="${x.id}" aria-checked="false">${x.nome}</button>`).join('')}</div>
  ${FAIXAS.map(
    (f) => `<div class="faixa" data-faixa="${f}">
    <span class="faixa-nome">${ROTULOS[f]}</span>
    <button type="button" class="faixa-btn" data-solo="${f}" aria-pressed="false" title="Só ${ROTULOS[f].toLowerCase()}">S</button>
    <button type="button" class="faixa-btn" data-mudo="${f}" aria-pressed="false" title="Mudo">M</button>
    <input type="range" class="deslizar" min="${VOLUME_MIN}" max="${VOLUME_MAX}" step="0.5" data-volume="${f}" aria-label="Volume de ${ROTULOS[f]}" />
    <output></output>
  </div>`,
  ).join('')}
  <div class="faixas-pe"><button type="button" class="link" data-acao="original" title="Volta ao som do vídeo (as faixas ficam guardadas para ligar de novo)">Som original</button></div>
</div>
<p class="vel-dica faixas-aviso" hidden></p>`
  caixa.append(sec)
  // o último volume de cada faixa antes do mudo, para o M voltar onde estava
  const antes = { voz: 0, instrumental: 0 }

  sec.querySelector('[data-acao="separar"]').onclick = () => o.separar()
  sec.querySelector('[data-acao="cancelar"]').onclick = () => o.cancelar()
  sec.querySelector('[data-acao="original"]').onclick = () => o.desligar()
  sec.querySelector('.faixas-presets').onclick = (e) => {
    const b = e.target.closest('[data-preset]')
    if (b) o.ajustar({ ...PRESETS_MIX.find((x) => x.id === b.dataset.preset).mix }, true)
  }
  sec.querySelector('.faixas-depois').addEventListener('click', (e) => {
    const { clipe } = o.obter()
    const mix = clipe?.faixas
    if (!mix) return
    const solo = e.target.closest('[data-solo]')?.dataset.solo
    const mudo = e.target.closest('[data-mudo]')?.dataset.mudo
    if (solo) {
      const outra = FAIXAS.find((f) => f !== solo)
      const sozinha = mix[solo] !== null && mix[outra] === null
      // S de novo desfaz o solo (as duas voltam ao volume de antes)
      o.ajustar(sozinha ? { [outra]: antes[outra] ?? 0 } : { [solo]: mix[solo] ?? antes[solo] ?? 0, [outra]: null }, true)
    } else if (mudo) o.ajustar({ [mudo]: mix[mudo] === null ? (antes[mudo] ?? 0) : null }, true)
  })
  for (const i of sec.querySelectorAll('[data-volume]')) {
    const f = i.dataset.volume
    i.addEventListener('input', () => o.ajustar({ [f]: Number(i.value) }, false))
    i.addEventListener('change', () => o.ajustar({ [f]: Number(i.value) }, true))
    i.addEventListener('dblclick', () => o.ajustar({ [f]: 0 }, true))
  }

  function desenhar() {
    const { clipe, midia, liberado, andamento, faltam, trecho } = o.obter()
    sec.hidden = !clipe || !midia?.temAudio || !liberado
    if (sec.hidden) return
    const ligado = Boolean(clipe.faixas)
    sec.querySelector('.faixas-antes').hidden = ligado || Boolean(andamento)
    sec.querySelector('.faixas-andamento').hidden = !andamento
    sec.querySelector('.faixas-depois').hidden = !ligado || Boolean(andamento)
    const dica = sec.querySelector('.faixas-dica')
    dica.textContent = trecho?.erro || (trecho ? `${trecho.minutos} min do seu plano Quasar` : '')
    sec.querySelector('[data-acao="separar"]').disabled = Boolean(trecho?.erro)
    if (andamento) {
      sec.querySelector('.faixas-estado').textContent = andamento.texto
      const barra = sec.querySelector('.faixas-barra')
      barra.classList.toggle('andando', andamento.frac < 0)
      barra.style.transform = andamento.frac < 0 ? '' : `scaleX(${andamento.frac})`
    }
    const aviso = sec.querySelector('.faixas-aviso')
    aviso.hidden = !ligado || !faltam
    aviso.textContent = faltam === 'trecho' ? 'O clipe passou do trecho separado: toca o som original. Separe de novo para usar as faixas.' : 'As faixas deste clipe ficaram no outro computador: toca o som original. Separe de novo aqui.'
    if (!ligado) return
    const mix = clipe.faixas
    const p = presetDoMix(mix)
    for (const b of sec.querySelectorAll('[data-preset]')) b.setAttribute('aria-checked', String(b.dataset.preset === p))
    for (const f of FAIXAS) {
      const outra = FAIXAS.find((x) => x !== f)
      if (mix[f] !== null) antes[f] = mix[f]
      const linha = sec.querySelector(`.faixa[data-faixa="${f}"]`)
      linha.querySelector('[data-solo]').setAttribute('aria-pressed', String(mix[f] !== null && mix[outra] === null))
      linha.querySelector('[data-mudo]').setAttribute('aria-pressed', String(mix[f] === null))
      linha.classList.toggle('muda', mix[f] === null)
      const i = linha.querySelector('[data-volume]')
      if (document.activeElement !== i) i.value = String(mix[f] ?? antes[f] ?? 0)
      linha.querySelector('output').textContent = db(mix[f])
    }
  }
  return { el: sec, desenhar }
}
