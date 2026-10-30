// Relay · "Meus" presets: guardar no aparelho, levar como .relay.json e o editor da ficha técnica (uma folha <dialog>).
// A validação é de src/personalizado.js; a ficha ao vivo vem de src/plano.js (a mesma conta da conversão).
//
// Pouco texto à vista: o principal (formato, vídeo, áudio) aberto; imagem, trecho, computador e cor em grupos
// recolhidos, que ficam abertos enquanto a folha estiver aberta.

import { PRESETS, preset as presetDoRelay } from '../src/presets.js'
import { LIMITES, OPCOES, especificacaoDe, exportar, importar, presetPersonalizado } from '../src/personalizado.js'
import { fichaTecnica, fmtTempo, planejar, tamanhoLegivel } from '../src/plano.js'
import { RECURSOS } from './recursos.js'

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
const virgula = (n) => String(n).replace('.', ',')

/** "1:05,5" ou "65,5" → 65,5 s; vazio → null; ilegível → NaN. */
export function lerTempo(texto) {
  const t = String(texto ?? '').trim().replace(',', '.')
  if (!t) return null
  const partes = t.split(':').map(Number)
  if (partes.some((n) => !Number.isFinite(n) || n < 0) || partes.length > 3) return NaN
  return partes.reduce((total, n) => total * 60 + n, 0)
}

/** Chave (o relé da página) com rótulo. */
function chave(rotulo, ligada, aoMudar) {
  const i = el('input', { type: 'checkbox', checked: ligada })
  i.onchange = () => aoMudar(i.checked)
  return el('label', { className: 'chave chave--folha' }, i, el('span', { className: 'chave-trilho', ariaHidden: 'true' }), el('span', { textContent: rotulo }))
}

/**
 * Abre o editor. `p`: preset da pessoa (editar) ou do Relay (partir dele). `origem`: o arquivo para a ficha ao vivo
 * (ou um master de exemplo). `looks`: app/looks.js (a cor da Revela). Devolve Promise<{ acao: 'salvar', preset } |
 * { acao: 'apagar' } | null>.
 */
export function editar(p, origem, looks = null) {
  const editando = p?.personalizado ? p : null
  let e = especificacaoDe(p ?? presetDoRelay('youtube-1080'))
  if (!editando) e.nome = p ? `${p.nome} · meu` : 'Meu preset'
  const dialogo = el('dialog', { className: 'folha', ariaLabel: editando ? 'Editar preset' : 'Novo preset' })
  document.body.append(dialogo)
  const abertos = new Set(Object.entries({ imagem: e.recorte && Object.values(e.recorte).some(Boolean), trecho: e.inicio != null || e.fim != null, computador: e.computador.velocidade !== 'slow' || e.computador.ajuste || e.computador.perfil || e.computador.desentrelacar || e.computador.ruido || e.computador.nitidez || e.computador.loudness, cor: Boolean(e.cor) }).filter(([, v]) => v).map(([k]) => k))
  let listaLooks = []
  let modulosCor = null

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

    /** Grupo recolhido (<details>); lembra se está aberto quando a folha se redesenha. */
    function grupo(id, titulo, ...filhos) {
      const d = el('details', { className: 'grupo', open: abertos.has(id) }, el('summary', { textContent: titulo }), el('div', { className: 'grupo-corpo' }, ...filhos.filter(Boolean)))
      d.ontoggle = () => (d.open ? abertos.add(id) : abertos.delete(id))
      return d
    }

    function montar() {
      const video = e.formato === 'mp4'
      const comp = e.computador
      corpo.replaceChildren(
        ...[
        linha(
          'Partir de',
          escolha(
            'Partir de',
            PRESETS.map((x) => ({ valor: x.id, nome: x.nome })),
            e.base ?? 'youtube-1080',
            (id) => {
              e = { ...especificacaoDe(presetDoRelay(id)), nome: e.nome, cor: e.cor }
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
        video ? linha('Codec', segmentos('Codec', OPCOES.codec.map((c) => ({ valor: c.id, nome: c.nome })), e.codec, (c) => ((e.codec = c), montar()))) : null,
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
        video && e.tamanho === 'tela' ? linha('Proporção diferente', segmentos('Encaixe', OPCOES.encaixe.map((o) => ({ valor: o.id, nome: o.nome })), e.encaixe, (x) => ((e.encaixe = x), atualizar()))) : null,
        video
          ? linha(
              'Cadência',
              escolha('Cadência', OPCOES.fps.map((f) => ({ valor: f, nome: f ? `${virgula(f)} fps` : 'A do arquivo' })), e.fps, (f) => ((e.fps = f), montar())),
              e.fps ? segmentos('Modo da cadência', OPCOES.fpsModo.map((m) => ({ valor: m.id, nome: m.nome })), e.fpsModo, (m) => ((e.fpsModo = m), atualizar())) : null,
            )
          : null,
        video
          ? linha(
              'Qualidade',
              segmentos('Qualidade', OPCOES.qualidade.map((q) => ({ valor: q.id, nome: q.nome })), e.qualidade, (q) => ((e.qualidade = q), montar())),
              e.qualidade === 'bitrate' || e.qualidade === 'cbr'
                ? el('span', { className: 'unidade' }, numero('Mbit/s', e.kbps / 1000, (n) => (e.kbps = Math.round(n * 1000)), 0.1), 'Mbit/s')
                : e.qualidade === 'rf'
                  ? el('span', { className: 'unidade', title: 'RF do x264: menor = mais qualidade. 18 é quase sem perda visível.' }, 'RF', numero('RF', e.rf, (n) => (e.rf = n), 1, LIMITES.rf))
                  : el('span', { className: 'unidade' }, numero('MB', e.mb, (n) => (e.mb = n), 1), 'MB'),
            )
          : null,
        video ? linha('Quadro-chave', segmentos('Quadro-chave', OPCOES.gop.map((g) => ({ valor: g, nome: `${virgula(g)} s` })), Number(e.gop), (g) => ((e.gop = g), atualizar()))) : null,
        video
          ? grupo(
              'imagem',
              'Recorte e giro',
              linha(
                'Recorte (px)',
                ...['cima', 'baixo', 'esquerda', 'direita'].map((lado) => el('span', { className: 'unidade' }, lado, numero(`Recorte ${lado}`, e.recorte[lado], (n) => (e.recorte = { ...e.recorte, [lado]: n }), 2))),
              ),
              linha('Girar', segmentos('Girar', OPCOES.giro.map((g) => ({ valor: g, nome: g ? `${g}°` : 'Não' })), e.giro, (g) => ((e.giro = g), atualizar())), chave('Espelhar', e.espelhar, (x) => ((e.espelhar = x), atualizar()))),
            )
          : null,
        grupo(
          'trecho',
          'Trecho',
          linha('Converter só de', tempo('Início', e.inicio, (t) => (e.inicio = t)), el('span', { className: 'unidade', textContent: 'até' }), tempo('Fim', e.fim, (t) => (e.fim = t))),
        ),
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
        e.audio !== 'nenhum' || e.formato !== 'mp4' ? linha('Volume', el('span', { className: 'unidade' }, numero('Volume em dB', e.ganho, (n) => (e.ganho = n), 0.5, LIMITES.ganho), 'dB')) : null,
        grupo(
          'computador',
          'No computador · Máxima qualidade',
          video ? linha('Velocidade do x264', escolha('Velocidade', OPCOES.velocidade.map((o) => ({ valor: o.id, nome: o.nome })), comp.velocidade, (x) => ((e.computador = { ...comp, velocidade: x }), atualizar()))) : null,
          video ? linha('Ajuste', escolha('Ajuste', OPCOES.ajuste.map((o) => ({ valor: o.id, nome: o.nome })), comp.ajuste, (x) => ((e.computador = { ...comp, ajuste: x }), atualizar()))) : null,
          video && e.codec === 'avc' ? linha('Perfil', escolha('Perfil', OPCOES.perfil.map((o) => ({ valor: o.id, nome: o.nome })), comp.perfil, (x) => ((e.computador = { ...comp, perfil: x }), atualizar()))) : null,
          video ? linha('Filtros', chave('Desentrelaçar', comp.desentrelacar, (x) => ((e.computador = { ...comp, desentrelacar: x }), atualizar()))) : null,
          video ? linha('Reduzir ruído', segmentos('Reduzir ruído', OPCOES.ruido.map((o) => ({ valor: o.id, nome: o.nome })), comp.ruido, (x) => ((e.computador = { ...comp, ruido: x }), atualizar()))) : null,
          video ? linha('Nitidez', segmentos('Nitidez', OPCOES.nitidez.map((o) => ({ valor: o.id, nome: o.nome })), comp.nitidez, (x) => ((e.computador = { ...comp, nitidez: x }), atualizar()))) : null,
          e.audio !== 'nenhum' || e.formato !== 'mp4' ? linha('Volume normalizado', escolha('Volume normalizado', OPCOES.loudness.map((o) => ({ valor: o.id, nome: o.nome })), comp.loudness, (x) => ((e.computador = { ...comp, loudness: x }), atualizar()))) : null,
        ),
        video && RECURSOS.revela ? grupoCor() : null,
        ].filter(Boolean),
      )
      atualizar()
    }

    /** Cor da Revela: log da câmera → Rec.709 e um look (.cube) guardado no aparelho. */
    function grupoCor() {
      const corpoCor = el('div', { className: 'grupo-corpo', textContent: 'Carregando a cor da Revela…' })
      const d = el('details', { className: 'grupo grupo--revela', open: abertos.has('cor') }, el('summary', {}, 'Cor', el('span', { className: 'marca-revela', textContent: 'Revela' })), corpoCor)
      d.ontoggle = () => (d.open ? abertos.add('cor') : abertos.delete('cor'))
      ;(async () => {
        modulosCor ??= await import('../src/cor.js')
        if (looks) listaLooks = await looks.listar()
        const { ENTRADAS_COR, TONS } = modulosCor
        const cor = e.cor ?? { entrada: null, tom: 'suave', look: null }
        const mudar = (novo) => {
          const r = { ...cor, ...novo }
          e.cor = r.entrada || r.look ? r : null
          montar()
        }
        const arquivo = el('input', { type: 'file', accept: '.cube', hidden: true })
        arquivo.onchange = async () => {
          const f = arquivo.files[0]
          if (!f || !looks) return
          try {
            if (f.size > 20e6) throw new Error('Este .cube passa de 20 MB.')
            const novo = await looks.guardar(f.name, await f.text())
            listaLooks = await looks.listar()
            mudar({ look: { id: novo.id, nome: novo.nome, ...(novo.pedeLog ? { sobre: 'log' } : {}) } })
          } catch (err) {
            erro.textContent = err.message
          }
        }
        const opcoesLook = [{ valor: null, nome: 'Nenhum' }, ...listaLooks.map((l) => ({ valor: l.id, nome: l.nome })), ...(looks ? [{ valor: 'carregar', nome: 'Carregar .cube…' }] : [])]
        corpoCor.replaceChildren(
          linha(
            'Log da câmera',
            escolha('Log da câmera', [{ valor: null, nome: 'Nenhum (já é Rec.709)' }, ...ENTRADAS_COR.map((x) => ({ valor: x.id, nome: x.nome }))], cor.entrada, (id) => mudar({ entrada: id, entradaNome: ENTRADAS_COR.find((x) => x.id === id)?.nome.replace(/^[^·]+· /, '') ?? null })),
          ),
          cor.entrada ? linha('Altas', segmentos('Mapa de tom', TONS.map((t) => ({ valor: t.id, nome: t.nome })), cor.tom, (t) => mudar({ tom: t }))) : null,
          linha(
            'Look',
            escolha('Look', opcoesLook, cor.look?.id ?? null, (id) => {
              if (id === 'carregar') return arquivo.click()
              const l = listaLooks.find((x) => x.id === id)
              mudar({ look: l ? { id: l.id, nome: l.nome, ...(l.pedeLog ? { sobre: 'log' } : {}) } : null })
            }),
            arquivo,
          ),
          cor.look && !cor.entrada
            ? linha(
                'O look recebe',
                segmentos(
                  'O look recebe',
                  [
                    { valor: 'tela', nome: 'Rec.709' },
                    { valor: 'log', nome: 'O log da câmera' },
                  ],
                  cor.look.sobre === 'log' ? 'log' : 'tela',
                  (x) => mudar({ look: { id: cor.look.id, nome: cor.look.nome, ...(x === 'log' ? { sobre: 'log' } : {}) } }),
                ),
              )
            : null,
          el('p', { className: 'apoio', textContent: 'Sai em Rec.709. O look entra depois da conversão.' }),
        )
      })().catch((err) => (corpoCor.textContent = err.message))
      return d
    }

    function numero(rotulo, valor, aoMudar, passo, faixa = null) {
      const i = el('input', { type: 'number', value: String(valor), step: String(passo), min: String(faixa?.[0] ?? 0), inputMode: 'decimal', ariaLabel: rotulo })
      if (faixa) i.max = String(faixa[1])
      i.oninput = () => {
        aoMudar(Number(i.value))
        atualizar()
      }
      return i
    }

    function tempo(rotulo, valor, aoMudar) {
      const i = el('input', { type: 'text', value: valor == null ? '' : fmtTempo(valor), placeholder: rotulo === 'Início' ? '0:00' : 'o fim', inputMode: 'decimal', ariaLabel: rotulo, className: 'tempo' })
      i.oninput = () => {
        const t = lerTempo(i.value)
        i.setCustomValidity(Number.isNaN(t) ? 'Use minutos:segundos, como 1:05' : '')
        if (!Number.isNaN(t)) aoMudar(t)
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
