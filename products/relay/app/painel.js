// Relay · o painel da conta (/painel): o que foi convertido neste aparelho, os projetos (nome e destinos de sempre) e
// os presets da pessoa. Quem entra com a Absolute ZRO cai aqui (api/_zro.js, VOLTA_PADRAO). Os dados são do aparelho
// (app/historico.js); o conversor registra cada saída pronta quando há conta (app/converter.js).

import { GRUPOS, PRESETS, preset as presetDoRelay } from '../src/presets.js'
import { tamanhoLegivel } from '../src/plano.js'
import { duracaoCurta, numeros, porProjeto, projeto as validarProjeto, quando } from '../src/painel.js'
import { icone, icones } from './icones.js'
import { lerConta, linkEntrar, preencherAvatar, primeiroNome } from './conta.js'
import { montarSet } from './set.js'
import * as Historico from './historico.js'
import * as Meus from './meus.js'
import * as Nuvem from './nuvem.js'

const $ = (id) => document.getElementById(id)
const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos.filter((f) => f != null && f !== false))
  return n
}
const ficha = (texto, extra = '') => el('span', { className: `ficha ${extra}`.trim(), textContent: texto })
const RECENTES = 8

icones()
montarSet()

const botaoTema = document.querySelector('[data-tema-botao]')
const pintarTema = () => botaoTema?.replaceChildren(icone(window.relayTema?.atual() === 'escuro' ? 'sol' : 'lua'))
botaoTema?.addEventListener('click', () => {
  window.relayTema?.alternar()
  pintarTema()
})
pintarTema()

let meus = Meus.carregar()
let daEquipe = Nuvem.presetsDaEquipe()
const achar = (id) => meus.find((p) => p.id === id) ?? daEquipe.find((p) => p.id === id) ?? presetDoRelay(id)
let conta = null
let equipe = false // a pessoa tem organização e a conta está ligada: dá para liberar para a equipe
let lista = []
let projetos = []
let verTudo = false

// ─────────── recentes ───────────

function linhaConversao(c, { comProjeto = true } = {}) {
  const p = achar(c.preset.id)
  const s = c.saida
  const nomeProjeto = comProjeto && c.projeto ? projetos.find((x) => x.id === c.projeto)?.nome : null
  const denovo = p ? el('a', { className: 'vidro vidro--icone', href: `converter?preset=${encodeURIComponent(c.preset.id)}${c.projeto ? `&projeto=${encodeURIComponent(c.projeto)}` : ''}`, title: 'Converter de novo com este destino' }, icone('seta')) : null
  denovo?.setAttribute('aria-label', `Converter de novo para ${c.preset.nome}`)
  return el(
    'li',
    { className: 'conversao' },
    el('span', { className: 'conversao-icone' }, icone(p?.icone ?? c.preset.icone)),
    el(
      'span',
      { className: 'conversao-corpo' },
      el('strong', { textContent: s.nome || c.entrada.nome, title: c.entrada.nome ? `De ${c.entrada.nome}` : '' }),
      el(
        'span',
        { className: 'fichas' },
        ficha(c.preset.nome),
        s.largura ? ficha(`${s.largura}×${s.altura}`) : null,
        s.bytes ? ficha(tamanhoLegivel(s.bytes), 'ficha--sinal') : null,
        nomeProjeto ? ficha(nomeProjeto, 'ficha--projeto') : null,
      ),
    ),
    el('time', { className: 'conversao-quando', dateTime: new Date(c.quando).toISOString(), textContent: quando(c.quando) }),
    denovo,
  )
}

function desenharRecentes() {
  const mostrar = verTudo ? lista : lista.slice(0, RECENTES)
  $('recentes').replaceChildren(...mostrar.map((c) => linhaConversao(c)))
  $('recentes').hidden = !lista.length
  $('recentes-vazio').hidden = Boolean(lista.length)
  $('ver-tudo').hidden = lista.length <= RECENTES
  $('ver-tudo').textContent = verTudo ? 'Menos' : `Ver tudo (${lista.length})`
  $('limpar').hidden = !lista.length

  const n = numeros(lista)
  $('numeros').hidden = !lista.length
  $('numeros').replaceChildren(
    numero(String(n.conversoes), n.conversoes === 1 ? 'conversão' : 'conversões', 'seta'),
    numero(duracaoCurta(n.duracao), 'de vídeo e áudio', 'onda'),
    numero(n.poupado ? tamanhoLegivel(n.poupado) : '—', 'a menos no disco', 'peso'),
  )
}

const numero = (valor, rotulo, nomeIcone) => el('li', { className: 'numero cartao' }, icone(nomeIcone), el('strong', { textContent: valor }), el('span', { textContent: rotulo }))

// ─────────── projetos ───────────

function desenharProjetos() {
  const contas = porProjeto(lista)
  const cartoes = projetos.map((p) => {
    const c = contas[p.id]
    const b = el(
      'button',
      { type: 'button', className: 'projeto cartao' },
      el('strong', { textContent: p.nome }),
      p.meu === false ? ficha('Da equipe') : p.equipe ? ficha('Com a equipe') : null,
      el('span', { className: 'projeto-destinos' }, ...p.destinos.slice(0, 6).map((d) => icone(achar(d)?.icone ?? 'seta')), p.destinos.length > 6 ? el('small', { textContent: `+${p.destinos.length - 6}` }) : null),
      el('small', { className: 'apoio', textContent: c ? `${c.conversoes} ${c.conversoes === 1 ? 'conversão' : 'conversões'} · ${quando(c.ultima)}` : 'Nada convertido ainda' }),
    )
    b.onclick = () => abrirProjeto(p)
    return el('li', {}, b)
  })
  const novo = el('button', { type: 'button', className: 'projeto projeto--novo' }, icone('mais'), el('strong', { textContent: 'Novo projeto' }))
  novo.onclick = () => abrirProjeto(null)
  $('projetos').replaceChildren(...cartoes, el('li', {}, novo))
}

let aberto = null
let escolhidos = new Set()

function chipDestino(p) {
  const b = el('button', { type: 'button', className: 'chip-destino' }, icone(p.icone), el('span', { textContent: p.nome }))
  const marcar = () => b.setAttribute('aria-pressed', String(escolhidos.has(p.id)))
  marcar()
  b.onclick = () => {
    if (escolhidos.has(p.id)) escolhidos.delete(p.id)
    else escolhidos.add(p.id)
    marcar()
  }
  return b
}

function abrirProjeto(p) {
  aberto = p
  const soLer = p?.meu === false // da equipe: usa, não muda
  escolhidos = new Set(p?.destinos ?? [])
  $('t-projeto').textContent = p ? p.nome : 'Novo projeto'
  $('projeto-nome').value = p?.nome ?? ''
  $('projeto-erro').hidden = true
  const grupos = [...GRUPOS.map((g) => [g, PRESETS.filter((x) => x.grupo === g)]), ['Meus', meus]].filter(([, ps]) => ps.length)
  $('projeto-destinos').replaceChildren(...grupos.map(([g, ps]) => el('div', { className: 'grupo-destinos' }, el('span', { className: 'rotulo', textContent: g }), el('div', { className: 'chips' }, ...ps.map(chipDestino)))))
  const delas = p ? lista.filter((c) => c.projeto === p.id) : []
  $('projeto-conversoes').replaceChildren(...delas.slice(0, 20).map((c) => linhaConversao(c, { comProjeto: false })))
  $('projeto-conversoes').hidden = !delas.length
  $('projeto-apagar').hidden = !p || soLer
  $('projeto-guardar').hidden = soLer
  $('projeto-nome').disabled = soLer
  for (const b of $('projeto-destinos').querySelectorAll('button')) b.disabled = soLer
  $('projeto-equipe-linha').hidden = !equipe || soLer
  $('projeto-equipe').checked = Boolean(p?.equipe)
  $('projeto-converter').hidden = !p
  if (p) $('projeto-converter').href = `converter?projeto=${encodeURIComponent(p.id)}`
  $('folha-projeto').showModal()
  if (!p) $('projeto-nome').focus()
}

$('form-projeto').addEventListener('submit', async (ev) => {
  ev.preventDefault()
  try {
    const agora = Date.now()
    const p = validarProjeto({ id: aberto?.id ?? `pj-${crypto.randomUUID()}`, nome: $('projeto-nome').value, destinos: [...escolhidos], criado: aberto?.criado ?? agora, atualizado: agora }, (d) => Boolean(achar(d)))
    await Nuvem.guardarProjeto(conta, { ...p, equipe: equipe && $('projeto-equipe').checked })
    projetos = await Historico.projetos(conta)
    desenharProjetos()
    desenharRecentes()
    $('folha-projeto').close()
  } catch (e) {
    $('projeto-erro').textContent = e.message
    $('projeto-erro').hidden = false
  }
})
$('projeto-apagar').addEventListener('click', async () => {
  if (!aberto || !confirm(`Apagar "${aberto.nome}"? As conversões ficam no histórico.`)) return
  await Nuvem.apagarProjeto(conta, aberto.id)
  ;[projetos, lista] = await Promise.all([Historico.projetos(conta), Historico.conversoes(conta)])
  desenharProjetos()
  desenharRecentes()
  $('folha-projeto').close()
})
for (const b of document.querySelectorAll('[data-fechar]')) b.addEventListener('click', () => b.closest('dialog').close())
for (const b of document.querySelectorAll('[data-novo-projeto]')) b.addEventListener('click', () => abrirProjeto(null))

// ─────────── meus presets ───────────

function desenharMeus() {
  const liberados = Nuvem.liberadosParaEquipe()
  const chip = (p) => el('a', { className: 'chip-destino', href: `converter?preset=${encodeURIComponent(p.id)}`, title: `Converter com ${p.nome}` }, icone(p.icone ?? 'estrela'), el('span', { textContent: p.nome }))
  $('meus').replaceChildren(
    ...meus.map((p) => {
      const li = el('li', { className: 'meu' }, chip(p))
      if (equipe) {
        const b = el('button', { type: 'button', className: 'chip-equipe', title: 'A equipe pode usar este preset' }, icone('camadas'))
        b.setAttribute('aria-pressed', String(Boolean(liberados[p.id])))
        b.setAttribute('aria-label', `Liberar ${p.nome} para a equipe`)
        b.onclick = async () => {
          const sim = b.getAttribute('aria-pressed') !== 'true'
          b.setAttribute('aria-pressed', String(sim))
          await Nuvem.liberarPreset(conta, p, sim).catch(() => b.setAttribute('aria-pressed', String(!sim)))
        }
        li.append(b)
      }
      return li
    }),
  )
  $('meus').hidden = !meus.length
  $('meus-vazio').hidden = Boolean(meus.length)
  $('meus-equipe').replaceChildren(...daEquipe.map((p) => el('li', {}, chip(p))))
  $('bloco-equipe').hidden = !daEquipe.length
}

// ─────────── começo ───────────

$('ver-tudo').addEventListener('click', () => {
  verTudo = !verTudo
  desenharRecentes()
})
$('limpar').addEventListener('click', async () => {
  if (!confirm('Limpar o histórico? Os arquivos convertidos não são apagados.')) return
  await Nuvem.limparHistorico(conta).catch((e) => alert(e.message))
  lista = []
  desenharRecentes()
  desenharProjetos()
})

const c = await lerConta()
$('carregando').remove()
$('painel').removeAttribute('aria-busy')
if (c.estado !== 'dentro' || !c.pessoa?.id) {
  $('fora-entrar').href = linkEntrar('/painel')
  if (c.estado === 'desligado') {
    $('fora-apoio').textContent = 'O login não está ligado neste endereço.'
    $('fora-entrar').hidden = true
  }
  $('fora').hidden = false
} else {
  conta = c.pessoa.id
  preencherAvatar($('avatar'), c.pessoa)
  $('ola').textContent = `${primeiroNome(c.pessoa)}.`
  const desenharTudo = async () => {
    ;[lista, projetos] = await Promise.all([Historico.conversoes(conta), Historico.projetos(conta)])
    meus = Meus.carregar()
    daEquipe = Nuvem.presetsDaEquipe()
    desenharRecentes()
    desenharProjetos()
    desenharMeus()
  }
  // primeiro o que está no aparelho (abre na hora); depois a conta, e redesenha
  await desenharTudo()
  $('dentro').hidden = false
  const r = await Nuvem.sincronizar(conta)
  equipe = r.nuvem && r.equipe
  $('onde').textContent = r.nuvem ? 'Na sua conta, em todo aparelho.' : 'Fica neste aparelho.'
  if (r.nuvem) await desenharTudo()
  window.painelPronto = true
}
