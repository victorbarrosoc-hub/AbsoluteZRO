// Estabilizar no Inspector: liga no clipe (a primeira vez analisa a mídia, com a barra andando pelos quadros), e depois
// dois controles: Suavidade (quanto a câmera fica parada) e Recorte máximo (quanto da borda pode sair). O resumo diz o
// que foi medido: o tremor antes e depois e o recorte que ficou. Vai na prévia e no vídeo final.

import { PADRAO } from '../src/estabilizar/index.js'
import { analiseDe, resumoDoClipe } from '../src/estabilizar/aplicar.js'

const pct = (v) => `${Math.round(v * 100)}%`

/**
 * caixa: onde montar. obter(): { p, clipe, midia }. ligar(): analisa se precisar e liga (Promise). desligar(). ajustar(
 * ajustes, gravar): mostra (gravar = false, ao arrastar) ou grava uma ação (ao soltar).
 */
export function montarEstabilizar(caixa, { obter, ligar, desligar, ajustar }) {
  const sec = document.createElement('div')
  sec.className = 'insp-estab'
  sec.innerHTML = `<div class="vel-cabeca"><span class="insp-rotulo">Estabilizar</span><output class="estab-resumo"></output></div>
<div class="estab-acoes"><button type="button" class="ficha" data-acao="ligar" aria-pressed="false" title="O AEON acompanha o movimento da cena e corrige quadro a quadro.">Estabilizar</button></div>
<label class="estab-campo"><span>Suavidade</span><input type="range" min="0.3" max="3" step="0.1" data-campo="suavidade" /><output></output></label>
<label class="estab-campo"><span>Recorte máximo</span><input type="range" min="1.05" max="1.4" step="0.01" data-campo="recorte" /><output></output></label>
<p class="vel-dica">Por imagem, na prévia e no vídeo final. Mais suave pede mais recorte.</p>`
  caixa.append(sec)
  const botao = sec.querySelector('[data-acao="ligar"]')
  const resumo = sec.querySelector('.estab-resumo')
  const campos = [...sec.querySelectorAll('.estab-campo input')]
  let analisando = false

  const valores = () => Object.fromEntries(campos.map((i) => [i.dataset.campo, Number(i.value)]))
  const legenda = (i) => (i.dataset.campo === 'suavidade' ? `${Number(i.value).toFixed(1).replace('.', ',')} s` : `até ${pct(Number(i.value) - 1)}`)
  for (const i of campos) {
    i.addEventListener('input', () => {
      i.nextElementSibling.textContent = legenda(i)
      ajustar(valores(), false)
    })
    i.addEventListener('change', () => ajustar(valores(), true))
  }

  botao.onclick = async () => {
    const { clipe } = obter()
    if (!clipe || analisando) return
    if (clipe.estabilizar) return desligar()
    analisando = true
    botao.disabled = true
    try {
      await ligar((feitos, total) => {
        resumo.textContent = `Analisando ${pct(Math.min(1, feitos / total))}`
      })
    } finally {
      analisando = false
      botao.disabled = false
      desenhar()
    }
  }

  function desenhar() {
    const { p, clipe, midia } = obter()
    const ligado = Boolean(clipe?.estabilizar)
    botao.setAttribute('aria-pressed', String(ligado))
    botao.textContent = ligado ? 'Estabilizado' : analiseDe(midia) ? 'Estabilizar' : 'Analisar e estabilizar'
    const aj = clipe?.estabilizar || PADRAO
    for (const i of campos) {
      i.value = String(aj[i.dataset.campo])
      i.disabled = !ligado
      i.nextElementSibling.textContent = legenda(i)
    }
    if (analisando) return
    const r = ligado ? resumoDoClipe(p, clipe, midia) : null
    resumo.textContent = r ? `Tremor −${pct(Math.min(0.99, Math.max(0, 1 - r.depois / Math.max(1e-9, r.antes))))} · recorte ${pct(r.recorte)}` : ''
    resumo.title = r ? `Tremor medido: ${r.antes.toFixed(1).replace('.', ',')} px → ${r.depois.toFixed(1).replace('.', ',')} px (num quadro de 1920).${r.forca < 1 ? ' O recorte máximo limitou a correção.' : ''}` : ''
  }

  return { el: sec, desenhar }
}

/** Analisa a mídia no worker (app/estabilizar-worker.js). aoAndar(feitos, total). Devolve a estabilidade da mídia. */
export function analisarMidia(entrada, aoAndar) {
  return new Promise((ok, falha) => {
    const w = new Worker(new URL('./estabilizar-worker.js', import.meta.url), { type: 'module' })
    w.onmessage = ({ data }) => {
      if (data.tipo === 'andamento') aoAndar?.(data.feitos, data.total)
      else {
        w.terminate()
        if (data.tipo === 'pronto') ok(data.estabilidade)
        else falha(new Error(data.mensagem))
      }
    }
    w.onerror = (e) => {
      w.terminate()
      falha(new Error(e.message || 'A análise não abriu.'))
    }
    w.postMessage({ tipo: 'analisar', entrada })
  })
}
