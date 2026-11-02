// Relay · conversor. Solta os arquivos, escolhe um ou mais destinos e converte tudo no aparelho, um por vez.
// A decisão é do plano (src/plano.js) e a execução do motor (app/motor.js); aqui só a tela.

import { GRUPOS, PRESETS, VERIFICADO_EM, preset as acharPreset } from '../src/presets.js'
import { LIMITE_MEMORIA, RESOLUCOES, fichaTecnica, fmtDuracao, nomeSaida, planejar, tamanhoLegivel } from '../src/plano.js'
import { capacidades, converterArquivo, lerArquivo, miniatura, MB } from './motor.js'
import { icone, icones } from './icones.js'
import { montarSet } from './set.js'
import * as Meus from './meus.js'
import * as Looks from './looks.js'
import { linkMaxima } from '../src/link.js'
import { registro } from '../src/painel.js'
import { lerConta } from './conta.js'
import * as Historico from './historico.js'
import * as Nuvem from './nuvem.js'
import { RECURSOS } from './recursos.js'
import { enviarAoDrive, escolherNoDrive, mudarTema } from './drive.js'

const $ = (id) => document.getElementById(id)
const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos.filter((f) => f != null && f !== false))
  return n
}
const ficha = (texto, extra = '') => el('span', { className: `ficha ${extra}`.trim(), textContent: texto })
const NOMES_CODEC = { prores: 'ProRes', prores4444: 'ProRes 4444', avc: 'H.264', hevc: 'HEVC', vp9: 'VP9', av1: 'AV1', vp8: 'VP8', aac: 'AAC', mp3: 'MP3', opus: 'Opus', flac: 'FLAC' }
const nomeCodec = (c) => NOMES_CODEC[c] ?? (String(c).startsWith('pcm') ? 'PCM' : String(c ?? '').toUpperCase())

// ─────────── estado ───────────

let meus = Meus.carregar()
let daEquipe = Nuvem.presetsDaEquipe() // presets que a equipe liberou (só leitura; app/nuvem.js)
const achar = (id) => meus.find((p) => p.id === id) ?? daEquipe.find((p) => p.id === id) ?? acharPreset(id)
const ABAS = [...GRUPOS, 'Meus']
/** Para a ficha ao vivo do editor: o primeiro arquivo da fila, ou um minuto de master 4K. */
const origemDoEditor = () =>
  fila.find((i) => i.estado === 'pronto' && i.info.temVideo)?.info ?? { largura: 3840, altura: 2160, fps: 23.976, duracao: 60, temVideo: true, temAudio: true, canais: 2, taxa: 48000, cor: null, exemplo: true }

const CHAVE = 'relay-destinos'
const lembrados = (() => {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
  } catch {
    return []
  }
})()
const pedido = new URLSearchParams(location.search).get('preset')

// "Abrir no Relay" vindo de outra plataforma da família (docs/integration-contracts/relay.md): uma ficha discreta. Só
// as plataformas no ar (titular, 01/11/2026: app não lançado não aparece em lugar nenhum); de outra, nada de ficha.
const FAMILIA = { sobedesce: 'SOBEDESCE', synquei: 'Synquei', maestro: 'Maestro', tpeasy: 'TPeasy', 'carro-do-freela': 'Carro do Freela', hub: 'Absolute ZRO' }
const ICONE_FAMILIA = { sobedesce: 'sobedesce.svg', synquei: 'synquei.svg', tpeasy: 'tpeasy.svg', 'carro-do-freela': 'carro-do-freela.png', hub: 'absolute-zro-o.webp' }
const de = new URLSearchParams(location.search).get('de')
if (FAMILIA[de]) {
  const vindo = document.createElement('p')
  vindo.className = 'vindo'
  if (ICONE_FAMILIA[de]) vindo.append(Object.assign(document.createElement('img'), { src: `marca/familia/${ICONE_FAMILIA[de]}`, alt: '' }))
  vindo.append(`Vindo do ${FAMILIA[de]}`)
  document.getElementById('soltar').after(vindo)
}
const escolhidos = new Set((pedido && achar(pedido) ? [pedido] : lembrados).filter((id) => achar(id)))
if (!escolhidos.size) escolhidos.add('youtube-1080')
let grupo = new URLSearchParams(location.search).get('aba') === 'Meus' ? 'Meus' : (achar([...escolhidos][0])?.grupo ?? GRUPOS[0])
let resolucao = 'original'
const fila = [] // { id, arquivo, info, estado, erro, saidas: [{ preset, estado, plano, url, bytes, conversao, avisos }] }
let pasta = null
let rodando = false

const lembrar = () => {
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...escolhidos]))
  } catch {
    // janela privada: vale só agora
  }
}
const opcoes = () => ({ resolucao, preencher: $('preencher').checked, tamanhoMB: Number($('mb').value) || 50 })

// ─────────── destinos ───────────

function desenharAbas() {
  $('abas').replaceChildren(
    ...ABAS.map((g) => {
      const n = [...PRESETS, ...meus].filter((p) => p.grupo === g && escolhidos.has(p.id)).length
      const b = el('button', { type: 'button', role: 'tab', className: 'aba', textContent: g }, n ? el('span', { className: 'conta', textContent: String(n) }) : null)
      b.setAttribute('aria-selected', String(g === grupo))
      b.onclick = () => {
        grupo = g
        desenharAbas()
        desenharPresets()
      }
      return b
    }),
  )
}

function cartaoPreset(p) {
  const input = el('input', { type: 'checkbox', value: p.id, checked: escolhidos.has(p.id), className: 'so-leitor' })
  input.onchange = () => {
    if (input.checked) escolhidos.add(p.id)
    else escolhidos.delete(p.id)
    lembrar()
    desenharAbas()
    atualizarTudo()
  }
  // transparência e chroma não viram preset da pessoa (o editor só faz MP4 sem alfa: o fundo sumiria calado)
  const personalizar = p.daEquipe || p.grupo === 'Transparência' ? null : el('button', { type: 'button', className: 'personalizar', title: p.personalizado ? 'Editar' : 'Criar um preset a partir deste', ariaLabel: p.personalizado ? `Editar ${p.nome}` : `Personalizar ${p.nome}` }, icone(p.personalizado ? 'editar' : 'ficha'))
  if (personalizar) personalizar.onclick = (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    abrirEditor(p)
  }
  return el(
    'label',
    { className: 'preset cartao', title: p.dica ?? p.resumo },
    input,
    el('span', { className: 'preset-icone' }, icone(p.icone)),
    el('span', { className: 'preset-texto' }, el('strong', { textContent: p.nome }), el('small', { textContent: p.daEquipe ? 'Da equipe' : p.resumo })),
    el('span', { className: 'marcado', ariaHidden: 'true' }, icone('ok')),
    personalizar,
  )
}

function desenharPresets() {
  if (grupo !== 'Meus') return $('presets').replaceChildren(...PRESETS.filter((p) => p.grupo === grupo).map(cartaoPreset))
  const criar = el('button', { type: 'button', className: 'preset preset--novo cartao' }, el('span', { className: 'preset-icone' }, icone('mais')), el('span', { className: 'preset-texto' }, el('strong', { textContent: 'Criar preset' }), el('small', { textContent: 'Do seu jeito: codec, tamanho, bitrate, áudio.' })))
  criar.onclick = () => abrirEditor(null)
  const arquivo = el('input', { type: 'file', accept: '.json,application/json', className: 'so-leitor' })
  arquivo.onchange = async () => {
    const f = arquivo.files[0]
    arquivo.value = ''
    if (!f) return
    try {
      const { presets, recusados } = await Meus.lerArquivo(f)
      const antes = meus
      for (const p of presets) meus = [...meus.filter((x) => x.id !== p.id), p]
      Meus.guardar(meus)
      contaDentro().then((c) => Nuvem.presetsMudaram(c, antes, meus))
      avisar(`${presets.length} ${presets.length === 1 ? 'preset trazido' : 'presets trazidos'}${recusados ? `, ${recusados} recusado${recusados > 1 ? 's' : ''}` : ''}.`)
      desenharPresets()
    } catch (e) {
      avisar(e.message)
    }
  }
  const trazer = el('label', { className: 'vidro', title: 'Trazer presets de um arquivo .relay.json' }, arquivo, icone('soltar'), 'Trazer')
  const levar = el('button', { type: 'button', className: 'vidro', title: 'Baixar seus presets como .relay.json', disabled: !meus.length }, icone('baixar'), 'Levar')
  levar.onclick = () => Meus.baixarArquivo(meus)
  $('presets').replaceChildren(...meus.map(cartaoPreset), ...daEquipe.map(cartaoPreset), criar, el('div', { className: 'meus-acoes' }, trazer, levar, el('span', { className: 'apoio', id: 'aviso-meus', role: 'status' })))
}

const avisar = (t) => {
  const a = document.getElementById('aviso-meus')
  if (a) a.textContent = t
}

async function abrirEditor(p) {
  const r = await Meus.editar(p, origemDoEditor(), Looks)
  if (!r) return
  const id = p?.personalizado ? p.id : null
  const antes = meus
  if (r.acao === 'apagar') {
    meus = meus.filter((x) => x.id !== id)
    escolhidos.delete(id)
  } else {
    meus = id ? meus.map((x) => (x.id === id ? r.preset : x)) : [...meus, r.preset]
    escolhidos.add(r.preset.id)
  }
  Meus.guardar(meus)
  contaDentro().then((c) => Nuvem.presetsMudaram(c, antes, meus))
  lembrar()
  grupo = 'Meus'
  desenharAbas()
  desenharPresets()
  atualizarTudo()
}

$('resolucoes').append(
  ...RESOLUCOES.map((r) => {
    const b = el('button', { type: 'button', role: 'radio', textContent: r.nome })
    b.setAttribute('aria-checked', String(r.id === resolucao))
    b.onclick = () => {
      resolucao = r.id
      for (const x of $('resolucoes').children) x.setAttribute('aria-checked', String(x === b))
      atualizarTudo()
    }
    return b
  }),
)
for (const id of ['preencher', 'mb']) $(id).addEventListener('change', () => atualizarTudo())
$('mb').addEventListener('input', () => atualizarTudo())
if ('showDirectoryPicker' in window) $('ajuste-pasta').hidden = false
$('salvar-pasta').addEventListener('change', () => {
  if (!$('salvar-pasta').checked) pasta = null
  atualizarTudo()
})

function mostrarAjustes() {
  const ps = [...escolhidos].map(achar).filter(Boolean)
  $('ajuste-resolucao').hidden = !ps.some((p) => p.video && !p.video.quadro && !p.tamanhoMax)
  $('ajuste-preencher').hidden = !ps.some((p) => p.video?.quadro)
  $('ajuste-mb').hidden = !ps.some((p) => p.ajustavel)
  $('fontes').replaceChildren(
    ...ps.flatMap((p) =>
      p.fontes.map((f) =>
        el(
          'li',
          {},
          el('strong', { textContent: p.nome }),
          ' · ',
          el('a', { href: f.url, target: '_blank', rel: 'noopener', textContent: f.titulo }),
          ' ',
          ficha(f.tipo === 'oficial' ? 'Oficial' : 'Mercado'),
          ' ',
          el('small', { textContent: `conferido em ${f.verificadoEm.split('-').reverse().join('/')}` }),
        ),
      ),
    ),
    el('li', { className: 'nota', textContent: `Presets conferidos em ${VERIFICADO_EM.split('-').reverse().join('/')}. Plataformas mudam: o Relay acompanha.` }),
  )
}

// ─────────── fila ───────────

/** Nome curto do navegador, para o detalhe de um erro de leitura. */
function navegador() {
  const ua = navigator.userAgent
  const marca = navigator.userAgentData?.brands?.find((b) => !/Not|Chromium/i.test(b.brand))
  if (marca) return `${marca.brand} ${marca.version}`
  const m = /Firefox\/(\d+)/.exec(ua) ?? /Version\/(\d+(?:\.\d+)?).*Safari/.exec(ua)
  return m ? `${ua.includes('Firefox') ? 'Firefox' : 'Safari'} ${m[1]}` : 'navegador'
}

async function adicionar(arquivos) {
  if (!arquivos.length) return
  $('soltar').classList.add('compacta')
  $('barra').hidden = false
  for (const arquivo of arquivos) {
    const item = { id: crypto.randomUUID(), arquivo, info: null, estado: 'lendo', erro: null, saidas: [] }
    fila.push(item)
    desenharItem(item)
    try {
      item.info = await lerArquivo(arquivo)
      if (item.info.temVideo && !item.info.decodifica) throw Object.assign(new Error(`Este navegador não lê este ${nomeCodec(item.info.codec)}.`), { codigo: 'decodificar', detalhe: item.info.detalheCodec })
      item.estado = 'pronto'
      if (item.info.temVideo) miniatura(arquivo, $(`item-${item.id}`).querySelector('canvas'), item.info).catch(() => {})
    } catch (e) {
      item.estado = 'erro'
      item.erro = e.codigo ? e.message : 'Não abre como vídeo nem áudio.'
      item.detalhe = e.detalhe ? `${e.detalhe} · ${navegador()}` : null
    }
    atualizarItem(item)
  }
  atualizarBarra()
}

function desenharItem(item) {
  const li = el(
    'li',
    { className: 'item cartao', id: `item-${item.id}` },
    el('div', { className: 'item-topo' }, el('canvas', { className: 'miniatura', width: 160, height: 90 }), el('div', { className: 'item-info' }, el('strong', { className: 'item-nome', textContent: item.arquivo.name, title: item.arquivo.name }), el('div', { className: 'fichas' })), el('button', { type: 'button', className: 'vidro vidro--icone tirar', title: 'Tirar da lista', ariaLabel: `Tirar ${item.arquivo.name}` }, icone('x'))),
    el('ul', { className: 'saidas' }),
  )
  li.querySelector('.tirar').onclick = () => {
    if (item.saidas.some((s) => s.estado === 'convertendo')) return
    for (const s of item.saidas) if (s.url) URL.revokeObjectURL(s.url)
    fila.splice(fila.indexOf(item), 1)
    li.remove()
    atualizarBarra()
  }
  $('fila').append(li)
}

/** Põe nas saídas de um item os destinos escolhidos (as já tentadas ficam; as que esperam são replanejadas). */
function sincronizarSaidas(item) {
  if (item.estado !== 'pronto') return
  const antes = new Map(item.saidas.map((s) => [s.preset.id, s]))
  const tentadas = item.saidas.filter((s) => s.tentou)
  const novas = []
  for (const id of escolhidos) {
    if (!achar(id)) continue
    if (tentadas.some((s) => s.preset.id === id)) continue
    const s = antes.get(id) ?? { preset: achar(id) }
    Object.assign(s, { preset: achar(id), estado: 'esperando', plano: null, avisos: [], erro: null })
    try {
      s.plano = planejar(item.info, s.preset, opcoes())
      s.avisos = [...s.plano.avisos]
      if (!(pasta || $('salvar-pasta').checked) && s.plano.tamanhoEstimado > LIMITE_MEMORIA) s.avisos.push('Grande para a memória do navegador: ligue "Salvar numa pasta".')
    } catch (e) {
      s.estado = 'impossivel'
      s.erro = e.message
    }
    novas.push(s)
  }
  item.saidas = [...tentadas, ...novas]
}

function linhaSaida(item, s) {
  const p = s.preset
  const v = s.plano?.video
  const descricao = s.erro
    ? el('span', { className: 'erro', textContent: s.erro })
    : el(
        'span',
        { className: 'fichas' },
        v ? ficha(`${v.largura}×${v.altura}`) : null,
        v?.fps ? ficha(`${String(v.fps).replace('.', ',')} fps`) : null,
        s.plano?.audio && !v ? ficha(`${nomeCodec(s.plano.audio.codec)}${s.plano.audio.bitrate ? ` ${Math.round(s.plano.audio.bitrate / 1000)}k` : ''}`) : null,
        s.bytes ? ficha(tamanhoLegivel(s.bytes), 'ficha--sinal') : s.plano ? ficha(`~${tamanhoLegivel(s.plano.tamanhoEstimado)}`) : null,
        ...(s.resumo ?? []).map((t) => ficha(t)),
      )
  const acoes = el('span', { className: 'saida-acoes' })
  if (s.estado === 'convertendo') {
    const b = el('button', { type: 'button', className: 'vidro vidro--icone', title: 'Parar', ariaLabel: `Parar ${p.nome}` }, icone('x'))
    b.onclick = () => s.conversao?.cancel()
    acoes.append(b)
  } else if (s.estado === 'feito' && s.url) {
    const a = el('a', { className: 'vidro vidro--tinta', href: s.url, download: s.nome, title: s.nome }, icone('baixar'), 'Baixar')
    a.setAttribute('aria-label', `Baixar ${s.nome}`)
    acoes.append(a)
  } else if (s.estado === 'feito') acoes.append(ficha('Salvo na pasta', 'ficha--sinal'))
  if (s.estado === 'feito' && s.blob && !s.envio) {
    const b = el('button', { type: 'button', className: 'vidro', title: 'Manda para a mesma pasta do Drive, pelo SOBEDESCE' }, icone('nuvem'), 'Para o Drive')
    b.setAttribute('aria-label', `Mandar ${s.nome} para o Drive`)
    b.onclick = () => mandarAoDrive(item, s)
    acoes.prepend(b)
  } else if (s.envio) acoes.prepend(ficha({ fila: 'Indo para o Drive…', enviando: 'Indo para o Drive…', enviado: 'No Drive', erro: 'Não foi para o Drive' }[s.envio] ?? 'Indo para o Drive…', s.envio === 'enviado' ? 'ficha--sinal' : ''))
  if (s.plano) {
    const ver = el('button', { type: 'button', className: 'vidro vidro--icone', title: 'Ficha técnica', ariaLabel: `Ficha técnica de ${p.nome}` }, icone('ficha'))
    ver.setAttribute('aria-expanded', String(Boolean(s.verFicha)))
    ver.onclick = () => {
      s.verFicha = !s.verFicha
      atualizarItem(item)
    }
    acoes.prepend(ver)
  }
  const estados = { esperando: '', convertendo: s.progresso != null ? `${Math.round(s.progresso * 100)}%` : 'Começando…', feito: 'Pronto', erro: 'Não deu', cancelado: 'Parado', impossivel: '' }
  return el(
    'li',
    { className: `saida saida--${s.estado}` },
    el('span', { className: 'saida-icone' }, icone(p.icone)),
    el('span', { className: 'saida-corpo' }, el('span', { className: 'saida-nome' }, el('strong', { textContent: p.nome }), el('span', { className: 'saida-estado', textContent: estados[s.estado] })), descricao, s.estado === 'convertendo' ? el('span', { className: 'progresso', style: `--curso:${s.progresso ?? 0}` }) : null, s.avisos.length ? el('ul', { className: 'avisos' }, ...s.avisos.map((t) => el('li', {}, icone('aviso'), el('span', { textContent: t })))) : null, s.estado === 'erro' && s.erro ? el('span', { className: 'erro', textContent: s.erro }) : null, s.verFicha && s.plano ? el('dl', { className: 'ficha-tecnica' }, ...fichaTecnica(s.plano).flatMap(([r, v]) => [el('dt', { textContent: r }), el('dd', { textContent: v })])) : null),
    acoes,
  )
}

function atualizarItem(item) {
  const li = $(`item-${item.id}`)
  if (!li) return
  li.dataset.estado = item.estado
  const info = item.info
  const fichas = li.querySelector('.item-info .fichas')
  if (item.estado === 'erro') fichas.replaceChildren(el('span', { className: 'erro', textContent: item.erro, title: item.detalhe ?? '' }), item.detalhe ? el('small', { className: 'erro-detalhe', textContent: item.detalhe }) : '')
  else if (item.estado === 'lendo') fichas.replaceChildren(ficha('Lendo…'))
  else
    fichas.replaceChildren(
      ...[
        info.temVideo ? ficha(nomeCodec(info.codec)) : ficha('Só áudio'),
        info.temVideo ? ficha(`${info.largura}×${info.altura}`) : null,
        info.temVideo && info.fps ? ficha(`${String(info.fps).replace('.', ',')} fps`) : null,
        ficha(fmtDuracao(info.duracao)),
        info.temAudio ? ficha(`${nomeCodec(info.codecAudio)}${info.canais > 2 ? ` ${info.canais} canais` : ''}`) : ficha('sem áudio'),
        info.cor?.transfer === 'pq' || info.cor?.transfer === 'hlg' ? ficha('HDR') : null,
      ].filter(Boolean),
    )
  if (!info?.temVideo) li.querySelector('.miniatura').classList.add('audio')
  sincronizarSaidas(item)
  li.querySelector('.saidas').replaceChildren(...item.saidas.map((s) => linhaSaida(item, s)))
}

function atualizarBarra() {
  const pendentes = fila.flatMap((i) => (i.estado === 'pronto' ? i.saidas.filter((s) => s.estado === 'esperando') : []))
  const arquivos = new Set(fila.filter((i) => i.saidas.some((s) => s.estado === 'esperando')).map((i) => i.id)).size
  $('converter').disabled = rodando || !pendentes.length
  $('converter').textContent = rodando ? 'Convertendo…' : pendentes.length > 1 ? `Converter ${pendentes.length}` : 'Converter'
  const total = pendentes.reduce((n, s) => n + (s.plano?.tamanhoEstimado ?? 0), 0)
  $('resumo').textContent = pendentes.length ? `${arquivos} ${arquivos === 1 ? 'arquivo' : 'arquivos'} · ${pendentes.length} ${pendentes.length === 1 ? 'versão' : 'versões'} · ~${tamanhoLegivel(total)}` : fila.length ? 'Tudo pronto.' : ''
  $('barra').hidden = !fila.length
}

function atualizarTudo() {
  mostrarAjustes()
  for (const item of fila) atualizarItem(item)
  atualizarBarra()
}

// ─────────── conversão ───────────

async function converterSaida(item, s) {
  s.estado = 'convertendo'
  s.tentou = true
  s.progresso = 0
  s.nome = nomeSaida(item.arquivo.name, s.preset)
  atualizarItem(item)
  let ultimo = 0
  try {
    const r = await converterArquivo(item.arquivo, s.preset, {
      ...opcoes(),
      info: item.info,
      destino: pasta,
      nome: s.nome,
      lerLook: Looks.ler,
      aoComecar: (c) => (s.conversao = c),
      aoProgredir: (f) => {
        s.progresso = f
        const agora = performance.now()
        if (agora - ultimo > 120) {
          ultimo = agora
          const barra = $(`item-${item.id}`)?.querySelector('.saida--convertendo .progresso')
          const rotulo = $(`item-${item.id}`)?.querySelector('.saida--convertendo .saida-estado')
          if (barra) barra.style.setProperty('--curso', String(f))
          if (rotulo) rotulo.textContent = `${Math.round(f * 100)}%`
        }
      },
    })
    s.plano = r.plano
    s.avisos = r.avisos
    s.bytes = r.bytes
    if (r.blob) s.url = URL.createObjectURL(r.blob)
    if (r.blob && item.arquivo.drive) s.blob = r.blob // veio do Drive: pode voltar para lá
    const velocidade = item.info.duracao / r.segundos
    s.resumo = [
      r.codecVideo ? [nomeCodec(r.codecVideo), r.codecAudio && nomeCodec(r.codecAudio)].filter(Boolean).join(' + ') : null,
      `${velocidade.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× tempo real`,
    ].filter(Boolean)
    s.estado = 'feito'
    registrarNoPainel(item, s, r)
  } catch (e) {
    s.estado = e instanceof MB.ConversionCanceledError ? 'cancelado' : 'erro'
    s.erro = s.estado === 'erro' ? (e.codigo ? e.message : `Não deu para converter: ${e.message}`) : null
    if (s.estado === 'erro') console.warn(e)
  }
  s.conversao = null
  atualizarItem(item)
}

// ─────────── painel: com conta, cada saída pronta entra no histórico do aparelho (app/painel.js) ───────────

const idProjeto = new URLSearchParams(location.search).get('projeto')
let projetoAtual = null

/** O id da conta neste aparelho (resumo do sub), ou null fora da conta. */
const contaDentro = async () => {
  const c = await lerConta()
  return c.estado === 'dentro' && c.pessoa?.id ? c.pessoa.id : null
}

async function registrarNoPainel(item, s, r) {
  const conta = await contaDentro()
  if (!conta) return
  const reg = { ...registro({ arquivo: item.arquivo, info: item.info, preset: s.preset, resultado: r, nome: s.nome, projeto: projetoAtual?.id }), nuvem: false }
  await Historico.registrar(conta, reg).catch(() => {})
  await Nuvem.enviarConversao(conta, reg)
}

/** Com a conta: traz os presets de outros aparelhos e os da equipe, e redesenha. */
async function sincronizarConta() {
  const conta = await contaDentro()
  if (!conta) return
  const r = await Nuvem.sincronizar(conta)
  if (!r.nuvem) return
  meus = Meus.carregar()
  daEquipe = Nuvem.presetsDaEquipe()
  desenharAbas()
  desenharPresets()
  atualizarTudo()
}

/** ?projeto=<id> (vindo do painel): marca os destinos do projeto e as conversões entram nele. */
async function abrirProjeto() {
  if (!idProjeto) return
  const c = await lerConta()
  if (c.estado !== 'dentro' || !c.pessoa?.id) return
  const p = await Historico.projetoPorId(c.pessoa.id, idProjeto).catch(() => null)
  if (!p) return
  projetoAtual = p
  const destinos = p.destinos.filter((d) => achar(d))
  if (!pedido && destinos.length) {
    escolhidos.clear()
    for (const d of destinos) escolhidos.add(d)
    grupo = achar(destinos[0])?.grupo ?? grupo
    desenharAbas()
    desenharPresets()
    atualizarTudo()
  }
  const chip = el('a', { className: 'vindo', href: '/painel', title: 'Voltar ao painel' }, icone('camadas'), el('span', { textContent: p.nome }))
  chip.dataset.projeto = ''
  ;(document.querySelector('.vindo') ?? $('soltar')).after(chip)
}

// ─────────── Drive pelo SOBEDESCE (app/drive.js): escolher lá, ler aos pedaços, voltar o resultado ───────────

$('outras-fontes').hidden = !RECURSOS.drive
$('escolher-drive').addEventListener('click', () =>
  escolherNoDrive({ tema: window.relayTema?.atual() ?? 'claro', escolheu: (arquivos) => adicionar(arquivos) }),
)

async function mandarAoDrive(item, s) {
  s.envio = 'fila'
  atualizarItem(item)
  try {
    await enviarAoDrive({ nome: s.nome, blob: s.blob, pasta: item.arquivo.drive.pasta }, (d) => {
      s.envio = d.estado
      s.erro = d.estado === 'erro' ? d.erro || 'O Drive recusou o envio.' : s.erro
      atualizarItem(item)
    })
  } catch (e) {
    s.envio = 'erro'
    s.erro = e.message
    atualizarItem(item)
  }
}

$('converter').addEventListener('click', async () => {
  if (rodando) return
  rodando = true
  atualizarBarra()
  try {
    if ($('salvar-pasta').checked && !pasta) pasta = await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch {
    pasta = null // cancelou a escolha: monta na memória
  }
  // sempre a próxima que espera: a pessoa pode mudar os destinos ou soltar arquivos no meio
  for (;;) {
    const item = fila.find((i) => i.estado === 'pronto' && i.saidas.some((x) => x.estado === 'esperando'))
    if (!item) break
    await converterSaida(item, item.saidas.find((x) => x.estado === 'esperando'))
  }
  rodando = false
  atualizarBarra()
})

// ─────────── soltar ───────────

const zona = $('soltar')
$('arquivos').addEventListener('change', (e) => {
  adicionar([...e.target.files])
  e.target.value = ''
})
for (const alvo of [zona, document.body]) {
  alvo.addEventListener('dragover', (e) => {
    e.preventDefault()
    zona.classList.add('soltando')
  })
  alvo.addEventListener('dragleave', (e) => {
    if (e.target === zona || !zona.contains(e.relatedTarget)) zona.classList.remove('soltando')
  })
  alvo.addEventListener('drop', (e) => {
    e.preventDefault()
    zona.classList.remove('soltando')
    adicionar([...(e.dataTransfer?.files ?? [])])
  })
}

// ─────────── "Máxima qualidade": o app SOBEDESCE converte com o x264 deste computador ───────────

/** Computador (Mac ou Windows): onde o app SOBEDESCE existe. */
const computador = !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && /Mac|Win/i.test(navigator.platform || navigator.userAgent) && !('ontouchend' in document && /Mac/.test(navigator.platform))

function abrirMaxima() {
  const { link, levados, fora } = linkMaxima([...escolhidos], meus)
  const d = el('dialog', { className: 'folha folha--curta', ariaLabel: 'Máxima qualidade' })
  const fechar = () => (d.close(), d.remove())
  d.addEventListener('click', (e) => e.target === d && fechar())
  d.addEventListener('close', () => d.remove())
  const abrir = el('a', { className: 'vidro vidro--tinta', href: link, textContent: 'Abrir no SOBEDESCE' })
  abrir.addEventListener('click', () => setTimeout(fechar, 300))
  const cancelar = el('button', { type: 'button', className: 'vidro', textContent: 'Agora não' })
  cancelar.onclick = fechar
  d.append(
    el('div', { className: 'folha-topo' }, el('h2', {}, el('span', { className: 'fino', textContent: 'Máxima ' }), el('span', { className: 'pesado', textContent: 'qualidade' })), el('p', { className: 'apoio', textContent: 'O app SOBEDESCE converte com o x264 deste computador. O arquivo fica ao lado do original.' })),
    el(
      'div',
      { className: 'folha-meio folha-meio--uma' },
      el('div', { className: 'fichas' }, ...levados.map((n) => ficha(n, 'ficha--sinal'))),
      fora.length ? el('p', { className: 'apoio', textContent: `Fica só aqui no navegador: ${fora.join(', ')}.` }) : null,
      el('p', { className: 'apoio' }, 'Ainda não tem o app? ', el('a', { href: 'https://absolutezro.com/baixar', target: '_blank', rel: 'noopener', textContent: 'Use no computador com a Absolute ZRO' }), '.'),
    ),
    el('div', { className: 'folha-acoes' }, el('span', { className: 'espaco' }), cancelar, abrir),
  )
  document.body.append(d)
  d.showModal()
}

if (computador) {
  $('maxima').hidden = false
  $('maxima').addEventListener('click', abrirMaxima)
}

// ─────────── aparelho e tema ───────────

capacidades().then((c) =>
  $('aparelho').replaceChildren(
    ...[
      ['H.264', c.avc],
      ['HEVC', c.hevc],
      ['AAC', c.aac],
    ].map(([nome, ok]) => {
      const f = ficha(nome, ok ? 'ficha--sinal' : '')
      f.title = `${nome}: ${ok ? 'este aparelho grava' : nome === 'AAC' ? 'pelo codificador do Relay (WASM)' : 'este aparelho não grava'}`
      return f
    }),
  ),
)

const botaoTema = document.querySelector('[data-tema-botao]')
const pintarTema = () => botaoTema?.replaceChildren(icone(window.relayTema?.atual() === 'escuro' ? 'sol' : 'lua'))
botaoTema?.addEventListener('click', () => {
  window.relayTema?.alternar()
  pintarTema()
  mudarTema(window.relayTema?.atual())
})

icones()
pintarTema()
desenharAbas()
desenharPresets()
atualizarTudo()
window.relayPronto = true
sincronizarConta().finally(abrirProjeto)

// o Set, a aba em comum do ecossistema: "Set" no fim das páginas do topo (app/set.js)
montarSet()
