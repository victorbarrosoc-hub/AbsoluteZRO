// Relay · "Meus" presets: guardar no aparelho, levar como .relay.json e o editor da ficha técnica (uma folha <dialog>).
// A validação é de src/personalizado.js; a ficha ao vivo vem de src/plano.js (a mesma conta da conversão).

import { PRESETS, preset as presetDoRelay } from '../src/presets.js'
import { OPCOES, especificacaoDe, exportar, importar, presetPersonalizado } from '../src/personalizado.js'
import { fichaTecnica, planejar, tamanhoLegivel } from '../src/plano.js'

const CHAVE = 'relay-meus-presets'

export function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE)
    return bruto ? importar(JSON.parse(bruto)).presets : []
  } catch {
    return []
  }
}

export function guardar(lista) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(exportar(lista)))
    return true
  } catch {
    return false // janela privada ou cheio: vale até fechar a aba
  }
}

/** Baixa a lista como "meus-presets.relay.json". */
export function baixarArquivo(lista) {
  const blob = new Blob([JSON.stringify(exportar(lista), null, 2)], { type: 'application/json' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'meus-presets.relay.json' })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export async function lerArquivo(arquivo) {
  if (arquivo.size > 1e6) throw new Error('Arquivo grande demais para uma lista de presets.')
  return importar(JSON.parse(await arquivo.text()))
}

// ─────────── editor ───────────

const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos.filter((f) => f != null && f !== false))
  return n
}

/** Segmentos (rádio em pílula). `opcoes`: [{ valor, nome }]. */
function segmentos(nome, opcoes, valor, aoMudar) {
  const g = el('div', { className: 'segmentos', role: 'radiogroup', ariaLabel: nome })
  for (const o of opcoes) {
    const b = el('button', { type: 'button', role: 'radio', textContent: o.nome })
    b.setAttribute('aria-checked', String(o.valor === valor))
    b.onclick = () => {
      for (const x of g.children) x.setAttribute('aria-checked', String(x === b))
      aoMudar(o.valor)
    }
    g.append(b)
  }
  return g
}

function escolha(nome, opcoes, valor, aoMudar) {
  const s = el('select', { ariaLabel: nome })
  for (const o of opcoes) s.append(el('option', { value: String(o.valor), textContent: o.nome, selected: o.valor === valor }))
  s.onchange = () => aoMudar(opcoes[s.selectedIndex].valor)
  return s
}

const linha = (rotulo, ...controles) => el('div', { className: 'campo' }, el('span', { className: 'rotulo', textContent: rotulo }), el('div', { className: 'controles' }, ...controles))
const kHz = (t) => (t ? `${(t / 1000).toLocaleString('pt-BR')} kHz` : 'Original')

/**
 * Abre o editor. `p`: preset da pessoa (editar) ou do Relay (partir dele). `origem`: o arquivo para a ficha ao vivo
 * (ou um master de exemplo). Devolve Promise<{ acao: 'salvar', preset } | { acao: 'apagar' } | null>.
 */
export function editar(p, origem) {
  const editando = p?.personalizado ? p : null
  let e = especificacaoDe(p ?? presetDoRelay('youtube-1080'))
  if (!editando) e.nome = p ? `${p.nome} · meu` : 'Meu preset'
  const dialogo = el('dialog', { className: 'folha', ariaLabel: editando ? 'Editar preset' : 'Novo preset' })
  document.body.append(dialogo)

  return new Promise((resolver) => {
    const fechar = (r) => {
      dialogo.close()
      dialogo.remove()
      resolver(r)
    }
    dialogo.addEventListener('cancel', (ev) => {
      ev.preventDefault()
      fechar(null)
    })
    dialogo.addEventListener('click', (ev) => ev.target === dialogo && fechar(null))

    const corpo = el('div', { className: 'folha-corpo' })
    const ficha = el('dl', { className: 'ficha-tecnica' })
    const erro = el('p', { className: 'erro', role: 'alert' })
    const nome = el('input', { type: 'text', value: e.nome, maxLength: 40, ariaLabel: 'Nome do preset', className: 'nome-preset', placeholder: 'Nome do preset' })
    nome.oninput = () => {
      e.nome = nome.value
      atualizar()
    }

    function montar() {
      const video = e.formato === 'mp4'
      corpo.replaceChildren(
        ...[
        linha(
          'Partir de',
          escolha(
            'Partir de',
            PRESETS.map((x) => ({ valor: x.id, nome: x.nome })),
            e.base ?? 'youtube-1080',
            (id) => {
              e = { ...especificacaoDe(presetDoRelay(id)), nome: e.nome }
              montar()
            },
          ),
        ),
        linha(
          'Formato',
          segmentos(
            'Formato',
            OPCOES.formato.map((f) => ({ valor: f.id, nome: f.nome.replace(/ \(só áudio\)/, '') })),
            e.formato,
            (f) => {
              e.formato = f
              if (f === 'mp3' && !OPCOES.kbpsMp3.includes(e.audioKbps)) e.audioKbps = 320
              montar()
            },
          ),
        ),
        video ? el('h3', { className: 'secao', textContent: 'Vídeo' }) : null,
        video ? linha('Codec', segmentos('Codec', OPCOES.codec.map((c) => ({ valor: c.id, nome: c.nome })), e.codec, (c) => ((e.codec = c), atualizar()))) : null,
        video
          ? linha(
              'Tamanho',
              segmentos(
                'Tamanho',
                [
                  { valor: 'lado', nome: 'Proporção do arquivo' },
                  { valor: 'tela', nome: 'Tela fixa' },
                ],
                e.tamanho,
                (t) => ((e.tamanho = t), montar()),
              ),
              e.tamanho === 'lado'
                ? escolha(
                    'Lado menor',
                    OPCOES.lado.map((l) => ({ valor: l, nome: l ? `${l}p` : 'Original' })),
                    e.lado,
                    (l) => ((e.lado = l), atualizar()),
                  )
                : el(
                    'span',
                    { className: 'tela-fixa' },
                    numero('Largura', e.largura, (n) => (e.largura = n), 16),
                    '×',
                    numero('Altura', e.altura, (n) => (e.altura = n), 16),
                  ),
            )
          : null,
        video ? linha('Cadência máxima', escolha('Cadência', OPCOES.fps.map((f) => ({ valor: f, nome: f ? `${f} fps` : 'A do arquivo' })), e.fps, (f) => ((e.fps = f), atualizar()))) : null,
        video
          ? linha(
              'Qualidade',
              segmentos(
                'Qualidade',
                [
                  { valor: 'bitrate', nome: 'Bitrate médio' },
                  { valor: 'tamanho', nome: 'Tamanho máximo' },
                ],
                e.qualidade,
                (q) => ((e.qualidade = q), montar()),
              ),
              e.qualidade === 'bitrate'
                ? el('span', { className: 'unidade' }, numero('Mbit/s', e.kbps / 1000, (n) => (e.kbps = Math.round(n * 1000)), 0.1), 'Mbit/s')
                : el('span', { className: 'unidade' }, numero('MB', e.mb, (n) => (e.mb = n), 1), 'MB'),
            )
          : null,
        video ? linha('Quadro-chave', segmentos('Quadro-chave', OPCOES.gop.map((g) => ({ valor: g, nome: `${String(g).replace('.', ',')} s` })), Number(e.gop), (g) => ((e.gop = g), atualizar()))) : null,
        el('h3', { className: 'secao', textContent: 'Áudio' }),
        e.formato === 'mp4'
          ? linha(
              'Faixa',
              segmentos(
                'Áudio',
                OPCOES.audioVideo.map((a) => ({ valor: a.id, nome: a.nome })),
                e.audio === 'nenhum' ? 'nenhum' : 'aac',
                (a) => ((e.audio = a), montar()),
              ),
            )
          : null,
        e.formato === 'wav'
          ? linha(
              'Profundidade',
              segmentos(
                'Bits',
                [
                  { valor: 'pcm-s24', nome: '24 bits' },
                  { valor: 'pcm-s16', nome: '16 bits' },
                ],
                e.audio === 'pcm-s16' ? 'pcm-s16' : 'pcm-s24',
                (a) => ((e.audio = a), atualizar()),
              ),
            )
          : null,
        e.formato !== 'wav' && e.audio !== 'nenhum'
          ? linha(
              'Bitrate',
              escolha(
                'Bitrate do áudio',
                (e.formato === 'mp3' ? OPCOES.kbpsMp3 : OPCOES.kbpsAac).map((k) => ({ valor: k, nome: `${k} kbit/s` })),
                e.audioKbps,
                (k) => ((e.audioKbps = k), atualizar()),
              ),
            )
          : null,
        e.audio !== 'nenhum' || e.formato !== 'mp4'
          ? linha(
              'Taxa e canais',
              escolha('Taxa', OPCOES.taxa.map((t) => ({ valor: t, nome: kHz(t) })), e.taxa, (t) => ((e.taxa = t), atualizar())),
              escolha('Canais', OPCOES.canais.map((c) => ({ valor: c, nome: c === 2 ? 'Estéreo' : c === 1 ? 'Mono' : 'Os do arquivo' })), e.canais, (c) => ((e.canais = c), atualizar())),
            )
          : null,
        ].filter(Boolean),
      )
      atualizar()
    }

    function numero(rotulo, valor, aoMudar, passo) {
      const i = el('input', { type: 'number', value: String(valor), step: String(passo), min: '0', inputMode: 'decimal', ariaLabel: rotulo })
      i.oninput = () => {
        aoMudar(Number(i.value))
        atualizar()
      }
      return i
    }

    function atualizar() {
      erro.textContent = ''
      try {
        const montado = presetPersonalizado(e, editando?.id)
        const plano = planejar(origem, montado)
        ficha.replaceChildren(
          ...fichaTecnica(plano).flatMap(([r, v]) => [el('dt', { textContent: r }), el('dd', { textContent: v })]),
          el('dt', { textContent: 'Peso' }),
          el('dd', { textContent: `~${tamanhoLegivel(plano.tamanhoEstimado)} ${origem.exemplo ? 'por minuto de 4K' : 'neste arquivo'}` }),
        )
        salvar.disabled = false
      } catch (err) {
        erro.textContent = err.message
        salvar.disabled = Boolean(err.campo)
      }
    }

    const salvar = el('button', { type: 'button', className: 'vidro vidro--tinta', textContent: 'Salvar preset' })
    salvar.onclick = () => {
      try {
        fechar({ acao: 'salvar', preset: presetPersonalizado(e, editando?.id) })
      } catch (err) {
        erro.textContent = err.message
      }
    }
    const cancelar = el('button', { type: 'button', className: 'vidro', textContent: 'Cancelar' })
    cancelar.onclick = () => fechar(null)
    const apagar = editando ? el('button', { type: 'button', className: 'vidro apagar', textContent: 'Apagar' }) : null
    if (apagar)
      apagar.onclick = () => {
        if (apagar.dataset.certeza) return fechar({ acao: 'apagar' })
        apagar.dataset.certeza = '1'
        apagar.textContent = 'Apagar mesmo?'
      }

    dialogo.append(
      el(
        'div',
        { className: 'folha-topo' },
        el('h2', {}, el('span', { className: 'fino', textContent: editando ? 'Editar ' : 'Novo ' }), el('span', { className: 'pesado', textContent: 'preset' })),
        nome,
      ),
      el('div', { className: 'folha-meio' }, corpo, el('aside', { className: 'folha-ficha' }, el('h3', { className: 'secao', textContent: 'Ficha técnica' }), ficha)),
      erro,
      el('div', { className: 'folha-acoes' }, apagar, el('span', { className: 'espaco' }), cancelar, salvar),
    )
    montar()
    dialogo.showModal()
    nome.focus()
    nome.select()
  })
}
