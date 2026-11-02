// Remover fundo verde no Inspector: um toque liga (a cor do fundo é medida na borda do quadro que está na tela) e três
// ajustes finos: Tolerância (quanto de cor some), Suavidade (a borda) e Tirar o verde da borda (o reflexo no assunto).
// Verde e Azul trocam a chave à mão. Vai na prévia e no vídeo final (src/chroma.js, app/chroma.js).

import { CORES, LIMITES, PADRAO, canalDaChave, rgb } from '../src/chroma.js'

const pct = (v) => `${Math.round(v * 100)}%`

/**
 * caixa: onde montar. obter(): { clipe }. ligar() (mede a cor e liga). desligar(). ajustar(ajustes, gravar): mostra
 * (gravar = false, ao arrastar) ou grava uma ação (ao soltar). disponivel(): o recorte roda aqui (WebGL2)?
 */
export function montarChroma(caixa, { obter, ligar, desligar, ajustar, disponivel }) {
  const sec = document.createElement('div')
  sec.className = 'insp-chroma'
  const campo = (k, nome) => `<label class="chroma-campo"><span>${nome}</span><input type="range" min="${LIMITES[k][0]}" max="${LIMITES[k][1]}" step="0.01" data-campo="${k}" /><output></output></label>`
  sec.innerHTML = `<div class="vel-cabeca"><span class="insp-rotulo">Fundo</span><output class="chroma-resumo"></output></div>
<div class="chroma-acoes"><button type="button" class="ficha" data-acao="ligar" aria-pressed="false" title="Mede a cor do fundo na borda do quadro e tira ela da imagem.">Remover fundo verde</button></div>
<div class="chroma-chaves" role="group" aria-label="Cor do fundo"><span class="chroma-amostra" aria-hidden="true"></span><button type="button" class="ficha" data-cor="${CORES.verde}">Verde</button><button type="button" class="ficha" data-cor="${CORES.azul}">Azul</button><button type="button" class="ficha" data-acao="medir" title="Mede de novo no quadro que está na tela">Medir</button></div>
${campo('tolerancia', 'Tolerância')}${campo('suavidade', 'Suavidade da borda')}${campo('derramamento', 'Tirar o verde da borda')}
<p class="vel-dica">Na prévia e no vídeo final. Onde era fundo, entra o preto.</p>`
  caixa.append(sec)
  const botao = sec.querySelector('[data-acao="ligar"]')
  const resumo = sec.querySelector('.chroma-resumo')
  const amostra = sec.querySelector('.chroma-amostra')
  const chaves = sec.querySelector('.chroma-chaves')
  const campos = [...sec.querySelectorAll('.chroma-campo input')]

  const atuais = () => ({ ...(obter().clipe?.chroma || PADRAO), ...Object.fromEntries(campos.map((i) => [i.dataset.campo, Number(i.value)])) })
  for (const i of campos) {
    i.addEventListener('input', () => {
      i.nextElementSibling.textContent = pct(Number(i.value))
      ajustar(atuais(), false)
    })
    i.addEventListener('change', () => ajustar(atuais(), true))
    i.addEventListener('dblclick', () => ajustar({ ...atuais(), [i.dataset.campo]: PADRAO[i.dataset.campo] }, true))
  }
  botao.onclick = () => (obter().clipe?.chroma ? desligar() : ligar())
  chaves.onclick = (e) => {
    const b = e.target.closest('button')
    if (!b || !obter().clipe?.chroma) return
    if (b.dataset.acao === 'medir') ligar()
    else ajustar({ ...atuais(), cor: b.dataset.cor }, true)
  }

  function desenhar() {
    const { clipe } = obter()
    const aj = clipe?.chroma || null
    const pode = disponivel()
    botao.setAttribute('aria-pressed', String(Boolean(aj)))
    botao.disabled = !pode
    botao.textContent = aj ? (canalDaChave(rgb(aj.cor)) === 2 ? 'Fundo azul removido' : 'Fundo verde removido') : 'Remover fundo verde'
    botao.title = pode ? botao.title : 'Este computador não tem WebGL2: o recorte não roda aqui.'
    chaves.hidden = !aj
    amostra.style.background = aj?.cor ?? 'transparent'
    resumo.textContent = aj ? aj.cor : ''
    for (const b of chaves.querySelectorAll('[data-cor]')) b.setAttribute('aria-pressed', String(aj?.cor === b.dataset.cor))
    for (const i of campos) {
      i.value = String((aj || PADRAO)[i.dataset.campo])
      i.disabled = !aj
      i.nextElementSibling.textContent = pct(Number(i.value))
    }
  }

  return { el: sec, desenhar }
}
