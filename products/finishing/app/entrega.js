// Revela · entrega por destino: escolhe o destino, mostra codec/cor/áudio com fonte e data, baixa o script do Resolve.

import './conta.js'
import './menu.js'
import { DESTINOS, destino } from '../src/entrega/destinos.js'
import { gerarScript, nomeScript } from '../src/entrega/resolve.js'
import { ICONES, NOME_CURTO, escalonar, glifo, icones, svg } from './visual.js'

const $ = (id) => document.getElementById(id)
const el = (tag, { dataset, ...props } = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  if (dataset) Object.assign(n.dataset, dataset) // dataset é só leitura no elemento: preenche por dentro
  n.append(...filhos.filter((f) => f != null))
  return n
}
const mbps = (kbps) => `${(kbps / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mbps`
const data = (iso) => iso.split('-').reverse().join('/')
const rotuloAltura = (h) => (h === 1920 ? '1080×1920' : h === 2160 ? '4K (2160p)' : `${h}p`)

function listar() {
  $('destinos').replaceChildren(
    ...DESTINOS.map((d) =>
      el(
        'button',
        { type: 'button', className: 'cartao', dataset: { id: d.id }, title: d.resumo, onclick: () => escolher(d.id) },
        svg(glifo(d)),
        el('span', { textContent: NOME_CURTO[d.id] ?? d.nome }),
      ),
    ),
  )
  // o nome inteiro para leitor de tela e para a busca por nome
  for (const b of $('destinos').children) b.setAttribute('aria-label', destino(b.dataset.id).nome)
}

function linha(rotulo, valor) {
  return el('div', { className: 'linha' }, el('dt', { textContent: rotulo }), el('dd', {}, ...[].concat(valor)))
}

function escolher(id) {
  const d = destino(id) ?? DESTINOS[0]
  for (const b of document.querySelectorAll('#destinos .cartao')) {
    b.setAttribute('aria-pressed', String(b.dataset.id === d.id))
    if (b.dataset.id === d.id) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }) // na fileira do celular
  }
  if (location.hash.slice(1) !== d.id) history.replaceState(null, '', `#${d.id}`)
  const v = d.video
  const a = d.audio
  const bitrate = v.bitrate
    ? el(
        'ul',
        { className: 'bitrates' },
        ...Object.entries(v.bitrate).map(([h, [p, alta]]) =>
          el('li', {
            textContent:
              p === alta ? `${rotuloAltura(Number(h))}: ${mbps(p)}` : `${rotuloAltura(Number(h))}: ${mbps(p)} (24–30 fps) · ${mbps(alta)} (48–60 fps)`,
          }),
        ),
      )
    : 'Sem limite: ProRes trabalha por qualidade, não por bitrate.'
  const oficial = d.fontes.some((f) => f.tipo === 'oficial')
  const selo = d.selo ?? { tipo: oficial ? 'oficial' : 'mercado', texto: oficial ? 'Oficial' : 'Mercado' }
  const ficha = el(
    'div',
    { className: 'mais' },
    el(
      'details',
      {},
      el('summary', { textContent: 'Ficha completa' }),
      el(
        'dl',
        {},
        linha('Contêiner', v.formato.toUpperCase()),
        linha('Codec', [v.codec, v.perfil ? ` · ${v.perfil}` : ''].join('')),
        linha('Cor e bits', `${v.subamostragem} · ${v.bits} bits`),
        linha('Resolução', v.resolucao),
        linha('Cadência', v.fps),
        linha('Bitrate', bitrate),
        linha('Espaço de cor', d.cor.nome),
        linha('Primárias · transferência · matriz', `${d.cor.primarias} · ${d.cor.transferencia} · ${d.cor.matriz}`),
        linha('Tag no arquivo (H.273)', d.cor.h273),
        linha('No Resolve (Deliver)', `Color Space Tag ${d.cor.resolve.colorSpaceTag} · Gamma Tag ${d.cor.resolve.gammaTag}`),
        linha('Áudio', `${audioNome(a)} · ${a.taxa / 1000} kHz · ${a.canais}`),
        linha(
          'Loudness',
          a.loudness ? `${a.loudness.alvo} ${a.loudness.unidade} ±${a.loudness.tolerancia}` : 'Sem alvo publicado. Mercado: picos abaixo de −1 dBTP.',
        ),
      ),
    ),
    d.avisos.length
      ? el(
          'details',
          {},
          el('summary', { textContent: `Antes de entregar (${d.avisos.length})` }),
          el('ul', {}, ...d.avisos.map((t) => el('li', { textContent: t }))),
        )
      : null,
    el(
      'details',
      {},
      el('summary', { textContent: 'Fontes' }),
      el(
        'ul',
        { className: 'fontes' },
        ...d.fontes.map((f) =>
          el(
            'li',
            {},
            el('span', { className: `etiqueta ${f.tipo}`, textContent: f.tipo === 'oficial' ? 'Oficial' : 'Mercado' }),
            ' ',
            el('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer', textContent: f.titulo }),
            el('small', { textContent: ` · ${data(f.verificadoEm)}` }),
          ),
        ),
      ),
    ),
  )
  const [h1080, [p1080]] = v.bitrate ? (Object.entries(v.bitrate).find(([h]) => h === '1080') ?? Object.entries(v.bitrate)[0]) : [null, [null]]
  const detalhe = $('detalhe')
  detalhe.replaceChildren(
    el(
      'div',
      { className: 'cabeca' },
      svg(glifo(d)),
      el('h2', { textContent: d.nome }),
      el('span', { className: `etiqueta ${selo.tipo}`, textContent: selo.texto }),
    ),
    el(
      'div',
      { className: 'specs' },
      spec('Codec', v.codec.replace(/^Apple /, ''), `${v.formato.toUpperCase()} · ${v.bits} bits`),
      spec('Resolução', v.largura ? `${v.largura}×${v.altura}` : 'Da timeline', v.largura ? null : 'sem mudar'),
      spec('Bitrate', p1080 ? mbps(p1080) : 'Por qualidade', p1080 ? rotuloAltura(Number(h1080)) : 'sem limite'),
      spec('Cor', d.cor.nome, `tag ${d.cor.h273}`),
      spec('Áudio', audioNome(a), `${a.taxa / 1000} kHz`),
      spec('Loudness', a.loudness ? `${a.loudness.alvo} ${a.loudness.unidade}` : '—', a.loudness ? `±${a.loudness.tolerancia}` : 'pico −1 dBTP'),
    ),
    el(
      'div',
      { className: 'acoes-entrega' },
      el(
        'button',
        { type: 'button', className: 'vidro vidro--tinta grande', title: 'Baixar preset do Resolve', onclick: () => baixar(d) },
        svg(ICONES.baixar),
        'Baixar preset',
      ),
      el('button', { type: 'button', className: 'vidro vidro--icone', title: 'Copiar resumo', onclick: () => copiar(d) }, svg(ICONES.copiar)),
    ),
    ficha,
  )
  detalhe.classList.remove('trocou')
  void detalhe.offsetWidth // reinicia a animação da troca
  detalhe.classList.add('trocou')
}

function spec(rotulo, valor, sub) {
  return el(
    'div',
    { className: 'spec' },
    el('span', { textContent: rotulo }),
    el('strong', { textContent: valor }),
    sub ? el('small', { textContent: sub }) : null,
  )
}

const audioNome = (a) => (a.codec === 'lpcm' ? `PCM ${a.bits} bits` : `${a.codec.toUpperCase()} ${a.kbps}`)

function baixar(d) {
  const url = URL.createObjectURL(new Blob([gerarScript(d)], { type: 'text/x-python' }))
  const link = el('a', { href: url, download: nomeScript(d) })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  $('estado').textContent = 'Baixado. No Resolve: Workspace › Scripts.'
}

async function copiar(d) {
  const v = d.video
  const texto = [
    `${d.nome} (Revela)`,
    `Vídeo: ${v.formato.toUpperCase()} · ${v.codec}${v.perfil ? ' ' + v.perfil : ''} · ${v.subamostragem} ${v.bits} bits · ${v.resolucao} · ${v.fps}`,
    v.bitrate
      ? `Bitrate: ${Object.entries(v.bitrate)
          .map(([h, [p]]) => `${rotuloAltura(Number(h))} ${mbps(p)}`)
          .join(', ')}`
      : null,
    `Cor: ${d.cor.nome}, tag ${d.cor.h273}`,
    `Áudio: ${d.audio.codec === 'lpcm' ? `PCM ${d.audio.bits} bits` : `${d.audio.codec.toUpperCase()} ${d.audio.kbps} kbps`}, ${d.audio.taxa / 1000} kHz${d.audio.loudness ? `, ${d.audio.loudness.alvo} ${d.audio.loudness.unidade}` : ''}`,
    `Fontes: ${d.fontes.map((f) => `${f.url} (${data(f.verificadoEm)})`).join(' ')}`,
  ]
    .filter(Boolean)
    .join('\n')
  try {
    await navigator.clipboard.writeText(texto)
    $('estado').textContent = 'Resumo copiado.'
  } catch {
    $('estado').textContent = 'Não deu para copiar neste navegador.'
  }
}

icones()
listar()
escolher(location.hash.slice(1))
escalonar()
