// A margem (Latitude): o diferencial desta tela. O histograma da CENA em EV em torno do cinza, no eixo do ARQUIVO (não
// anda quando a exposição muda: é o que o arquivo tem), com a faixa de tons que a tela mostra desenhada embaixo (o
// cinza de cada EV, do preto ao branco) e as marcas medidas no sensor: onde o arquivo satura e onde começa o ruído.
// Mexer na exposição, nas altas ou nas margens da tela move a faixa ao vivo. Os números dos lados dizem quanto o
// arquivo guarda além do que a tela mostra com detalhe; as frases vêm prontas de resumoLatitude.
//
// Foto pronta (JPEG, PNG): o histograma da tela, e uma linha dizendo que o arquivo não tem margem além do que se vê.

import { html, useEffect, useMemo, useRef, useState } from '../../preact.js'
import { Esqueleto } from '../../componentes/base.js'
import { normalizar } from '../../../src/motor/ajustes.js'
import { criarPonto } from '../../../src/motor/ponto.js'
import { margens, telaDe } from '../../../src/motor/tela.js'
import { resumoLatitude } from '../../../src/raw/latitude.js'
import { janelaDaTela } from './logica.js'

const EV_DE = -12
const EV_ATE = 7
const CINZA = 0.18

const DICA_PASSOU = 'A tela já passa do ponto em que o sensor satura'
const DICA_ALTAS = 'Altas luzes guardadas acima do que a tela mostra'
/** As frases que ficam à vista: as das altas (o que estourou e o que dá para recuperar) e a das sombras. */
const aVista = (f) => /estourar|Altas luzes|sombra|Sombras/.test(f)
const ev1 = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`

/** O código de tela de um cinza de EV `f` no eixo do arquivo, com os ajustes de agora (ponto + tela, sem vizinhança). */
export function codigoDaTela(ajustes, latitude) {
  const a = normalizar(ajustes)
  // o branco não muda um cinza de lugar na escala de tons; fica de fora para não depender do branco da câmera
  a.branco = { ...a.branco, modo: 'original' }
  const base = latitude ? { latitude, origem: 'raw' } : { origem: 'imagem' }
  const ponto = criarPonto(a, { branco: { kelvin: 6500, tinta: 0 }, exposicaoBase: 0 })
  const tela = telaDe('srgb', a, base)
  const m = margens(a, base)
  const s = [0, 0, 0]
  const codigo = (f) => {
    const v = CINZA * 2 ** f
    ponto.aplicar(v, v, v, s)
    tela.aplicar(s[0], s[1], s[2], s)
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
  }
  return { codigo, margens: m }
}

function cores() {
  const css = getComputedStyle(document.documentElement)
  return { texto: css.getPropertyValue('--texto').trim() || '#1d1d1f', mudo: css.getPropertyValue('--mudo').trim() || '#6e6e73' }
}

/** Repinta quando o tema muda (o servidor e o seletor escrevem `data-tema` no <html>). */
function usarTema() {
  const [tema, definir] = useState(document.documentElement.dataset.tema)
  useEffect(() => {
    const obs = new MutationObserver(() => definir(document.documentElement.dataset.tema))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
    return () => obs.disconnect()
  }, [])
  return tema
}

function desenharCena(canvas, { histo, latitude, codigo, janela, cor }) {
  const dpr = devicePixelRatio || 1
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  if (!W || !H) return
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  const c = canvas.getContext('2d')
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.clearRect(0, 0, W, H)
  const x = (f) => ((f - EV_DE) / (EV_ATE - EV_DE)) * W
  const faixa = 8
  const alto = H - faixa - 6

  // a janela da tela: fundo um pouco mais claro onde a tela mostra detalhe
  c.fillStyle = cor.texto
  c.globalAlpha = 0.05
  c.fillRect(x(janela.de), 0, x(janela.ate) - x(janela.de), alto)
  c.globalAlpha = 1

  // o histograma da cena, deslocado para o eixo do arquivo; raiz da contagem (os picos não esmagam o resto)
  if (histo) {
    const { casas, evMin, porEv } = histo.cena
    let maior = 1
    for (const n of casas) maior = Math.max(maior, Math.sqrt(n))
    const forma = new Path2D()
    forma.moveTo(x(evMin - histo.ev), alto)
    for (let k = 0; k < casas.length; k++) {
      const f = evMin + (k + 0.5) / porEv - histo.ev
      forma.lineTo(x(f), alto - (Math.sqrt(casas[k]) / maior) * (alto - 4))
    }
    forma.lineTo(x(evMin + casas.length / porEv - histo.ev), alto)
    forma.closePath()
    // fora da janela, apagado: é o que o arquivo tem e a tela não mostra com detalhe
    c.save()
    c.fillStyle = cor.texto
    c.globalAlpha = 0.18
    c.fill(forma)
    c.beginPath()
    c.rect(x(janela.de), 0, x(janela.ate) - x(janela.de), alto)
    c.clip()
    c.globalAlpha = 0.55
    c.fill(forma)
    c.restore()
  }

  // a faixa de tons: cada EV com o cinza em que cai na tela
  for (let px = 0; px < W; px += 2) {
    const f = EV_DE + ((px + 1) / W) * (EV_ATE - EV_DE)
    const v = Math.round(Math.max(0, Math.min(1, codigo(f))) * 255)
    c.fillStyle = `rgb(${v} ${v} ${v})`
    c.fillRect(px, H - faixa, 2, faixa)
  }
  c.strokeStyle = cor.texto
  c.globalAlpha = 0.18
  c.lineWidth = 1
  c.strokeRect(0.5, H - faixa + 0.5, W - 1, faixa - 1)
  c.globalAlpha = 1

  // o cinza médio da tela
  c.fillStyle = cor.texto
  c.beginPath()
  const g = x(janela.cinza)
  c.moveTo(g, H - faixa - 1)
  c.lineTo(g - 4, H - faixa - 6)
  c.lineTo(g + 4, H - faixa - 6)
  c.closePath()
  c.fill()

  // as marcas do sensor
  const m = latitude?.margem
  if (m && Number.isFinite(m.acimaDoCinza)) {
    const s = x(m.acimaDoCinza)
    c.strokeStyle = cor.texto
    c.lineWidth = 1.5
    c.beginPath()
    c.moveTo(s, 2)
    c.lineTo(s, alto)
    c.stroke()
    // além da saturação não há dado: hachura fina
    c.save()
    c.beginPath()
    c.rect(s, 0, W - s, alto)
    c.clip()
    c.globalAlpha = 0.14
    c.lineWidth = 1
    for (let i = -alto; i < W; i += 5) {
      c.beginPath()
      c.moveTo(s + i, alto)
      c.lineTo(s + i + alto, 0)
      c.stroke()
    }
    c.restore()
  }
  if (m && Number.isFinite(m.abaixoDoCinza)) {
    const r = x(-m.abaixoDoCinza)
    c.strokeStyle = cor.texto
    c.lineWidth = 1.5
    c.setLineDash([3, 3])
    c.beginPath()
    c.moveTo(r, 2)
    c.lineTo(r, alto)
    c.stroke()
    c.setLineDash([])
  }
}

function desenharTela(canvas, { histo, cor }) {
  const dpr = devicePixelRatio || 1
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  if (!W || !H) return
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  const c = canvas.getContext('2d')
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.clearRect(0, 0, W, H)
  if (!histo?.tela) return
  const t = histo.tela
  // 64 casas, suavizadas: a amostra é pequena e o histograma de 256 casas sai serrilhado
  const N = 64
  const juntar = (lista) => {
    const k = t.casas / N
    const s = new Float64Array(N)
    for (let i = 0; i < t.casas; i++) s[Math.min(N - 1, Math.floor(i / k))] += lista[i]
    return s.map((v, i) => (s[Math.max(0, i - 1)] + 2 * v + s[Math.min(N - 1, i + 1)]) / 4)
  }
  const canais = { luma: juntar(t.luma), r: juntar(t.r), g: juntar(t.g), b: juntar(t.b) }
  let maior = 1
  for (const l of Object.values(canais)) for (let i = 1; i < N - 1; i++) maior = Math.max(maior, Math.sqrt(l[i]))
  const caminho = (lista) => {
    const p = new Path2D()
    p.moveTo(0, H)
    for (let i = 0; i < N; i++) p.lineTo(((i + 0.5) / N) * W, H - Math.min(1, Math.sqrt(lista[i]) / maior) * (H - 4))
    p.lineTo(W, H)
    p.closePath()
    return p
  }
  c.fillStyle = cor.texto
  c.globalAlpha = 0.45
  c.fill(caminho(canais.luma))
  c.globalAlpha = 0.6
  c.lineWidth = 1
  c.strokeStyle = cor.mudo
  for (const canal of ['r', 'g', 'b']) c.stroke(caminho(canais[canal]))
  c.globalAlpha = 1
}

/**
 * `latitude`: a do arquivo (null em foto pronta). `histo`: { cena, tela, ev } (ev = a exposição com que o histograma da
 * cena foi lido; o desenho volta ao eixo do arquivo). `ajustes`: os de agora. `carregando`: ainda sem base.
 */
export function Margem({ latitude, histo, ajustes, carregando, origem }) {
  const ref = useRef(null)
  const tema = usarTema()
  const raw = !!latitude
  const conta = useMemo(() => (raw ? codigoDaTela(ajustes, latitude) : null), [raw, latitude, ajustes])
  const janela = useMemo(() => (conta ? janelaDaTela(conta.codigo) : null), [conta])
  const frases = useMemo(() => (latitude ? resumoLatitude(latitude) : []), [latitude])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const pintar = () => {
      if (raw) desenharCena(el, { histo, latitude, codigo: conta.codigo, janela, cor: cores() })
      else desenharTela(el, { histo, cor: cores() })
    }
    pintar()
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(pintar) : null
    obs?.observe(el)
    return () => obs?.disconnect()
  }, [histo, janela, conta, raw, tema])

  if (carregando) {
    return html`<section class="margem" aria-label="Margem do arquivo" aria-busy="true">
      <div class="margem-topo"><span class="sobretitulo">Margem</span></div>
      <${Esqueleto} altura=${84} raio=${10} />
    </section>`
  }

  const m = latitude?.margem
  const acima = raw && m && Number.isFinite(m.acimaDoCinza) ? m.acimaDoCinza - janela.ate : null
  const abaixo = raw && m && Number.isFinite(m.abaixoDoCinza) ? janela.de + m.abaixoDoCinza : null
  const dica = raw
    ? 'O histograma é o que o arquivo tem, em EV em torno do cinza. A faixa embaixo é o que a tela mostra. ' +
      'A linha cheia é onde o sensor satura; a tracejada, onde começa o ruído.'
    : 'Histograma da tela.'
  return html`<section
    class="margem"
    aria-label="Margem do arquivo"
    data-raw=${raw ? '' : undefined}
    data-de=${janela ? janela.de.toFixed(2) : undefined}
    data-ate=${janela ? janela.ate.toFixed(2) : undefined}
  >
    <div class="margem-topo">
      <span class="sobretitulo" title=${dica}>Margem</span>
      ${
        raw
          ? html`<span class="margem-numeros">
              <span class="margem-num" data-lado="sombras" title="Sombra limpa guardada abaixo do que a tela mostra"
                ><small>Sombras</small>${abaixo == null ? '—' : `${ev1(-Math.max(0, abaixo))} EV`}</span
              >
              <span class="margem-num" data-lado="altas" title=${acima != null && acima < 0 ? DICA_PASSOU : DICA_ALTAS}
                ><small>Altas</small>${acima == null ? '—' : `${ev1(acima)} EV`}</span
              >
            </span>`
          : null
      }
    </div>
    <canvas ref=${ref} class="margem-grafico" role="img" aria-label=${raw ? `Histograma da cena. ${frases.join('. ')}` : 'Histograma da tela'}></canvas>
    ${
      raw
        ? html`<div class="margem-frases" title=${frases.filter((f) => !aVista(f)).join(' · ')}>
            ${frases.filter(aVista).map((f) => html`<span>${f}</span>`)}
          </div>`
        : html`<div class="margem-frases"><span>${origem === 'imagem' ? 'Foto pronta: o arquivo não guarda nada além do que se vê.' : ''}</span></div>`
    }
  </section>`
}
