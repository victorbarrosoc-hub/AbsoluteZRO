// Revela · entrega por destino: escolhe o destino, mostra codec/cor/áudio com fonte e data, baixa o script do Resolve.

import { DESTINOS, GRUPOS, destino } from '../src/entrega/destinos.js'
import { gerarScript, nomeScript } from '../src/entrega/resolve.js'

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
  const nav = $('destinos')
  for (const grupo of GRUPOS) {
    const itens = DESTINOS.filter((d) => d.grupo === grupo)
    if (!itens.length) continue
    nav.append(
      el('p', { className: 'grupo', textContent: grupo }),
      ...itens.map((d) =>
        el(
          'button',
          { type: 'button', className: 'destino', dataset: { id: d.id }, onclick: () => escolher(d.id) },
          el('strong', { textContent: d.nome }),
          el('small', { textContent: d.resumo }),
        ),
      ),
    )
  }
}

function linha(rotulo, valor) {
  return el('div', { className: 'linha' }, el('dt', { textContent: rotulo }), el('dd', {}, ...[].concat(valor)))
}

function escolher(id) {
  const d = destino(id) ?? DESTINOS[0]
  for (const b of document.querySelectorAll('.destino')) b.setAttribute('aria-pressed', String(b.dataset.id === d.id))
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
  $('detalhe').replaceChildren(
    el('div', { className: 'cabeca' }, el('h2', { textContent: d.nome }), el('span', { className: `etiqueta ${selo.tipo}`, textContent: selo.texto })),
    el('p', { className: 'resumo', textContent: d.resumo }),
    el('h3', { textContent: 'Vídeo' }),
    el(
      'dl',
      {},
      linha('Contêiner', v.formato.toUpperCase()),
      linha('Codec', [v.codec, v.perfil ? ` · ${v.perfil}` : ''].join('')),
      linha('Cor e bits', `${v.subamostragem} · ${v.bits} bits`),
      linha('Resolução', v.resolucao),
      linha('Cadência', v.fps),
      linha('Bitrate', bitrate),
    ),
    el('h3', { textContent: 'Cor' }),
    el(
      'dl',
      {},
      linha('Espaço', d.cor.nome),
      linha('Primárias · transferência · matriz', `${d.cor.primarias} · ${d.cor.transferencia} · ${d.cor.matriz}`),
      linha('Tag no arquivo (H.273)', d.cor.h273),
      linha('No Resolve (Deliver)', `Color Space Tag ${d.cor.resolve.colorSpaceTag} · Gamma Tag ${d.cor.resolve.gammaTag}`),
    ),
    el('h3', { textContent: 'Áudio' }),
    el(
      'dl',
      {},
      linha('Codec', a.codec === 'lpcm' ? `PCM ${a.bits} bits` : `${a.codec.toUpperCase()} ${a.kbps} kbps`),
      linha('Amostragem e canais', `${a.taxa / 1000} kHz · ${a.canais}`),
      linha(
        'Loudness',
        a.loudness ? `${a.loudness.alvo} ${a.loudness.unidade} ±${a.loudness.tolerancia}` : 'Sem alvo publicado pela plataforma. Prática de mercado: picos abaixo de −1 dBTP.',
      ),
    ),
    d.avisos.length
      ? el(
          'div',
          { className: 'avisos' },
          el('strong', { textContent: 'Antes de entregar' }),
          el('ul', {}, ...d.avisos.map((t) => el('li', { textContent: t }))),
        )
      : null,
    el(
      'div',
      { className: 'acoes-entrega' },
      el('button', { type: 'button', className: 'botao', textContent: 'Baixar script do Resolve (.py)', onclick: () => baixar(d) }),
      el('button', { type: 'button', className: 'botao-secundario', textContent: 'Copiar resumo', onclick: () => copiar(d) }),
    ),
    el(
      'div',
      { className: 'fontes' },
      el('strong', { textContent: 'Fontes' }),
      el(
        'ul',
        {},
        ...d.fontes.map((f) =>
          el(
            'li',
            {},
            el('span', { className: `etiqueta ${f.tipo}`, textContent: f.tipo === 'oficial' ? 'Oficial' : 'Mercado' }),
            ' ',
            el('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer', textContent: f.titulo }),
            el('small', { textContent: ` · conferido em ${data(f.verificadoEm)}` }),
          ),
        ),
      ),
    ),
  )
}

function baixar(d) {
  const url = URL.createObjectURL(new Blob([gerarScript(d)], { type: 'text/x-python' }))
  const link = el('a', { href: url, download: nomeScript(d) })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  $('estado').textContent = `Script baixado. No Resolve: Workspace › Scripts, com o projeto aberto.`
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

listar()
escolher(location.hash.slice(1))
