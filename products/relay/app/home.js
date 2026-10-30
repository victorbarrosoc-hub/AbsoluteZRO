// Relay · página inicial: destinos (da lista de presets), exemplos calculados pelo próprio plano, família e tema.
// O movimento é todo em CSS (home.css); aqui só monta o que vem dos dados.

import { GRUPOS, PRESETS } from '../src/presets.js'
import { planejar, tamanhoLegivel } from '../src/plano.js'
import { icone, icones } from './icones.js'
import { montarSet } from './set.js'
import { lerConta } from './conta.js'

const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos.filter((f) => f != null))
  return n
}

// Exemplo da faixa "um arquivo, todos os destinos": um master 4K de 2 minutos, pelo mesmo plano do conversor
const MASTER = { largura: 3840, altura: 2160, fps: 23.976, duracao: 120, temVideo: true, temAudio: true, canais: 2, taxa: 48000, cor: null }
for (const s of document.querySelectorAll('[data-exemplo]')) {
  const p = planejar(MASTER, s.dataset.exemplo)
  s.textContent = p.video ? `${p.video.largura}×${p.video.altura} · ${tamanhoLegivel(p.tamanhoEstimado)}` : `áudio · ${tamanhoLegivel(p.tamanhoEstimado)}`
}

/** "1080×1920 · 30 fps · 14 Mbit/s" — o que o preset entrega, curto. */
export function ficha(p) {
  if (!p.video) {
    const a = p.audio
    if (a.codec.startsWith('pcm')) return `PCM ${a.codec.slice(-2)} bits · ${a.taxa / 1000} kHz`
    return `${a.codec.toUpperCase()} · ${a.kbps} kbit/s`
  }
  const v = p.video
  if (p.ajustavel) return 'Você diz os MB'
  const tam = v.quadro ? `${v.quadro.largura}×${v.quadro.altura}` : v.ladoMenor ? `${v.ladoMenor}p` : 'Na resolução do arquivo'
  if (p.tamanhoMax) return `Até ${Math.round(p.tamanhoMax / 1e6)} MB`
  const faixa = v.kbps[1080] ?? Object.values(v.kbps)[0]
  const mbps = `${Math.round(faixa[0] / 1000)} Mbit/s${!v.quadro && !v.ladoMenor ? ' em 1080p' : ''}`
  return `${tam} · ${v.fpsMax <= 30 ? '30 fps' : `até ${v.fpsMax} fps`} · ${mbps}`
}

const grade = document.querySelector('[data-destinos]')
if (grade)
  for (const g of GRUPOS) {
    grade.append(
      el(
        'div',
        { className: 'grupo' },
        el('h3', { className: 'grupo-nome', textContent: g }),
        el(
          'ul',
          {},
          ...PRESETS.filter((p) => p.grupo === g).map((p) =>
            el(
              'li',
              {},
              el(
                'a',
                { className: 'destino cartao', href: `converter?preset=${p.id}`, title: p.resumo },
                el('span', { className: 'destino-icone' }, icone(p.icone)),
                el('strong', { textContent: p.nome }),
                el('small', { textContent: ficha(p) }),
              ),
            ),
          ),
        ),
      ),
    )
  }

// Família: o Relay no centro, os apps em volta (como a órbita da página da Absolute ZRO)
const FAMILIA = [
  { nome: 'SOBEDESCE', img: 'marca/familia/sobedesce.svg', href: 'https://sobedesce.vercel.app', uso: 'Converter do Drive' },
  { nome: 'Revela', img: 'marca/familia/revela.svg', href: 'https://revela.absolutezro.com', uso: 'Exportar depois da cor' },
  { nome: 'AEON', img: 'marca/familia/aeon.svg', href: 'https://aeon.absolutezro.com', uso: 'Exportar a edição' },
  { nome: 'NOSSOM', img: 'marca/familia/nossom.svg', href: 'https://nossom-teal.vercel.app', uso: 'Exportar o áudio' },
  { nome: 'Synquei', img: 'marca/familia/synquei.svg', href: 'https://synquei.vercel.app', uso: 'Pronto para editar' },
  { nome: 'TPeasy', img: 'marca/familia/tpeasy.svg', href: 'https://tpeasy.vercel.app', uso: 'Gravação para a rede' },
  { nome: 'Carro do Freela', img: 'marca/familia/carro-do-freela.png', href: 'https://carrodofreela.com.br', uso: 'Reel do portfólio' },
]
const orbita = document.querySelector('[data-familia]')
if (orbita)
  FAMILIA.forEach((a, i) =>
    orbita.append(
      el(
        'a',
        { className: 'orbita-app', href: a.href, title: `${a.nome}: ${a.uso}`, style: `--i:${i};--n:${FAMILIA.length}` },
        el('img', { src: a.img, alt: '', loading: 'lazy' }),
        el('span', { textContent: a.nome }),
      ),
    ),
  )

// tema
const botaoTema = document.querySelector('[data-tema-botao]')
const pintarTema = () => botaoTema?.replaceChildren(icone(window.relayTema?.atual() === 'escuro' ? 'sol' : 'lua'))
botaoTema?.addEventListener('click', () => {
  window.relayTema?.alternar()
  pintarTema()
})
icones()
pintarTema()

// o Set, a aba em comum do ecossistema: "Set" no fim das páginas do topo (app/set.js)
montarSet()

// com a conta: a segunda ação do topo da página leva ao painel (a foto da conta já está no topo)
lerConta().then((c) => {
  const a = document.querySelector('[data-heroi-segunda]')
  if (c.estado !== 'dentro' || !a) return
  a.href = '/painel'
  a.textContent = 'Seu painel'
})
