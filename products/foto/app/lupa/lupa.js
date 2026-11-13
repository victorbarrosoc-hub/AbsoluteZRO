// A lupa: a foto grande no palco escuro. Mostra na hora o que já existe (a miniatura, depois a prévia embutida de
// 1024 px) e troca pela imagem maior quando ela chega: a JPEG inteira que a câmera embutiu no RAW (ou o próprio
// arquivo, se for imagem) e, quando o motor entregar, a revelação (`revelar`).
//
//   <${Lupa} loja=${loja} aoFechar=${fechar} revelar=${async (foto, { sinal }) => blob | null} />
//
// Teclas: ← → (e ↑ ↓) andam; Z ou espaço dão zoom de 100% (clicar dá zoom no ponto clicado); arrastar move; N compara
// duas lado a lado com o zoom e a posição sincronizados; P, X, U, 0–5 e 6–9 marcam; G ou Esc voltam à grade.
// O zoom fica ligado ao trocar de foto (é assim que se confere o foco de uma sequência).
// O contador "N de M" é anunciado (aria-live). Nenhum redesenho por quadro: arrastar escreve o transform direto.

import { cx, html, useEffect, useLayoutEffect, useRef, useState } from '../preact.js'
import { lerTecla } from '../../src/biblioteca/catalogo.js'
import { Icone } from '../icones.js'
import { Marcar } from '../componentes/marcas.js'
import { usarAtalhos } from '../casca/atalhos.js'
import { usarCatalogo, usarFoto } from '../estado.js'
import { colorir, estrelar, executarComAviso, marcar } from '../grade/acoes.js'

/** As oito orientações do EXIF como transform de CSS (o que falta girar na imagem maior). */
const GIRO = {
  2: 'scaleX(-1)',
  3: 'rotate(180deg)',
  4: 'scaleY(-1)',
  5: 'rotate(90deg) scaleY(-1)',
  6: 'rotate(90deg)',
  7: 'rotate(-90deg) scaleY(-1)',
  8: 'rotate(-90deg)',
}
const limitar = (v, min, max) => Math.max(min, Math.min(max, v))

/** O zoom compartilhado pelos quadros: { ligado, fx, fy }, com fx e fy = o ponto da foto (−0,5 a 0,5) no centro. */
function criarZoom(aoLigar) {
  const z = {
    estado: { ligado: false, fx: 0, fy: 0 },
    ouvintes: new Set(),
    definir(parcial, { animar = true } = {}) {
      const antes = z.estado.ligado
      Object.assign(z.estado, parcial)
      z.ouvintes.forEach((f) => f(animar))
      if (antes !== z.estado.ligado) aoLigar(z.estado.ligado)
    },
  }
  return z
}

/** Velocidade, abertura, ISO e distância focal, como o fotógrafo lê. */
export function fichaDoExif(exif = {}) {
  const partes = []
  if (exif.tempo > 0) partes.push(exif.tempo >= 1 ? `${Number(exif.tempo.toFixed(1)).toLocaleString('pt-BR')} s` : `1/${Math.round(1 / exif.tempo)} s`)
  if (exif.abertura > 0) partes.push(`f/${Number(exif.abertura.toFixed(1)).toLocaleString('pt-BR')}`)
  if (exif.iso > 0) partes.push(`ISO ${Math.round(exif.iso)}`)
  if (exif.focal > 0) partes.push(`${Math.round(exif.focal)} mm`)
  return partes
}

/** Um quadro do palco: a foto encaixada, com zoom, arrastar e deslizar. Um quadro por foto (a `key` é o id). */
function Quadro({ loja, id, zoom, principal, revelar, etiqueta, aoAndar }) {
  const { foto } = usarFoto(loja, id)
  const caixa = useRef(null)
  const moldura = useRef(null)
  const [area, definirArea] = useState({ l: 0, a: 0 })
  const [fonte, definirFonte] = useState(() => {
    const mini = loja.miniaturas.url(id)
    return mini ? { url: mini, nivel: 'mini' } : null
  })
  const [natural, definirNatural] = useState(null)

  // as fontes, da mais rápida para a melhor
  useEffect(() => {
    let vivo = true
    const criadas = []
    const controle = new AbortController()
    const nova = (blob, nivel, extra = {}) => {
      const url = URL.createObjectURL(blob)
      criadas.push(url)
      return { url, nivel, ...extra }
    }
    ;(async () => {
      const previa = await loja.miniaturas.blob(id, 'previa').catch(() => null)
      if (!vivo) return
      if (previa) definirFonte((f) => (f && f.nivel !== 'mini' ? f : nova(previa, 'previa')))
      // um instante de espera: quem está só passando pelas fotos não lê o arquivo inteiro de cada uma
      await new Promise((ok) => setTimeout(ok, 160))
      if (!vivo) return
      const f0 = loja.catalogo.foto(id)
      if (revelar && f0) {
        const revelada = await Promise.resolve(revelar(f0, { sinal: controle.signal })).catch(() => null)
        if (!vivo) return
        if (revelada instanceof Blob) return definirFonte(nova(revelada, 'revelada'))
      }
      const grande = await loja.miniaturas.grande(id).catch(() => null)
      if (!vivo || !grande?.blob) return
      const f = nova(grande.blob, 'grande', { orientacao: grande.orientacao || 1 })
      // decodifica antes de trocar: a foto não pisca
      const img = new Image()
      img.src = f.url
      await img.decode().catch(() => {})
      if (vivo) definirFonte(f)
    })()
    return () => {
      vivo = false
      controle.abort()
      setTimeout(() => criadas.forEach((u) => URL.revokeObjectURL(u)), 0)
    }
  }, [id, revelar])

  useLayoutEffect(() => {
    const el = caixa.current
    const medir = () => {
      const s = getComputedStyle(el)
      const l = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
      const a = el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)
      definirArea((x) => (x.l === l && x.a === a ? x : { l, a }))
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const giro = fonte?.orientacao && fonte.orientacao !== 1 ? fonte.orientacao : 1
  const deitado = giro >= 5
  const larguraNatural = natural ? (deitado ? natural.a : natural.l) : 0
  const proporcao = foto?.proporcao || (natural ? (deitado ? natural.a / natural.l : natural.l / natural.a) : 1.5)
  // a foto encaixada na área
  const fl = Math.max(1, Math.min(area.l, area.a * proporcao))
  const fa = fl / proporcao

  const medidas = useRef({})
  medidas.current = { fl, fa, area, larguraNatural }

  /** A escala do zoom: 100% (um pixel da imagem para um da tela); se a imagem ainda é pequena, o dobro do encaixe. */
  const escala = () => {
    const { fl: l, larguraNatural: n } = medidas.current
    const cem = n ? n / (window.devicePixelRatio || 1) / l : 0
    return cem > 1.15 ? cem : 2
  }
  const aplicar = (animar = true) => {
    const el = moldura.current
    if (!el) return
    const { fl: l, fa: a, area: ar } = medidas.current
    const z = zoom.estado
    const s = z.ligado ? escala() : 1
    const sobraX = Math.max(0, (l * s - ar.l) / 2)
    const sobraY = Math.max(0, (a * s - ar.a) / 2)
    const tx = z.ligado ? limitar(-z.fx * l * s, -sobraX, sobraX) : 0
    const ty = z.ligado ? limitar(-z.fy * a * s, -sobraY, sobraY) : 0
    el.style.transition = animar ? '' : 'none'
    el.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s.toFixed(4)})`
    caixa.current?.toggleAttribute('data-zoom', z.ligado)
  }
  useLayoutEffect(() => {
    zoom.ouvintes.add(aplicar)
    return () => zoom.ouvintes.delete(aplicar)
  }, [])
  useLayoutEffect(() => aplicar(false), [fl, fa, area.l, area.a, larguraNatural])

  // clicar dá zoom no ponto; arrastar move (com zoom) ou troca de foto (sem zoom, no toque)
  const gesto = useRef(null)
  const baixou = (e) => {
    if (e.button) return
    gesto.current = { x: e.clientX, y: e.clientY, fx: zoom.estado.fx, fy: zoom.estado.fy, andou: false, id: e.pointerId }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const moveu = (e) => {
    const g = gesto.current
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.andou && Math.hypot(dx, dy) < 5) return
    g.andou = true
    if (!zoom.estado.ligado) return
    const { fl: l, fa: a } = medidas.current
    const s = escala()
    zoom.definir({ fx: limitar(g.fx - dx / (l * s), -0.5, 0.5), fy: limitar(g.fy - dy / (a * s), -0.5, 0.5) }, { animar: false })
  }
  const soltou = (e) => {
    const g = gesto.current
    gesto.current = null
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (g.andou) {
      if (!zoom.estado.ligado && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) aoAndar?.(dx < 0 ? 1 : -1)
      return
    }
    if (zoom.estado.ligado) return zoom.definir({ ligado: false })
    // o ponto clicado fica debaixo do cursor
    const r = moldura.current.getBoundingClientRect()
    const s = escala()
    const px = limitar((e.clientX - (r.left + r.width / 2)) / r.width, -0.5, 0.5)
    const py = limitar((e.clientY - (r.top + r.height / 2)) / r.height, -0.5, 0.5)
    zoom.definir({ ligado: true, fx: (px * (s - 1)) / s, fy: (py * (s - 1)) / s })
  }

  return html`<div
    class="quadro"
    ref=${caixa}
    data-principal=${principal ? '' : undefined}
    onPointerDown=${baixou}
    onPointerMove=${moveu}
    onPointerUp=${soltou}
    onPointerCancel=${() => (gesto.current = null)}
  >
    <div class="quadro-moldura" ref=${moldura} data-nivel=${fonte?.nivel} style=${`width:${fl.toFixed(1)}px;height:${fa.toFixed(1)}px`}>
      ${
        fonte
          ? html`<img
            src=${fonte.url}
            alt=${foto?.nome ?? ''}
            draggable=${false}
            decoding="async"
            style=${giro !== 1 ? `width:${(deitado ? fa : fl).toFixed(1)}px;height:${(deitado ? fl : fa).toFixed(1)}px;transform:translate(-50%,-50%) ${GIRO[giro]}` : undefined}
            data-girada=${giro !== 1 ? '' : undefined}
            onLoad=${(e) => definirNatural({ l: e.currentTarget.naturalWidth, a: e.currentTarget.naturalHeight })}
          />`
          : html`<span class="quadro-espera">${foto?.semPrevia ? html`<${Icone} nome="fotos" /><span>Sem prévia neste navegador</span>` : null}</span>`
      }
    </div>
    ${etiqueta ? html`<span class="quadro-etiqueta">${etiqueta}</span>` : null}
  </div>`
}

/**
 * `aoFechar()`: voltar à grade. `revelar(foto, { sinal })`: opcional; devolve um Blob com a foto revelada (a lupa
 * troca a prévia por ela) ou null para ficar com a prévia.
 */
export function Lupa({ loja, aoFechar, revelar }) {
  const c = loja.catalogo
  const TIPOS = ['selecao', 'fotos', 'filtro', 'ordem', 'pilhas', 'dados']
  const foco = usarCatalogo(loja, (x) => x.foco(), TIPOS)
  const total = usarCatalogo(loja, (x) => x.itens().length, TIPOS)
  const posicao = usarCatalogo(loja, (x) => x.indice(x.foco() ?? ''), TIPOS)
  const { foto } = usarFoto(loja, foco ?? '')
  const [fixa, definirFixa] = useState(null)
  const [ampliada, definirAmpliada] = useState(false)
  const zoom = useRef(null)
  zoom.current ??= criarZoom(definirAmpliada)
  const raiz = useRef(null)

  useEffect(() => {
    raiz.current?.focus({ preventScroll: true })
  }, [])
  // sem foto para mostrar (o filtro esvaziou a lista): volta para a grade
  useEffect(() => {
    if (!foco || !foto) aoFechar?.()
  }, [foco, !!foto])
  useEffect(() => {
    if (fixa && !c.tem(fixa)) definirFixa(null)
  })

  const andar = (passo) => c.mover(passo)
  const alternarZoom = () => zoom.current.definir(zoom.current.estado.ligado ? { ligado: false } : { ligado: true, fx: 0, fy: 0 })
  const alternarComparar = () => {
    if (fixa) return definirFixa(null)
    if (!foco) return
    definirFixa(foco)
    // a candidata é a seguinte (ou a anterior, na última)
    if (c.mover(1) === foco) c.mover(-1)
  }

  usarAtalhos(true, (e) => {
    const comando = lerTecla(e)
    if (!comando) return
    if (comando.acao === 'mover') {
      e.preventDefault()
      return void andar(comando.valor === 'esquerda' || comando.valor === 'acima' ? -1 : 1)
    }
    if (executarComAviso(loja, comando, { colunas: 1 })) return e.preventDefault()
    switch (comando.acao) {
      case 'zoom':
        e.preventDefault()
        return alternarZoom()
      case 'comparar':
        e.preventDefault()
        return alternarComparar()
      case 'grade':
        e.preventDefault()
        return aoFechar?.()
      case 'sair':
        e.preventDefault()
        if (zoom.current.estado.ligado) return zoom.current.definir({ ligado: false })
        if (fixa) return definirFixa(null)
        return aoFechar?.()
      default:
    }
  })

  if (!foco || !foto) return null
  const ids = [foco]
  const ficha = fichaDoExif(foto.exif)
  return html`<div class="lupa palco" ref=${raiz} role="region" aria-label="Foto grande" tabindex="-1" data-comparar=${fixa ? '' : undefined}>
    <div class="lupa-palco">
      ${fixa ? html`<${Quadro} key=${`fixa:${fixa}`} loja=${loja} id=${fixa} zoom=${zoom.current} revelar=${revelar} etiqueta="Fixa" />` : null}
      <${Quadro}
        key=${`atual:${foco}`}
        loja=${loja}
        id=${foco}
        zoom=${zoom.current}
        principal
        revelar=${revelar}
        aoAndar=${andar}
        etiqueta=${fixa ? 'Candidata' : null}
      />
    </div>
    <div class="lupa-ficha"><strong>${foto.nome}</strong>${ficha.map((p) => html`<span>${p}</span>`)}<span
      class="lupa-ficha-n"
      aria-hidden="true"
    >${(posicao + 1).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}</span></div>
    <button
      type="button"
      class="liso lupa-seta lupa-seta--antes"
      aria-label="Foto anterior"
      disabled=${posicao <= 0}
      onClick=${() => andar(-1)}
    ><${Icone} nome="esquerda" /></button>
    <button
      type="button"
      class="liso lupa-seta lupa-seta--depois"
      aria-label="Próxima foto"
      disabled=${posicao >= total - 1}
      onClick=${() => andar(1)}
    ><${Icone} nome="direita" /></button>
    <div class="lupa-barra barra-vidro" role="toolbar" aria-label="Foto">
      <button
        type="button"
        class="liso"
        aria-label="Voltar à grade"
        data-dica="Grade"
        data-tecla="G"
        data-dica-lado="cima"
        onClick=${() => aoFechar?.()}
      ><${Icone} nome="grade" /></button>
      <span class="lupa-contador" aria-live="polite" aria-atomic="true">${(posicao + 1).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}</span>
      <span class="separador" aria-hidden="true"></span>
      <${Marcar}
        fotos=${[foto]}
        aoMarcar=${(m) => marcar(loja, ids, m)}
        aoEstrelar=${(n) => estrelar(loja, ids, n)}
        aoColorir=${(x) => colorir(loja, ids, x)}
      />
      <span class="separador" aria-hidden="true"></span>
      <button
        type="button"
        class=${cx('liso')}
        aria-label="Zoom de 100%"
        aria-pressed=${ampliada ? 'true' : 'false'}
        data-dica="Zoom de 100%"
        data-tecla="Z"
        data-dica-lado="cima"
        onClick=${alternarZoom}
      ><${Icone} nome="zoom" /></button>
      <button
        type="button"
        class="liso"
        aria-label="Comparar duas"
        aria-pressed=${fixa ? 'true' : 'false'}
        data-dica="Comparar"
        data-tecla="N"
        data-dica-lado="cima"
        onClick=${alternarComparar}
      ><${Icone} nome="comparar" /></button>
    </div>
  </div>`
}
