// O editor: o Início com a Z (a IA do ecossistema, app/z.js) e quatro páginas (Mídia, Revisar, Edição, Entrega) em volta de um projeto imutável com desfazer. A IA (o
// Whisper, na máquina) transcreve; as propostas de corte e zoom saem de regras do preset versionado (presets/); nada
// entra na edição sem a pessoa aprovar.

import { PRODUTO } from '../src/produto.js'
import { simbolo, wordmark } from '../src/marca.js'
import { Historico, dividir, remover, mover, aparar, linhaInicial, etiquetar, ajustar, ajustesDe, acelerar, retempo, estabilizar, AJUSTES_PADRAO } from '../src/linha.js'
import { COR_PROPOSTA, corDaMidia } from '../src/cores.js'
import { removerMarcador, removerMidia, aprovar, recusar, comPropostas, comTranscricao, editarPalavra, midiaPorId, novoProjeto, numeros, palavrasNaLinha, salvar, abrir, textoDa, zoomsAprovados } from '../src/projeto.js'
import { proporCortes, proporZooms, resumo } from '../src/propostas.js'
import { adicionarSom, ajustarEfeito, colocarEfeito, foraDaLinha, momentos, moverEfeito, removerEfeitos, somPorId } from '../src/efeitos.js'
import { idDoSomBuscado, pastaDoLink, somDoBanco, sugestaoDoMomento, termoDeBusca } from '../src/sonoplasta.js'
import * as bancoSons from './sons.js'
import { prepararPreset } from '../src/preset.js'
import { envelope } from '../src/analise/silencio.js'
import { trechosParaTranscrever } from '../src/analise/trechos.js'
import { agrupar } from '../src/legenda.js'
import { paraQuadros, paraSegundos, relogio } from '../src/tempo.js'
import { pacote } from '../src/exportar/index.js'
import { arquivoDoSom, arquivosDeFaixas, nomeArquivo, segmentos, sonsUsados } from '../src/exportar/comum.js'
import { zip } from '../src/exportar/zip.js'
import { MODELOS } from '../src/modelos.js'
import { extrairAudio, lerInfo, miniatura, MB } from './midia.js'
import { Player } from './player.js'
import { LinhaUI } from './linha-ui.js'
import { renderizar, codecsDaMaquina, imagensEm, audioDoTrecho } from './render.js'
import { carregarFluxo } from './fluxo.js'
import * as ponte from './ponte.js'
import { montarTrilho } from './trilho.js'
import { DEPOIS, FAMILIA, iconeDe } from '../src/familia.js'
import * as projetos from './projetos.js'
import { lerConta, ondeEditar, PAGINA_FECHADO } from '../site/conta.js'
import { montarAtualizacao } from './atualizacao.js'
import { montarVelocidade } from './velocidade-ui.js'
import { analisarMidia, montarEstabilizar } from './estabilizar-ui.js'
import { PADRAO as ESTAB_PADRAO } from '../src/estabilizar/index.js'
import { analiseDe } from '../src/estabilizar/aplicar.js'
import { pendencias, rotuloBalao } from '../src/pendencias.js'
import { montarZ } from './z.js'
import { montarSet } from './set.js'
import { PainelMarcadores } from './marcadores-ui.js'
import { marcar, secoes } from '../src/marcadores.js'
import { nomeSeguro, planoDePecas, relatorio } from '../src/pecas.js'
import { PainelPecas } from './pecas-ui.js'
import { montarFaixas } from './faixas-ui.js'
import * as discoFaixas from './faixas-disco.js'
import * as nossom from './nossom.js'
import { adicionarSeparacao, ajustarFaixas, desligarFaixas, faixasForaDoTrecho, MIX_TUDO, minutosDoPedido, separacaoPorId, STEMS, trechoParaSeparar, wav16 } from '../src/faixas.js'

const $ = (id) => document.getElementById(id)
// As etapas do editor no dock; a Z por último, fora do dock (ícone da barra), nunca a primeira (titular, 29/10/2026)
const PAGINAS = ['midia', 'revisar', 'edicao', 'entrega', 'z']

const S = {
  h: null, // Historico do projeto
  entradas: new Map(), // midia → { arquivo | url, nome, caminho }
  dbs: new Map(), // midia → envelope de energia (para propostas e forma de onda)
  miniaturas: new Map(),
  preset: null,
  pagina: 'midia',
  selecao: null, // Set de mídias marcadas no modo Selecionar (null = fora do modo)
  filtro: 'tudo',
  selProposta: null,
  modelo: 'rapido',
  analisando: null,
  salvo: true,
}
globalThis.__editor = S

// ───────── conta: o AEON só abre com a conta Absolute ZRO (decisão do titular, 26/10/2026) ─────────
// Sem sessão, com o login desligado ou sem o AEON liberado na conta, vai para entrar.html, que diz o que falta. No
// navegador as rotas /api/zro/* são do site; no app de computador, do próprio app (desktop/conta.cjs).
// Fechado ao público (api/_release.js): conta que o HUB não liberou recebe 403 e vai para "Em desenvolvimento" (no
// site a função api/app.js nem entrega o editor; aqui é a segunda trava, para a sessão que fechou com a página aberta).
const conta = await lerConta()
if (conta.estado === 'fechado') {
  location.replace(`../${PAGINA_FECHADO}`)
  await new Promise(() => {})
}
if (conta.estado !== 'logado' || conta.acesso === false) {
  location.replace(`../entrar.html?volta=${encodeURIComponent('/app/')}`)
  await new Promise(() => {})
}
document.documentElement.dataset.conta = 'ok'
S.conta = conta.pessoa || null
// a separação de voz e instrumental pela NOSSOM: só para quem a NOSSOM atende (o gate dela no HUB)
S.nossom = Boolean(conta.irmaos?.nossom)
// faixas separadas decodificadas (separação → Promise de { voz, instrumental }); as que não estão neste navegador
S.faixas = new Map()
S.faixasFaltando = new Set()
S.separando = null

// ───────── começo ─────────

document.title = `${PRODUTO.nome} · Absolute ZRO`
// a marca (src/marca.js): a estrela compacta e o ΛEON em traço, na cor do texto
$('marcaProduto').innerHTML = `${simbolo({ titulo: false })}${wordmark()}`
$('marcaProduto').title = `${PRODUTO.nome} · ${PRODUTO.frase}`
// menu: cada item faz o mesmo que o atalho ou o botão da tela (Seus universos fecha o projeto aberto e mostra a lista)
S.trilho = montarTrilho({
  conta: S.conta,
  // perfil único: nome, foto e e-mail se editam na conta Absolute ZRO (zro_conta), fora do app
  editarConta: ondeEditar(conta),
  universos: () => fecharProjeto(),
  novo: () => novoProjetoFolha(),
  abrir: () => $('arquivoProjeto').click(),
  salvar: () => salvarAgora(),
  sair: async () => {
    await fetch('/api/zro/sair', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
    location.replace(`../entrar.html?volta=${encodeURIComponent('/app/')}`)
  },
})
// Entrega › depois do AEON: o próximo app do caminho (abre no navegador)
$('depois').replaceChildren(
  ...DEPOIS.map((d) => {
    const f = FAMILIA.find((x) => x.id === d.id)
    const a = Object.assign(document.createElement('a'), { className: 'depois-item', href: d.href, target: '_blank', rel: 'noopener' })
    a.innerHTML = `<img src="${iconeDe(f, '../')}" alt="" width="34" height="34" /><span><strong></strong><span class="apoio"></span></span>`
    a.querySelector('strong').textContent = d.titulo
    a.querySelector('.apoio').textContent = d.texto
    return a
  }),
)
tema(lerTema())
$('tema').onclick = () => tema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
if (ponte.desktop) $('abrirSobedesce').hidden = false

S.preset = prepararPreset(await fetch(new URL('../presets/fala.v1.json', import.meta.url)).then((r) => r.json()))
// Sonoplasta: o que buscar em cada momento e como o português vira termo do banco (regras no preset, não no código)
S.sonoplasta = await fetch(new URL('../presets/sonoplasta.v1.json', import.meta.url)).then((r) => r.json())
/** Os sons que descem de novo sozinhos quando o projeto reabre: os livres e os do banco no Drive. */
const DESCEM = new Set(['openverse', 'banco'])
// fonte: 'livres' (Openverse) ou 'banco' (a pasta da pessoa no Drive, guardada só neste navegador)
S.sons = { fonte: lerGuardado('aeon.sons.fonte') === 'banco' ? 'banco' : 'livres', alvo: null, resultados: [], estado: 'vazio', erro: null, ouvindo: null, banco: bancoDe(lerGuardado('aeon.sons.banco')), pedido: 0 }

const player = new Player($('tela'), (id) => ponte.urlTocavel(S.entradas.get(id)))
const linha = new LinhaUI($('linha'), {
  aoBuscar: (t) => player.irPara(t),
  aoAcao: acaoLinha,
  aoSelecionar: () => desenharInspector(),
})
player.obterFaixas = (id) => carregarFaixas(id)
const marcadoresUI = new PainelMarcadores($('marcadores'), {
  projeto: P,
  fazer: (novo, rotulo) => fazer(novo, rotulo),
  irPara: (t) => player.irPara(t),
  agora: () => player.t,
  aviso: (t) => aviso(t),
  quadros: (ids) => exportarQuadros(ids),
  baixar: (nome, texto, tipo) => ponte.baixar(new Blob([texto], { type: `${tipo};charset=utf-8` }), nome),
})
const pecasUI = new PainelPecas({ projeto: P, aviso: (t) => aviso(t), criarProjeto: (novo) => criarProjetoJunto(novo) })
player.aoMudar(() => {
  linha.tempo(player.t)
  marcadoresUI.tempo()
  $('tempo').textContent = `${relogio(player.t)} / ${relogio(player.duracao)}`
  $('tocar').innerHTML = `<svg><use href="#i-${player.tocando ? 'pausa' : 'play'}"/></svg>`
  $('tocar').ariaLabel = player.tocando ? 'Pausar' : 'Tocar'
  marcarPalavra()
})
$('tocar').onclick = () => player.alternar()

// o dock (as etapas) e o ícone da Z na barra; o Set também mora no dock, mas abre a folha dele (app/set.js)
for (const b of document.querySelectorAll('.dock button[data-ir], #abrirZ')) b.onclick = () => ir(b.dataset.ir)

// ───────── tema e páginas ─────────

function lerTema() {
  try {
    return localStorage.getItem('zro-tema') || 'dark'
  } catch {
    return 'dark'
  }
}
function tema(t) {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem('zro-tema', t)
  } catch {}
  $('tema').innerHTML = `<svg><use href="#i-${t === 'dark' ? 'sol' : 'lua'}"/></svg>`
  document.querySelector('.assinatura').src = `../vendor/marca/absolute-zro-simbolo-${t === 'dark' ? 'branco' : 'grafite'}.svg`
}

/** Troca de página com deslize na direção certa (como as páginas do DaVinci); o palco vai junto para Revisar/Edição. */
function ir(pagina, animar = true) {
  const de = PAGINAS.indexOf(S.pagina)
  const para = PAGINAS.indexOf(pagina)
  S.pagina = pagina
  if (pagina !== 'midia') S.selecao = null
  document.body.dataset.pagina = pagina
  for (const sec of document.querySelectorAll('.pagina')) {
    const i = PAGINAS.indexOf(sec.dataset.pagina)
    sec.dataset.lado = i < para ? 'antes' : i > para ? 'depois' : 'atual'
    sec.inert = i !== para
    if (!animar) sec.classList.add('sem-mola')
    else sec.classList.remove('sem-mola')
  }
  document.documentElement.style.setProperty('--direcao', para >= de ? '1' : '-1')
  // saiu da Z aberta por link (/app/#z): o endereço deixa de apontar para ela, e recarregar volta à tarefa
  if (pagina !== 'z' && location.hash === '#z') history.replaceState(null, '', location.pathname + location.search)
  for (const b of document.querySelectorAll('.dock button[data-ir], #abrirZ')) b.toggleAttribute('aria-current', b.dataset.ir === pagina)
  // a Z só monta quando a pessoa abre (nada da Z carrega sozinho ao abrir o app)
  if (pagina === 'z' && !S.zMontada) S.zMontada = montarZ($('zPainel'))
  const vaga = document.querySelector(`.vaga-palco[data-vaga="${pagina}"]`)
  if (vaga && $('palco').parentElement !== vaga) vaga.append($('palco'))
  if (pagina !== 'revisar' && pagina !== 'edicao') player.pausar()
  if (pagina === 'edicao') requestAnimationFrame(() => desenharLinha())
  $('barraExportar').hidden = !P()?.midias.length || pagina === 'entrega'
  marcarTrilho()
}
/** O menu sabe onde a pessoa está (Seus universos) e se há projeto para salvar. */
function marcarTrilho() {
  S.trilho?.atualizar({ projeto: Boolean(P()), naLista: !P() && S.pagina === 'midia' })
}
$('barraExportar').onclick = () => ir('entrega')

/**
 * O balão de cada página do dock (src/pendencias.js): quantas coisas esperam a pessoa (mídia para escolher de novo,
 * proposta para decidir). Redesenha junto com o projeto, então muda na hora em que ela aprova, recusa ou religa.
 */
function desenharBaloes() {
  const pend = pendencias(P(), { temArquivo: (id) => S.entradas.has(id) })
  for (const b of document.querySelectorAll('.dock button[data-ir]')) {
    const { n, dica } = pend[b.dataset.ir] || { n: 0, dica: '' }
    let balao = b.querySelector('.balao')
    if (!n) {
      balao?.remove()
      b.removeAttribute('title')
      continue
    }
    if (!balao) {
      balao = Object.assign(document.createElement('span'), { className: 'balao' })
      balao.setAttribute('role', 'img')
      b.append(balao)
    }
    balao.textContent = rotuloBalao(n)
    balao.setAttribute('aria-label', `${n} ${n === 1 ? 'pendência' : 'pendências'}`)
    b.title = dica
  }
}

// ───────── projeto e desfazer ─────────

function P() {
  return S.h?.atual
}

function fazer(novo, rotulo) {
  if (!S.h || !S.h.fazer(novo, rotulo)) return
  mudou()
  desenharTudo()
}

// ───────── autosave: cada mudança grava sozinha (Seus universos), sem diálogo ─────────

let gravarTimer = null
function mudou() {
  S.salvo = false
  estadoSalvo('Salvando…')
  clearTimeout(gravarTimer)
  gravarTimer = setTimeout(autosalvar, 900)
}
async function autosalvar() {
  const p = P()
  if (!p) return
  try {
    await projetos.gravar(salvar(p), projetos.resumoDe(p, { miniatura: miniaturaDoProjeto(p) }))
    if (P() === p) {
      S.salvo = true
      estadoSalvo('Salvo')
    }
  } catch (err) {
    console.error(err)
    estadoSalvo('Não salvou')
  }
}
S.autosalvar = autosalvar
function estadoSalvo(t) {
  $('salvo').textContent = t
  $('salvo').dataset.estado = t === 'Salvo' ? 'ok' : t === 'Não salvou' ? 'erro' : 'andando'
}
/** miniatura pequena (JPEG) da primeira mídia com imagem, para o cartão do projeto */
function miniaturaDoProjeto(p) {
  const m = p.midias.find((x) => S.miniaturas.get(x.id))
  const c = m && S.miniaturas.get(m.id)
  if (!c) return S.miniaturaGuardada || null
  const w = 320
  const h = Math.round((w * c.height) / c.width) || 180
  const t = Object.assign(document.createElement('canvas'), { width: w, height: h })
  t.getContext('2d').drawImage(c, 0, 0, w, h)
  return t.toDataURL('image/jpeg', 0.72)
}

function desfazer() {
  const r = S.h?.desfazer()
  if (r != null) {
    mudou()
    aviso(`Desfeito: ${r || 'ação'}`)
    desenharTudo()
  }
}
function refazer() {
  const r = S.h?.refazer()
  if (r != null) {
    mudou()
    aviso(`Refeito: ${r || 'ação'}`)
    desenharTudo()
  }
}
$('desfazer').onclick = desfazer
$('refazer').onclick = refazer

function blocosDaLegenda(p) {
  return agrupar(palavrasNaLinha(p), S.preset.legenda)
}

function desenharTudo() {
  const p = P()
  $('nomeProjeto').textContent = p ? p.nome : ''
  $('desfazer').disabled = !S.h?.podeDesfazer
  $('refazer').disabled = !S.h?.podeRefazer
  $('desfazer').title = S.h?.podeDesfazer ? `Desfazer ${S.h.proximoDesfazer} (⌘Z)` : 'Desfazer (⌘Z)'
  $('refazer').title = S.h?.podeRefazer ? `Refazer ${S.h.proximoRefazer} (⇧⌘Z)` : 'Refazer (⇧⌘Z)'
  document.body.classList.toggle('com-projeto', Boolean(p))
  marcarTrilho()
  desenharBaloes()
  $('barraExportar').hidden = !p?.midias.length || S.pagina === 'entrega'
  desenharMidia()
  desenharHistorico()
  if (!p) {
    $('salvo').textContent = ''
    return
  }
  const blocos = blocosDaLegenda(p)
  player.carregar(p, opcoesPlayer(p, blocos))
  $('legendaLigada').checked = p.legenda.ligada
  $('estiloLegenda').value = p.legenda.estilo
  desenharPropostas()
  desenharTexto()
  desenharInspector()
  if (S.pagina === 'edicao') desenharLinha(blocos)
  desenharSons()
  marcadoresUI.desenhar()
  pecasUI.desenhar()
  prepararFaixas(p)
}

function opcoesPlayer(p, blocos = blocosDaLegenda(p)) {
  return { blocos, zooms: zoomsAprovados(p), legenda: { ligada: p.legenda.ligada, estilo: p.legenda.estilo, posicaoY: S.preset.legenda.posicao_y } }
}

function desenharLinha(blocos) {
  const p = P()
  if (p) linha.mostrar(p, { dbs: S.dbs, blocos: blocos || blocosDaLegenda(p), zooms: zoomsAprovados(p) })
}

// ───────── mídia ─────────

$('escolher').onclick = () => $('arquivo').click()
$('maisMidia').onclick = () => $('arquivo').click()
$('arquivo').onchange = async () => {
  const fs = [...$('arquivo').files]
  $('arquivo').value = ''
  if (fs.length) await adicionar(await Promise.all(fs.map(ponte.entradaDe)))
}
document.addEventListener('dragover', (e) => {
  e.preventDefault()
  document.body.classList.add('soltando')
})
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('soltando')
})
document.addEventListener('drop', async (e) => {
  e.preventDefault()
  document.body.classList.remove('soltando')
  const fs = [...(e.dataTransfer?.files || [])]
  const proj = fs.find((f) => f.name.endsWith(PRODUTO.extensao))
  if (proj) return abrirProjetoDe(await proj.text())
  const midia = fs.filter((f) => /^(video|audio)\//.test(f.type) || /\.(mov|mxf|mkv|mts|m2ts)$/i.test(f.name))
  if (midia.length) {
    ir('midia')
    await adicionar(await Promise.all(midia.map(ponte.entradaDe)))
  }
})

/** Lê as informações e põe as mídias no projeto (cria o projeto na primeira vez). */
async function adicionar(entradas) {
  // vídeo escolhido pelo menu (Arquivo › Adicionar) com a Z aberta: o projeto aparece na Mídia
  if (S.pagina === 'z') ir('midia')
  const novas = []
  for (const e of entradas) {
    // projeto reaberto no navegador: o arquivo de mesmo nome volta para a mídia que já estava no projeto
    const somVolta = P()?.sons?.find((x) => !S.entradas.has(x.id) && x.nome === e.nome)
    if (somVolta) {
      S.entradas.set(somVolta.id, e)
      continue
    }
    const volta = P()?.midias.find((m) => !S.entradas.has(m.id) && m.nome === e.nome)
    if (volta) {
      S.entradas.set(volta.id, e)
      miniatura(e)
        .then((c) => c && (S.miniaturas.set(volta.id, c), desenharMidia()))
        .catch(() => {})
      continue
    }
    try {
      const info = await lerInfo(e)
      if (info.temVideo && info.decodificaVideo === false && !info.temAudio) throw new Error('formato de vídeo que este computador não decodifica')
      const id = crypto.randomUUID()
      S.entradas.set(id, e)
      novas.push({ id, nome: e.nome, caminho: e.caminho || null, ...info })
      miniatura(e)
        .then((c) => {
          if (c) {
            S.miniaturas.set(id, c)
            desenharMidia()
          }
        })
        .catch(() => {})
    } catch (err) {
      aviso(`${e.nome}: não abre (${err.message}).`)
    }
  }
  if (!novas.length) return desenharTudo()
  if (!P()) {
    S.h = new Historico(novoProjeto({ midias: novas, preset: S.preset }))
    S.miniaturaGuardada = null
  } else if (!P().midias.length) {
    // projeto novo (vazio): fica com o formato escolhido, ganha as mídias e o nome da primeira se não tinha
    const p = P()
    const ms = novas.map((m, i) => ({ cor: corDaMidia(i), ...m, quadros: paraQuadros(m.duracao, p.fps) }))
    fazer({ ...p, nome: p.semNome ? ms[0].nome.replace(/\.[^.]+$/, '') : p.nome, semNome: undefined, midias: ms, linha: linhaInicial(ms) }, 'adicionar mídia')
  } else {
    const p = P()
    const fps = p.fps
    const ms = novas.map((m, i) => ({ cor: corDaMidia(p.midias.length + i), ...m, quadros: paraQuadros(m.duracao, fps) }))
    fazer({ ...p, midias: [...p.midias, ...ms], linha: { ...p.linha, clipes: [...p.linha.clipes, ...linhaInicial(ms).clipes] } }, 'adicionar mídia')
  }
  mudou()
  desenharTudo()
}

function desenharMidia() {
  const p = P()
  const cheia = Boolean(p?.midias.length)
  $('midiaVazia').hidden = cheia
  $('midiaCheia').hidden = !cheia
  $('universos').hidden = Boolean(p)
  if (!p) desenharUniversos()
  if (!cheia) return
  const ul = $('listaMidia')
  ul.replaceChildren(
    ...p.midias.map((m) => {
      const li = document.createElement('li')
      li.className = 'cartao-midia'
      if (m.cor) li.dataset.cor = m.cor
      const mini = S.miniaturas.get(m.id)
      const fig = document.createElement('div')
      fig.className = 'cartao-mini'
      if (mini) fig.append(mini)
      else fig.innerHTML = `<svg><use href="#i-${m.temVideo ? 'midia' : 'legenda'}"/></svg>`
      const tr = p.transcricoes[m.id]
      const fichas = [relogio(m.duracao), m.temVideo ? `${m.largura}×${m.altura}` : 'só áudio', m.fps ? `${Math.round(m.fps * 100) / 100} qps` : null, tr ? `${tr.palavras.length} palavras` : null].filter(Boolean)
      li.append(fig)
      const corpo = document.createElement('div')
      corpo.className = 'cartao-corpo'
      corpo.innerHTML = `<strong></strong><span class="fichas"></span>`
      corpo.querySelector('strong').textContent = m.nome
      corpo.querySelector('strong').title = m.caminho || m.nome
      corpo.querySelector('.fichas').append(...fichas.map((f) => Object.assign(document.createElement('span'), { className: 'ficha', textContent: f })))
      if (tr) li.classList.add('analisada')
      if (S.selecao) {
        const marcada = S.selecao.has(m.id)
        li.classList.add('selecionavel')
        li.classList.toggle('marcada', marcada)
        li.tabIndex = 0
        li.setAttribute('role', 'checkbox')
        li.setAttribute('aria-checked', String(marcada))
        li.setAttribute('aria-label', m.nome)
        li.onclick = () => marcarMidia(m.id)
        li.onkeydown = (ev) => (ev.key === ' ' || ev.key === 'Enter') && (ev.preventDefault(), marcarMidia(m.id))
        const check = document.createElement('span')
        check.className = 'check-midia'
        check.innerHTML = '<svg><use href="#i-ok"/></svg>'
        li.append(corpo, check)
        return li
      }
      const tirar = document.createElement('button')
      tirar.type = 'button'
      tirar.className = 'tirar-midia'
      tirar.title = 'Tirar do projeto (o arquivo continua no computador)'
      tirar.setAttribute('aria-label', `Tirar ${m.nome} do projeto`)
      tirar.innerHTML = '<svg><use href="#i-x"/></svg>'
      tirar.onclick = () => tirarMidia(m)
      li.append(corpo, tirar)
      return li
    }),
  )
  const falta = p.midias.some((m) => m.temAudio && !p.transcricoes[m.id])
  $('analisar').textContent = falta ? 'Analisar' : 'Analisar de novo'
  const sel = S.selecao
  for (const id of ['modelo', 'maisMidia', 'analisar']) $(id).hidden = Boolean(sel)
  $('contaSel').hidden = $('tirarSel').hidden = !sel
  $('selecionarMidia').textContent = sel ? 'Cancelar' : 'Selecionar'
  if (sel) {
    $('contaSel').textContent = sel.size ? `${sel.size} ${sel.size === 1 ? 'marcada' : 'marcadas'}` : 'Toque nas mídias'
    $('tirarSel').disabled = !sel.size
  }
}

// Tirar do projeto: só o projeto muda (o arquivo fica onde está) e o Desfazer devolve.
function tirarMidia(m) {
  fazer(removerMidia(P(), m.id), 'tirar mídia')
  aviso(`${m.nome} saiu do projeto. O arquivo continua no computador.`)
}

// Selecionar várias (como no Fotos): marca os cartões e tira todas num passo só do Desfazer.
function modoSelecao(ligado) {
  S.selecao = ligado ? new Set() : null
  desenharMidia()
}
function marcarMidia(id) {
  if (!S.selecao) return
  if (S.selecao.has(id)) S.selecao.delete(id)
  else S.selecao.add(id)
  desenharMidia()
}
$('selecionarMidia').onclick = () => modoSelecao(!S.selecao)
$('tirarSel').onclick = () => {
  const ids = [...(S.selecao || [])]
  if (!ids.length) return
  S.selecao = null
  fazer(removerMidia(P(), ids), ids.length === 1 ? 'tirar mídia' : `tirar ${ids.length} mídias`)
  aviso(`${ids.length === 1 ? 'Uma mídia saiu' : `${ids.length} mídias saíram`} do projeto. Os arquivos continuam no computador.`)
}

// modelo de transcrição: Rápido ou Preciso
for (const b of $('modelo').querySelectorAll('button')) {
  b.title = `${MODELOS[b.dataset.valor].dica} Baixa uma vez (~${MODELOS[b.dataset.valor].mb} MB).`
  b.onclick = () => {
    S.modelo = b.dataset.valor
    for (const x of $('modelo').querySelectorAll('button')) x.setAttribute('aria-checked', String(x === b))
  }
}

// ───────── SOBEDESCE ─────────

let sbd = null
$('abrirSobedesce').onclick = async () => {
  try {
    sbd = await ponte.escolherSobedesce()
  } catch (err) {
    return aviso(err.message)
  }
  if (!sbd) return
  $('sbdProjeto').textContent = `${sbd.nome} · ${sbd.cartoes.length} ${sbd.cartoes.length === 1 ? 'cartão' : 'cartões'}`
  $('sbdCartoes').replaceChildren(
    ...sbd.cartoes.map((c, i) => {
      const li = document.createElement('li')
      li.className = 'cartao-sbd'
      li.innerHTML = `<label><input type="checkbox" data-i="${i}"/><span class="sbd-nome"></span><span class="sbd-info apoio"></span><span class="selo"></span></label>`
      li.querySelector('.sbd-nome').textContent = `${c.diaria.nome} · ${c.dono.nome}${c.dono.camera ? ` · ${c.dono.camera}` : ''} · ${c.cartao.nome || `Cartão ${c.cartao.n}`}`
      li.querySelector('.sbd-info').textContent = `${c.midias.length} ${c.midias.length === 1 ? 'arquivo' : 'arquivos'}`
      const selo = li.querySelector('.selo')
      selo.textContent = c.conferido ? 'Conferido' : 'Conferir'
      selo.classList.add(c.conferido ? 'selo-ok' : 'selo-alerta')
      selo.title = c.conferido ? 'O SOBEDESCE copiou e conferiu este cartão.' : 'O SOBEDESCE avisou de arquivo faltando ou erro neste cartão.'
      return li
    }),
  )
  $('sbdUsar').disabled = true
  $('folhaSobedesce').showModal()
}
$('sbdCartoes').onchange = () => ($('sbdUsar').disabled = !$('sbdCartoes').querySelector('input:checked'))
$('sbdFechar').onclick = () => $('folhaSobedesce').close()
$('sbdUsar').onclick = async () => {
  const escolhidos = [...$('sbdCartoes').querySelectorAll('input:checked')].map((x) => sbd.cartoes[Number(x.dataset.i)])
  $('folhaSobedesce').close()
  const entradas = []
  for (const c of escolhidos) for (const m of c.midias) entradas.push(await ponte.entradaDoCaminho(m.abs, m.nome))
  await adicionar(entradas)
}

// ───────── análise: áudio → transcrição → propostas ─────────

let worker = null
const novoWorker = () => new Worker(new URL('./transcricao-worker.js', import.meta.url), { type: 'module' })

$('analisar').onclick = () => analisar()
$('cancelar').onclick = () => {
  S.analisando?.cancelar()
}

function progresso(frac, fase, detalhe = '') {
  $('analise').hidden = false
  const c = 2 * Math.PI * 52
  $('anelCheio').style.strokeDasharray = `${c}`
  $('anelCheio').style.strokeDashoffset = `${c * (1 - Math.max(0, Math.min(1, frac)))}`
  $('anelPct').textContent = `${Math.round(frac * 100)}%`
  $('fase').textContent = fase
  $('faseDetalhe').textContent = detalhe
}

/** Analisa as mídias com som. Devolve as medidas (para a demo medida). */
async function analisar({ modelo = S.modelo, dispositivo = 'auto' } = {}) {
  const p0 = P()
  if (!p0 || S.analisando) return
  const alvo = p0.midias.filter((m) => m.temAudio)
  if (!alvo.length) return aviso('Nenhuma mídia com som para analisar.')
  let cancelado = false
  S.analisando = {
    cancelar: () => {
      cancelado = true
      worker?.terminate()
      worker = null
    },
  }
  $('analisar').disabled = true
  const medidas = { inicio: performance.now(), midias: [] }
  const total = alvo.reduce((s, m) => s + m.duracao, 0)
  let feitoAntes = 0
  try {
    let p = p0
    for (const m of alvo) {
      const med = { nome: m.nome, duracao: m.duracao }
      const t0 = performance.now()
      const peso = m.duracao / total
      const { pcm, taxa, duracao } = await extrairAudio(S.entradas.get(m.id), {
        aoProgresso: (lido, tot) => progresso((feitoAntes + 0.1 * peso * (lido / tot)) / 1, 'Lendo o áudio', `${m.nome} · ${relogio(lido)} de ${relogio(tot)}`),
      })
      if (cancelado) throw new DOMException('cancelado', 'AbortError')
      med.audio = (performance.now() - t0) / 1000
      const db = envelope(pcm, taxa)
      S.dbs.set(m.id, db)
      const trechos = trechosParaTranscrever(db, duracao)
      worker ??= novoWorker()
      const t1 = performance.now()
      const r = await new Promise((res, rej) => {
        worker.onmessage = ({ data }) => {
          if (data.tipo === 'baixando') progresso(feitoAntes + 0.1 * peso, 'Baixando o modelo de transcrição', `Só na primeira vez · ${Math.round(data.feito / 1e6)} de ${Math.round(data.total / 1e6)} MB`)
          else if (data.tipo === 'dispositivo') med.dispositivo = data.dispositivo
          else if (data.tipo === 'parcial') progresso(feitoAntes + peso * (0.1 + 0.85 * (data.feito / data.total)), 'Transcrevendo', `${m.nome} · ${relogio(data.feito)} de ${relogio(data.total)} de fala${med.dispositivo === 'webgpu' ? ' · placa de vídeo' : ''}`)
          else if (data.tipo === 'pronto') res(data)
          else if (data.tipo === 'erro') rej(new Error(data.mensagem))
        }
        worker.onerror = (e) => rej(new Error(e.message || 'o worker de transcrição parou'))
        const copia = pcm.slice()
        worker.postMessage({ tipo: 'transcrever', pcm: copia, taxa, trechos, modelo, idioma: 'pt', dispositivo, remoto: ponte.remotoModelos() }, [copia.buffer])
        S.analisando.cancelar = () => {
          cancelado = true
          worker?.terminate()
          worker = null
          rej(new DOMException('cancelado', 'AbortError'))
        }
      })
      med.transcricao = (performance.now() - t1) / 1000
      med.carregarModelo = r.carregou
      med.palavras = r.palavras.length
      med.dispositivo = r.dispositivo
      progresso(feitoAntes + peso * 0.97, 'Propondo cortes e zoom', m.nome)
      const t2 = performance.now()
      p = comTranscricao(p, m.id, { modelo: MODELOS[modelo].id, idioma: 'pt', palavras: r.palavras, criada: new Date().toISOString() })
      const cortes = proporCortes({ midia: m.id, db, palavras: r.palavras, preset: S.preset.cortes, duracao })
      const zooms = m.temVideo ? proporZooms({ midia: m.id, palavras: r.palavras, preset: S.preset.zoom }) : []
      p = comPropostas(p, [...cortes, ...zooms], ['silencio', 'respiro', 'zoom'])
      med.propostas = (performance.now() - t2) / 1000
      med.cortes = cortes.length
      med.zooms = zooms.length
      medidas.midias.push(med)
      feitoAntes += peso
    }
    fazer(p, 'análise')
    medidas.total = (performance.now() - medidas.inicio) / 1000
    const r = resumo(P().propostas)
    aviso(`${r.cortes} cortes e ${r.zooms} zooms propostos em ${relogio(medidas.total)}.`)
    S.ultimaAnalise = medidas
    ir('revisar')
    return medidas
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error(err)
      aviso(`A análise parou: ${err.message}`)
    } else aviso('Análise cancelada.')
    return null
  } finally {
    S.analisando = null
    $('analisar').disabled = false
    $('analise').hidden = true
  }
}
S.analisar = analisar
S.adicionar = adicionar
S.aprovarTodos = () => $('aprovarTodos').click()
S.blocos = () => blocosDaLegenda(P())

// ───────── revisar ─────────

const NOMES = { silencio: 'Silêncio', respiro: 'Respiro', zoom: 'Zoom' }

function visiveis(p) {
  return p.propostas.filter((x) => (S.filtro === 'tudo' ? true : S.filtro === 'zoom' ? x.tipo === 'zoom' : x.tipo !== 'zoom'))
}

function desenharPropostas() {
  const p = P()
  const r = resumo(p.propostas)
  const n = numeros(p)
  $('resumoNum').textContent = r.cortes || r.zooms ? `−${relogio(r.tempoPendente + r.tempoAprovado)}` : relogio(n.final)
  $('resumoTexto').textContent = p.propostas.length ? `${r.pendentes} para revisar` : 'Analise a mídia para ver as propostas.'
  // quantas de cada tipo, com a cor do tipo (a mesma do ícone na lista)
  const PLURAL = { silencio: 'silêncios', respiro: 'respiros', zoom: 'zooms' }
  $('legendaCores').replaceChildren(
    ...Object.keys(PLURAL).flatMap((t) => {
      const n = p.propostas.filter((x) => x.tipo === t).length
      if (!n) return []
      const sp = document.createElement('span')
      sp.textContent = `${n} ${PLURAL[t]}`
      sp.dataset.cor = COR_PROPOSTA[t]
      return [sp]
    }),
  )
  $('aprovarTodos').disabled = !r.pendentes
  const ol = $('propostas')
  const lista = visiveis(p)
  ol.replaceChildren(
    ...lista.map((x) => {
      const li = document.createElement('li')
      li.className = `proposta proposta-${x.estado}`
      li.dataset.id = x.id
      li.dataset.cor = COR_PROPOSTA[x.tipo]
      li.tabIndex = -1
      li.toggleAttribute('aria-selected', x.id === S.selProposta)
      const m = midiaPorId(p, x.midia)
      li.innerHTML = `<svg class="proposta-icone"><use href="#i-${x.tipo === 'zoom' ? 'zoom' : 'corte'}"/></svg><span class="proposta-texto"><strong></strong><span class="apoio"></span></span><span class="proposta-acoes"><button class="icone-btn" data-acao="aprovar" title="Aprovar (A)" aria-label="Aprovar"><svg><use href="#i-ok"/></svg></button><button class="icone-btn" data-acao="recusar" title="Recusar (R)" aria-label="Recusar"><svg><use href="#i-x"/></svg></button></span>`
      li.querySelector('strong').textContent = `${NOMES[x.tipo]} · ${relogio(x.ini)}${x.tipo === 'zoom' ? ` · ${Math.round(x.escala * 100)}%` : ` · ${(x.fim - x.ini).toFixed(1).replace('.', ',')} s`}`
      li.querySelector('.apoio').textContent = p.midias.length > 1 ? `${x.motivo} · ${m?.nome}` : x.motivo
      return li
    }),
  )
}

$('filtros').onclick = (e) => {
  const b = e.target.closest('button')
  if (!b) return
  S.filtro = b.dataset.filtro
  for (const x of $('filtros').querySelectorAll('button')) x.setAttribute('aria-selected', String(x === b))
  desenharPropostas()
}

$('propostas').onclick = (e) => {
  const li = e.target.closest('.proposta')
  if (!li) return
  const acao = e.target.closest('[data-acao]')?.dataset.acao
  if (acao) return decidir(li.dataset.id, acao)
  selecionarProposta(li.dataset.id, true)
}

/** Seleciona e toca o trecho: um pouco antes e depois, para ouvir o corte no contexto. */
function selecionarProposta(id, tocar) {
  const p = P()
  const x = p.propostas.find((y) => y.id === id)
  if (!x) return
  S.selProposta = id
  for (const li of $('propostas').children) li.toggleAttribute('aria-selected', li.dataset.id === id)
  $('propostas').querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  if (!tocar) return
  // posição na linha: a do começo do trecho (ou a do ponto logo depois, se o corte já saiu)
  let q = null
  for (let k = paraQuadros(Math.max(0, x.ini - 1.5), p.fps); q === null && k < paraQuadros(x.fim + 3, p.fps); k += 2) q = linhaDe(p, x.midia, k)
  if (q === null) return
  const ini = paraSegundos(q, p.fps)
  player.tocarTrecho(ini, ini + (x.estado === 'aprovada' && x.tipo !== 'zoom' ? 3 : x.fim - Math.max(0, x.ini - 1.5) + 1.5))
}

function linhaDe(p, midia, qFonte) {
  let t = 0
  for (const c of p.linha.clipes) {
    if (c.midia === midia && qFonte >= c.ini && qFonte < c.fim) return t + qFonte - c.ini
    t += c.fim - c.ini
  }
  return null
}

function decidir(id, acao) {
  const p = P()
  const x = p.propostas.find((y) => y.id === id)
  if (!x) return
  const novo = acao === 'aprovar' ? aprovar(p, id) : recusar(p, id)
  fazer(novo, `${acao === 'aprovar' ? 'aprovar' : 'recusar'} ${NOMES[x.tipo].toLowerCase()}`)
  // segue para a próxima pendente
  const prox = visiveis(P()).find((y) => y.estado === 'pendente' && y.ini >= x.ini && y.id !== id) || visiveis(P()).find((y) => y.estado === 'pendente')
  if (prox) selecionarProposta(prox.id, false)
}

$('aprovarTodos').onclick = () => {
  const p = P()
  const ids = visiveis(p)
    .filter((x) => x.estado === 'pendente')
    .map((x) => x.id)
  if (!ids.length) return
  const antes = numeros(p).final
  fazer(aprovar(p, ids), `aprovar ${ids.length}`)
  aviso(`${ids.length} aprovados · o vídeo ficou ${relogio(antes - numeros(P()).final)} mais curto.`)
}
$('irEdicao').onclick = () => ir('edicao')

// ───────── edição ─────────

function acaoLinha(tipo, ...a) {
  const p = P()
  if (!p) return
  if (tipo === 'dividir') {
    const q = paraQuadros(player.t, p.fps)
    const novo = { ...p, linha: dividir(p.linha, q) }
    if (novo.linha === p.linha) return aviso('Já tem um corte aqui.')
    fazer(novo, 'dividir')
  } else if (tipo === 'marcar') {
    // M marca o ponto; M de novo em cima de um marcador abre o nome dele (como no Premiere)
    const r = marcar(p, paraQuadros(player.t, p.fps))
    if (r.projeto === p) {
      aba('marcadores')
      return marcadoresUI.editar(r.id)
    }
    fazer(r.projeto, 'marcador')
    marcadoresUI.escolher(r.id, { ir: false })
  } else if (tipo === 'escolherMarcador') {
    aba('marcadores')
    marcadoresUI.escolher(a[0])
  } else if (tipo === 'desmarcar') fazer(removerMarcador(p, a[0]), 'apagar marcador')
  else if (tipo === 'remover') fazer({ ...p, linha: remover(p.linha, a[0]) }, 'apagar clipe')
  else if (tipo === 'som') $('arquivoSom').click()
  else if (tipo === 'moverEfeito') fazer(moverEfeito(p, a[0], paraQuadros(a[1], p.fps)), 'mover efeito')
  else if (tipo === 'tirarEfeito') fazer(removerEfeitos(p, a[0]), 'tirar efeito')
  else if (tipo === 'mover') fazer({ ...p, linha: mover(p.linha, a[0], a[1]) }, 'mover clipe')
  else if (tipo === 'etiquetar') fazer({ ...p, linha: etiquetar(p.linha, a[0], a[1]) }, a[1].cor !== undefined ? 'cor do clipe' : 'etiqueta')
  else if (tipo === 'aparar') {
    const c = p.linha.clipes.find((x) => x.id === a[0])
    const m = c && midiaPorId(p, c.midia)
    fazer({ ...p, linha: aparar(p.linha, a[0], a[1], a[2], m?.quadros) }, 'aparar')
  }
}

// efeito sonoro do computador: entra no projeto e vai para o ponto (vários: um depois do outro)
$('arquivoSom').onchange = async () => {
  const fs = [...$('arquivoSom').files]
  $('arquivoSom').value = ''
  let p = P()
  if (!p || !fs.length) return
  let q = paraQuadros(player.t, p.fps)
  let ultimo = null
  for (const f of fs) {
    const e = await ponte.entradaDe(f)
    try {
      const info = await lerInfo(e)
      if (!info.temAudio || info.decodificaAudio === false) throw new Error('sem som que este computador toque')
      const r = adicionarSom(p, { id: crypto.randomUUID(), nome: e.nome, caminho: e.caminho || null, duracao: info.duracao, taxa: info.taxa, canais: info.canais, origem: { tipo: 'arquivo' } })
      S.entradas.set(r.id, e)
      const c = colocarEfeito(r.projeto, r.id, q)
      p = c.projeto
      ultimo = c.id || ultimo
      q += paraQuadros(info.duracao, p.fps)
    } catch (err) {
      aviso(`${e.nome}: ${err.message}.`)
    }
  }
  if (p === P()) return
  fazer(p, fs.length > 1 ? 'efeitos sonoros' : 'efeito sonoro')
  if (ultimo) linha.selecionarEfeito(ultimo)
}

$('legendaLigada').onchange = () => fazer({ ...P(), legenda: { ...P().legenda, ligada: $('legendaLigada').checked } }, $('legendaLigada').checked ? 'mostrar legenda' : 'esconder legenda')
$('estiloLegenda').onchange = () => fazer({ ...P(), legenda: { ...P().legenda, estilo: $('estiloLegenda').value } }, 'estilo da legenda')

/** O texto falado: clicar vai até a palavra; dois cliques corrigem (vale para a legenda e o SRT). */
function desenharTexto() {
  const p = P()
  const caixa = $('texto')
  const ws = palavrasNaLinha(p)
  if (!ws.length) {
    caixa.innerHTML = '<p class="apoio">A transcrição aparece aqui depois da análise.</p>'
    return
  }
  caixa.replaceChildren(
    ...ws.map((w) => {
      const s = document.createElement('span')
      s.className = 'palavra'
      s.textContent = w.texto + ' '
      s.dataset.ini = w.ini
      s.dataset.fim = w.fim
      s.dataset.midia = w.midia
      s.dataset.i = w.i
      return s
    }),
  )
  S.palavraAtual = null
}

function marcarPalavra() {
  if (S.pagina !== 'edicao') return
  const t = player.t
  const caixa = $('texto')
  const atual = S.palavraAtual
  if (atual && t >= Number(atual.dataset.ini) && t < Number(atual.dataset.fim)) return
  atual?.classList.remove('agora')
  let achada = null
  for (const s of caixa.children) {
    if (Number(s.dataset.ini) > t) break
    if (t < Number(s.dataset.fim)) achada = s
  }
  S.palavraAtual = achada
  if (achada) {
    achada.classList.add('agora')
    if (player.tocando) achada.scrollIntoView({ block: 'nearest' })
  }
}

$('texto').onclick = (e) => {
  const s = e.target.closest('.palavra')
  if (s) player.irPara(Number(s.dataset.ini))
}
$('texto').ondblclick = (e) => {
  const s = e.target.closest('.palavra')
  if (!s || s.isContentEditable) return
  s.contentEditable = 'plaintext-only'
  s.textContent = s.textContent.trim()
  s.focus()
  getSelection().selectAllChildren(s)
  const fim = (gravar) => {
    s.contentEditable = 'false'
    s.onblur = s.onkeydown = null
    const p = P()
    const original = p.transcricoes[s.dataset.midia]?.palavras[Number(s.dataset.i)]?.texto
    if (gravar) fazer(editarPalavra(p, s.dataset.midia, Number(s.dataset.i), s.textContent), 'corrigir palavra')
    else s.textContent = textoDa(p, s.dataset.midia, Number(s.dataset.i), original) + ' '
    desenharTexto()
  }
  s.onblur = () => fim(true)
  s.onkeydown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault()
      s.blur()
    } else if (ev.key === 'Escape') fim(false)
  }
}

// ───────── painel: abas, Inspector e Histórico ─────────

$('abasPainel').onclick = (e) => {
  const b = e.target.closest('[data-aba]')
  if (b) aba(b.dataset.aba)
}
function aba(nome) {
  for (const b of $('abasPainel').children) b.setAttribute('aria-selected', String(b.dataset.aba === nome))
  for (const sec of document.querySelectorAll('.painel-lateral .aba')) sec.hidden = sec.dataset.aba !== nome
  // o banco no Drive só é lido quando a pessoa abre a aba Sons
  if (nome === 'sons' && S.sons.fonte === 'banco' && S.sons.banco && S.sons.estado === 'vazio') listarPasta()
}

// controles do Inspector: valor na tela ↔ valor no clipe
const CONTROLES = [
  { k: 'volume', nome: 'Volume', min: -60, max: 12, passo: 0.5, tela: (v) => v, clipe: (v) => v, rotulo: (v) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')} dB` },
  { k: 'opacidade', nome: 'Opacidade', min: 0, max: 100, passo: 1, tela: (v) => Math.round(v * 100), clipe: (v) => v / 100, rotulo: (v) => `${v}%` },
  { k: 'escala', nome: 'Escala', min: 10, max: 300, passo: 1, tela: (v) => Math.round(v * 100), clipe: (v) => v / 100, rotulo: (v) => `${v}%` },
  { k: 'x', nome: 'Posição X', min: -100, max: 100, passo: 1, tela: (v) => Math.round(v * 100), clipe: (v) => v / 100, rotulo: (v) => `${v}` },
  { k: 'y', nome: 'Posição Y', min: -100, max: 100, passo: 1, tela: (v) => Math.round(v * 100), clipe: (v) => v / 100, rotulo: (v) => `${v}` },
]

function montarInspector() {
  const sec = $('inspector')
  sec.innerHTML = `<div class="insp-vazio"><svg><use href="#i-edicao"/></svg><span class="apoio">Escolha um clipe na linha.</span><dl class="insp-projeto"></dl></div><div class="insp-clipe" hidden><div class="insp-cabeca"><span class="insp-cor"></span><span class="insp-nome"><strong></strong><span class="apoio"></span></span></div><div class="insp-controles"></div><button class="link" id="inspRedefinir">Redefinir</button></div><div class="insp-efeito" hidden><div class="insp-cabeca"><svg class="insp-icone"><use href="#i-som"/></svg><span class="insp-nome"><strong></strong><span class="apoio"></span></span></div><label class="insp-controle"><span class="insp-rotulo">Volume</span><output></output><input type="range" class="deslizar" id="fxVolume" min="-60" max="12" step="0.5" aria-label="Volume do efeito" /></label><button class="link" id="fxTirar">Tirar efeito</button></div>`
  const rotuloDb = (v) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')} dB`
  // volume do efeito: arrastar ouve ao vivo, soltar grava uma ação só, dois cliques volta a 0 dB
  $('fxVolume').oninput = () => {
    const p = P()
    $('fxVolume').previousElementSibling.textContent = rotuloDb(Number($('fxVolume').value))
    if (p && linha.selFx) player.carregar(ajustarEfeito(p, linha.selFx, { volume: Number($('fxVolume').value) }), opcoesPlayer(p))
  }
  $('fxVolume').onchange = () => {
    const p = P()
    if (p && linha.selFx) fazer(ajustarEfeito(p, linha.selFx, { volume: Number($('fxVolume').value) }), 'volume do efeito')
  }
  $('fxVolume').ondblclick = () => {
    const p = P()
    if (p && linha.selFx) fazer(ajustarEfeito(p, linha.selFx, { volume: 0 }), 'volume do efeito')
  }
  $('fxTirar').onclick = () => linha.selFx && acaoLinha('tirarEfeito', linha.selFx)
  const caixa = sec.querySelector('.insp-controles')
  for (const c of CONTROLES) {
    const l = document.createElement('label')
    l.className = 'insp-controle'
    l.innerHTML = `<span class="insp-rotulo"></span><output></output><input type="range" class="deslizar" />`
    l.querySelector('.insp-rotulo').textContent = c.nome
    const i = l.querySelector('input')
    Object.assign(i, { min: c.min, max: c.max, step: c.passo, ariaLabel: c.nome })
    i.dataset.k = c.k
    // arrastar: prévia ao vivo (sem entrar no desfazer); soltar: grava uma ação só
    i.oninput = () => {
      l.querySelector('output').textContent = c.rotulo(Number(i.value))
      const p = P()
      if (p && linha.sel) player.carregar({ ...p, linha: ajustar(p.linha, linha.sel, { [c.k]: c.clipe(Number(i.value)) }) }, opcoesPlayer(p))
    }
    i.onchange = () => {
      const p = P()
      if (p && linha.sel) fazer({ ...p, linha: ajustar(p.linha, linha.sel, { [c.k]: c.clipe(Number(i.value)) }) }, c.nome.toLowerCase())
    }
    i.ondblclick = () => {
      const p = P()
      if (p && linha.sel) fazer({ ...p, linha: ajustar(p.linha, linha.sel, { [c.k]: AJUSTES_PADRAO[c.k] }) }, c.nome.toLowerCase())
    }
    caixa.append(l)
  }
  $('inspRedefinir').onclick = () => {
    const p = P()
    if (p && linha.sel) fazer({ ...p, linha: ajustar(p.linha, linha.sel, AJUSTES_PADRAO) }, 'redefinir ajustes')
  }
  // velocidade (speed ramp): a curva do clipe, ao vivo na prévia e uma ação no desfazer ao soltar
  velUI = montarVelocidade(sec.querySelector('.insp-clipe'), {
    obter: () => {
      const p = P()
      return { p, clipe: p && linha.sel ? p.linha.clipes.find((x) => x.id === linha.sel) : null }
    },
    previa: (pontos) => {
      const p = P()
      if (p && linha.sel) player.carregar({ ...p, linha: acelerar(p.linha, linha.sel, pontos) }, opcoesPlayer(p))
    },
    gravar: (pontos, rotulo, todos = false) => {
      const p = P()
      if (!p || (!linha.sel && !todos)) return
      fazer({ ...p, linha: acelerar(p.linha, todos ? p.linha.clipes.map((c) => c.id) : linha.sel, pontos) }, rotulo)
    },
    modo: (m) => {
      const p = P()
      if (!p || !linha.sel) return
      const novo = retempo(p.linha, linha.sel, m)
      if (novo !== p.linha) fazer({ ...p, linha: novo }, `câmera lenta · ${{ fluxo: 'fluxo óptico', mistura: 'mistura', quadro: 'quadro' }[m]}`)
    },
    fps: () => (P() ? P().fps.n / P().fps.d : 30),
  })
  $('inspRedefinir').before(velUI.el)
  // estabilizar: a primeira vez analisa a mídia (worker, quadros contados); a análise fica na mídia do projeto
  const selecionado = () => {
    const p = P()
    const clipe = p && linha.sel ? p.linha.clipes.find((x) => x.id === linha.sel) : null
    return { p, clipe, midia: clipe ? midiaPorId(p, clipe.midia) : null }
  }
  estUI = montarEstabilizar(sec.querySelector('.insp-clipe'), {
    obter: selecionado,
    ligar: async (aoAndar) => {
      const { clipe, midia } = selecionado()
      if (!clipe) return
      let est = null
      if (!analiseDe(midia)) {
        const entrada = S.entradas.get(midia.id)
        if (!entrada) return aviso('Escolha o arquivo desta mídia de novo para analisar.')
        try {
          est = await analisarMidia(entrada, aoAndar)
        } catch (err) {
          return aviso(`A análise parou: ${err.message}`)
        }
      }
      const p = P()
      const midias = est ? p.midias.map((m) => (m.id === midia.id ? { ...m, estabilidade: est } : m)) : p.midias
      fazer({ ...p, midias, linha: estabilizar(p.linha, clipe.id, clipe.estabilizar || ESTAB_PADRAO) }, 'estabilizar')
    },
    desligar: () => {
      const p = P()
      if (p && linha.sel) fazer({ ...p, linha: estabilizar(p.linha, linha.sel, null) }, 'tirar estabilização')
    },
    ajustar: (aj, gravar) => {
      const p = P()
      if (!p || !linha.sel) return
      const novo = { ...p, linha: estabilizar(p.linha, linha.sel, aj) }
      if (gravar) fazer(novo, 'ajustar estabilização')
      else player.carregar(novo, opcoesPlayer(novo))
    },
  })
  $('inspRedefinir').before(estUI.el)
  // voz e instrumental pela NOSSOM (src/faixas.js, app/nossom.js)
  faiUI = montarFaixas(sec.querySelector('.insp-clipe'), {
    obter: () => {
      const { p, clipe, midia } = selecionado()
      let faltam = false
      let trecho = null
      if (clipe?.faixas) faltam = faixasForaDoTrecho(p, clipe) ? 'trecho' : S.faixasFaltando.has(clipe.faixas.sep) ? 'disco' : false
      else if (clipe) {
        const t = trechoParaSeparar(p, clipe)
        trecho = t.erro ? t : { minutos: minutosDoPedido(t.fim - t.ini) }
      }
      return { p, clipe, midia, liberado: S.nossom, andamento: S.separando && S.separando.clipe === clipe?.id ? S.separando : null, faltam, trecho }
    },
    separar: () => separarClipe(),
    cancelar: () => S.separando?.ctrl.abort(),
    ajustar: (mix, gravar) => {
      const p = P()
      if (!p || !linha.sel) return
      const novo = { ...p, linha: ajustarFaixas(p.linha, linha.sel, mix) }
      if (novo.linha === p.linha) return
      if (gravar) fazer(novo, 'voz e instrumental')
      else player.carregar(novo, opcoesPlayer(novo))
    },
    desligar: () => {
      const p = P()
      if (p && linha.sel) fazer({ ...p, linha: desligarFaixas(p.linha, linha.sel) }, 'som original')
    },
  })
  // de som: logo depois dos controles (perto do Volume), um clique sem rolar
  sec.querySelector('.insp-controles').after(faiUI.el)
}
let velUI = null
let estUI = null
let faiUI = null
montarInspector()

function desenharInspector() {
  const p = P()
  const sec = $('inspector')
  const c = p && linha.sel ? p.linha.clipes.find((x) => x.id === linha.sel) : null
  const fx = p && linha.selFx ? (p.efeitos || []).find((x) => x.id === linha.selFx) : null
  sec.querySelector('.insp-vazio').hidden = Boolean(c || fx)
  sec.querySelector('.insp-clipe').hidden = !c
  sec.querySelector('.insp-efeito').hidden = !fx
  if (fx) {
    const som = somPorId(p, fx.som)
    const o = som?.origem || {}
    sec.querySelector('.insp-efeito strong').textContent = som?.nome.replace(/\.[^.]+$/, '') || 'Efeito'
    // de onde veio: do computador (licença da pessoa) ou de um banco (autor e licença para os créditos)
    sec.querySelector('.insp-efeito .apoio').textContent = o.tipo === 'arquivo' ? 'Do seu computador' : o.tipo === 'banco' ? 'Do seu banco no Drive' : [o.autor, o.licenca].filter(Boolean).join(' · ') || 'Banco de sons'
    const i = $('fxVolume')
    if (document.activeElement !== i) i.value = String(fx.volume || 0)
    i.previousElementSibling.textContent = `${fx.volume > 0 ? '+' : ''}${String(fx.volume || 0).replace('.', ',')} dB`
    i.closest('label').classList.toggle('mudado', Boolean(fx.volume))
    return
  }
  if (!c) {
    const dl = sec.querySelector('.insp-projeto')
    dl.replaceChildren()
    if (!p) return
    const n = numeros(p)
    for (const [k, v] of [
      ['Formato', `${p.largura}×${p.altura}`],
      ['Quadros', `${String(Math.round((p.fps.n / p.fps.d) * 1000) / 1000).replace('.', ',')} por segundo`],
      ['Duração', relogio(n.final)],
      ['Clipes', String(p.linha.clipes.length)],
      ['Marcadores', String((p.marcadores || []).length)],
      ['Efeitos', `${(p.efeitos || []).length - foraDaLinha(p).length}${foraDaLinha(p).length ? ` (+${foraDaLinha(p).length} em trecho cortado)` : ''}`],
    ])
      dl.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }))
    return
  }
  const m = midiaPorId(p, c.midia)
  const cor = c.cor || m?.cor
  const bola = sec.querySelector('.insp-cor')
  if (cor) bola.dataset.cor = cor
  else delete bola.dataset.cor
  sec.querySelector('.insp-nome strong').textContent = c.etiqueta || m?.nome || 'Clipe'
  sec.querySelector('.insp-nome .apoio').textContent = `${relogio(paraSegundos(c.ini, p.fps))}–${relogio(paraSegundos(c.fim, p.fps))}${c.etiqueta ? ` · ${m?.nome}` : ''}`
  const aj = ajustesDe(c)
  for (const ctl of CONTROLES) {
    const i = sec.querySelector(`input[data-k="${ctl.k}"]`)
    const semVideo = ctl.k !== 'volume' && !m?.temVideo
    i.closest('label').hidden = semVideo || (ctl.k === 'volume' && !m?.temAudio)
    if (document.activeElement !== i) i.value = String(ctl.tela(aj[ctl.k]))
    i.closest('label').querySelector('output').textContent = ctl.rotulo(Number(i.value))
    i.closest('label').classList.toggle('mudado', aj[ctl.k] !== AJUSTES_PADRAO[ctl.k])
  }
  $('inspRedefinir').hidden = !c.ajustes
  velUI.desenhar(c)
  estUI.desenhar()
  faiUI.desenhar()
}

/** Histórico: cada ação com nome; clicar volta (ou avança) até aquele ponto. */
function desenharHistorico() {
  const ol = $('historico')
  const h = S.h
  if (!h) return ol.replaceChildren()
  const itens = [{ rotulo: 'Projeto aberto' }, ...h.passado.map((x) => ({ rotulo: x.rotulo })), ...[...h.futuro].reverse().map((x) => ({ rotulo: x.rotulo, futuro: true }))]
  const atual = h.passado.length
  ol.replaceChildren(
    ...itens.map((x, k) => {
      const li = document.createElement('li')
      const b = Object.assign(document.createElement('button'), { textContent: x.rotulo ? x.rotulo[0].toUpperCase() + x.rotulo.slice(1) : 'Ação' })
      if (k === atual) b.setAttribute('aria-current', 'step')
      if (x.futuro) b.classList.add('futuro')
      b.onclick = () => irNoHistorico(k)
      li.append(b)
      return li
    }),
  )
  ol.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' })
}
function irNoHistorico(k) {
  const h = S.h
  if (!h || k === h.passado.length) return
  while (h.passado.length > k && h.desfazer() != null);
  while (h.passado.length < k && h.refazer() != null);
  mudou()
  desenharTudo()
}

// ───────── teclado ─────────

addEventListener('keydown', (e) => {
  const digitando = e.target.closest?.('input, select, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 'z') {
    if (digitando) return
    e.preventDefault()
    return e.shiftKey ? refazer() : desfazer()
  }
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault()
    return salvarAgora()
  }
  if (mod && e.key.toLowerCase() === 'o') {
    e.preventDefault()
    return $('arquivoProjeto').click()
  }
  if (S.selecao && S.pagina === 'midia' && !digitando) {
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      S.selecao = new Set(P().midias.map((m) => m.id))
      return desenharMidia()
    }
    if (e.key === 'Escape') return modoSelecao(false)
    if ((e.key === 'Backspace' || e.key === 'Delete') && S.selecao.size) return $('tirarSel').click()
  }
  // ⌘1–⌘4: as etapas do editor; a Z não tem número (fica no ícone da barra)
  if (mod && /^[1-4]$/.test(e.key)) {
    e.preventDefault()
    return ir(PAGINAS[Number(e.key) - 1])
  }
  if (digitando || mod || !P()) return
  if (e.key === ' ' && (S.pagina === 'revisar' || S.pagina === 'edicao')) {
    e.preventDefault()
    player.alternar()
  } else if (S.pagina === 'edicao') {
    const passo = e.shiftKey ? 1 : 1 / player.fps
    if (e.key === 'ArrowRight') player.irPara(player.t + passo)
    else if (e.key === 'ArrowLeft') player.irPara(player.t - passo)
    else if (e.key.toLowerCase() === 'b') acaoLinha('dividir')
    else if (e.key.toLowerCase() === 'm') acaoLinha('marcar')
    else if (e.key.toLowerCase() === 's') acaoLinha('som')
    else if ((e.key === 'Backspace' || e.key === 'Delete') && linha.selFx) acaoLinha('tirarEfeito', linha.selFx)
    else if ((e.key === 'Backspace' || e.key === 'Delete') && linha.sel) acaoLinha('remover', linha.sel)
    else return
    e.preventDefault()
  } else if (S.pagina === 'revisar') {
    const lista = visiveis(P())
    const i = lista.findIndex((x) => x.id === S.selProposta)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const prox = lista[Math.max(0, Math.min(lista.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (prox) selecionarProposta(prox.id, true)
    } else if (e.key.toLowerCase() === 'a' && S.selProposta) decidir(S.selProposta, 'aprovar')
    else if (e.key.toLowerCase() === 'r' && S.selProposta) decidir(S.selProposta, 'recusar')
    else return
    e.preventDefault()
  }
})

// ───────── Sonoplasta: momentos, busca nos sons livres ou no banco da pessoa no Drive (pela Absolute ZRO), ouvir e colocar ─────────

function lerGuardado(chave) {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}
function guardar(chave, valor) {
  try {
    if (valor == null) localStorage.removeItem(chave)
    else localStorage.setItem(chave, valor)
  } catch {
    // navegador sem armazenamento: vale só nesta aba
  }
}
/** O banco guardado ({ id, nome }) → estado da navegação: a raiz, o caminho até a pasta aberta e as subpastas dela. */
function bancoDe(texto) {
  try {
    const b = JSON.parse(texto || 'null')
    if (!b || pastaDoLink(b.id) !== b.id) return null
    const raiz = { id: b.id, nome: String(b.nome || 'Meu banco').slice(0, 120) }
    return { raiz, caminho: [raiz], pastas: [], conta: typeof b.conta === 'string' ? b.conta : null }
  } catch {
    return null
  }
}
const guardarBanco = (b) => guardar('aeon.sons.banco', b ? JSON.stringify({ id: b.raiz.id, nome: b.raiz.nome, conta: b.conta }) : null)

function el(tag, cls, props = {}) {
  return Object.assign(document.createElement(tag), cls ? { className: cls } : {}, props)
}
function segundosLegiveis(s) {
  return s == null ? '' : s < 10 ? `${String(Math.round(s * 10) / 10).replace('.', ',')} s` : relogio(s)
}

/** O seletor Livres | Meu banco, o link da pasta, o caminho até a pasta aberta e as subpastas dela. */
function desenharFonte() {
  const banco = S.sons.fonte === 'banco'
  const b = S.sons.banco
  for (const x of $('sonsFonte').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.fonte === S.sons.fonte))
  $('sonsBancoForm').hidden = !banco || Boolean(b)
  $('sonsBusca').hidden = banco && !b
  $('sonsSugestoes').hidden = banco
  $('sonsPasta').hidden = !banco || !b
  $('sonsPastas').hidden = !banco || !b?.pastas.length
  $('sonsTermo').placeholder = banco ? 'Buscar nesta pasta' : 'whoosh, impacto, clique…'
  const r = $('sonsRodape')
  r.textContent = banco ? 'Da sua pasta no Drive, pelo SOBEDESCE. A licença é sua.' : 'Sons livres para uso comercial, com crédito.'
  r.title = banco
    ? 'Os sons descem da sua pasta no Google Drive pela conexão do SOBEDESCE. Nada é movido nem apagado no Drive.'
    : 'Openverse: Freesound e Wikimedia, só CC0, CC BY e domínio público. O crédito de cada som sai no CREDITOS.txt da entrega.'
  if (!banco || !b) return
  const itens = []
  b.caminho.forEach((pasta, i) => {
    if (i) itens.push(el('span', 'sep', { textContent: '›', ariaHidden: 'true' }))
    const x = el('button', '', { type: 'button', textContent: pasta.nome })
    if (i === b.caminho.length - 1) x.setAttribute('aria-current', 'true')
    x.onclick = () => {
      S.sons.banco = { ...b, caminho: b.caminho.slice(0, i + 1), pastas: [] }
      $('sonsTermo').value = ''
      listarPasta()
    }
    itens.push(x)
  })
  const trocar = el('button', 'sons-trocar', { type: 'button', textContent: 'Trocar', title: 'Usar outra pasta do Drive' })
  trocar.onclick = () => {
    S.sons = { ...S.sons, banco: null, resultados: [], estado: 'vazio', erro: null }
    guardarBanco(null)
    desenharFonte()
    desenharResultados()
    $('sonsBancoLink').focus()
  }
  $('sonsPasta').replaceChildren(...itens, trocar)
  $('sonsPastas').replaceChildren(
    ...b.pastas.map((pasta) => {
      const x = el('button', '', { type: 'button', textContent: pasta.nome, title: `Abrir ${pasta.nome}` })
      x.onclick = () => {
        S.sons.banco = { ...S.sons.banco, caminho: [...S.sons.banco.caminho, pasta], pastas: [] }
        $('sonsTermo').value = ''
        listarPasta()
      }
      return x
    }),
  )
}

$('sonsFonte').onclick = (e) => {
  const fonte = e.target.closest('[data-fonte]')?.dataset.fonte
  if (!fonte || fonte === S.sons.fonte) return
  S.sons = { ...S.sons, fonte, resultados: [], estado: 'vazio', erro: null }
  guardar('aeon.sons.fonte', fonte)
  desenharFonte()
  desenharResultados()
  if (fonte === 'banco' && S.sons.banco) listarPasta()
  else if (fonte === 'livres' && $('sonsTermo').value.trim()) buscarSons($('sonsTermo').value)
}

$('sonsBancoForm').onsubmit = (e) => {
  e.preventDefault()
  const id = pastaDoLink($('sonsBancoLink').value)
  if (!id) return aviso('Cole o link de uma pasta do Google Drive.')
  const raiz = { id, nome: 'Meu banco' }
  S.sons.banco = { raiz, caminho: [raiz], pastas: [], conta: null }
  $('sonsBancoLink').value = ''
  $('sonsTermo').value = ''
  guardarBanco(S.sons.banco)
  listarPasta()
}

/** Lista a pasta aberta do banco (com `q`, só o que tem o termo no nome). O pedido mais novo ganha. */
async function listarPasta(q = '') {
  const b = S.sons.banco
  if (!b) return
  const pasta = b.caminho.at(-1)
  const pedido = ++S.sons.pedido
  S.sons = { ...S.sons, estado: 'buscando', erro: null }
  desenharFonte()
  desenharResultados()
  try {
    const r = await bancoSons.listarBanco(pasta.id, { q, conta: b.conta || '' })
    if (pedido !== S.sons.pedido || S.sons.banco?.raiz.id !== b.raiz.id) return
    const nome = r.pasta?.nome || pasta.nome
    const caminho = b.caminho.map((x, i) => (i === b.caminho.length - 1 ? { ...x, nome } : x))
    S.sons.banco = { ...b, caminho, raiz: caminho[0], pastas: q ? b.pastas : r.pastas || [], conta: r.conta || b.conta }
    if (b.caminho.length === 1) guardarBanco(S.sons.banco)
    S.sons = { ...S.sons, resultados: r.sons, estado: r.sons.length ? 'pronto' : 'nada', consulta: q }
  } catch (err) {
    if (pedido !== S.sons.pedido) return
    S.sons = { ...S.sons, resultados: [], estado: 'erro', erro: err }
  }
  desenharFonte()
  desenharResultados()
}

function tamanhoLegivel(bytes) {
  if (!bytes) return ''
  return bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${String(Math.round(bytes / 1e5) / 10).replace('.', ',')} MB`
}

function desenharSons() {
  const p = P()
  desenharFonte()
  if (!p) return
  const ms = momentos(p)
  if (S.sons.alvo && !ms.some((m) => m.q === S.sons.alvo.q)) S.sons.alvo = null
  // os momentos da linha (cortes e marcadores): tocar leva até lá e busca o som que combina
  $('sonsMomentos').replaceChildren(
    ...ms.map((m) => {
      const b = el('button', 'sons-momento', { type: 'button', title: sugestaoDoMomento(m, S.sonoplasta)?.porque || '' })
      b.dataset.tipo = m.tipo
      b.append(el('span', '', { textContent: m.nome }), el('span', 'apoio', { textContent: relogio(paraSegundos(m.q, p.fps)) }))
      b.setAttribute('aria-pressed', String(S.sons.alvo?.q === m.q))
      b.onclick = () => {
        S.sons.alvo = S.sons.alvo?.q === m.q ? null : m
        if (S.sons.alvo) {
          player.irPara(paraSegundos(m.q, p.fps))
          const sug = sugestaoDoMomento(m, S.sonoplasta)
          if (sug) {
            $('sonsTermo').value = sug.busca
            buscarSons(sug.busca)
          }
        }
        desenharSons()
      }
      return b
    }),
  )
  $('sonsSugestoes').replaceChildren(
    ...(S.sonoplasta.sugestoes || []).map((t) => {
      const b = el('button', 'sons-sugestao', { type: 'button', textContent: t })
      b.onclick = () => {
        $('sonsTermo').value = t
        buscarSons(t)
      }
      return b
    }),
  )
  desenharResultados()
}

function desenharResultados() {
  const ol = $('sonsLista')
  const { estado, erro, resultados } = S.sons
  if (estado === 'buscando') return ol.replaceChildren(el('li', 'apoio sons-estado', { textContent: 'Buscando…' }))
  if (estado === 'erro') {
    const li = el('li', 'sons-estado', { textContent: erro.message })
    if (erro.status === 401) li.append(el('a', 'link', { href: `/api/zro/entrar?volta=${encodeURIComponent('/app/')}`, textContent: ' Entrar de novo' }))
    return ol.replaceChildren(li)
  }
  if (estado === 'nada')
    return ol.replaceChildren(
      el('li', 'apoio sons-estado', {
        textContent: S.sons.fonte === 'banco' ? (S.sons.consulta ? 'Nenhum som com esse nome nesta pasta.' : 'Nenhum som nesta pasta.') : 'Nenhum som livre com esse nome. Tente outra palavra.',
      }),
    )
  ol.replaceChildren(
    ...resultados.map((s) => {
      const li = el('li', 'som-item')
      li.dataset.id = s.id
      const ouvir = el('button', 'icone-btn som-ouvir', { type: 'button', title: 'Ouvir', ariaLabel: `Ouvir ${s.titulo}`, innerHTML: '<svg><use href="#i-play"/></svg>' })
      ouvir.onclick = () => ouvirSom(s, ouvir)
      const info = el('span', 'som-info')
      const banco = s.origem === 'banco'
      const detalhe = banco ? [s.formato?.toUpperCase(), tamanhoLegivel(s.bytes)] : [s.autor, s.licenca, segundosLegiveis(s.duracao)]
      info.append(el('strong', '', { textContent: s.titulo }), el('span', 'apoio', { textContent: detalhe.filter(Boolean).join(' · ') }))
      info.title = banco ? s.nome : `${s.titulo}${s.autor ? ` · ${s.autor}` : ''} · ${s.licenca} · ${s.fonte}`
      const colocar = el('button', 'glass-btn som-colocar', { type: 'button', textContent: 'Colocar', title: S.sons.alvo ? `Colocar em ${S.sons.alvo.nome}` : 'Colocar no ponto' })
      colocar.onclick = () => colocarSomBuscado(s, colocar)
      li.append(ouvir, info, colocar)
      return li
    }),
  )
}

async function buscarSons(texto) {
  // no banco da pessoa, o termo vai como ela escreveu (os nomes são dela), dentro da pasta aberta
  if (S.sons.fonte === 'banco') return listarPasta(String(texto).replace(/\s+/g, ' ').trim().slice(0, 80))
  const termo = termoDeBusca(texto, S.sonoplasta)
  if (termo.length < 2) return
  S.sons = { ...S.sons, estado: 'buscando', erro: null }
  desenharResultados()
  try {
    const r = await bancoSons.buscar(termo)
    S.sons = { ...S.sons, resultados: r.sons, estado: r.sons.length ? 'pronto' : 'nada' }
  } catch (err) {
    S.sons = { ...S.sons, resultados: [], estado: 'erro', erro: err }
  }
  desenharResultados()
}
$('sonsBusca').onsubmit = (e) => {
  e.preventDefault()
  buscarSons($('sonsTermo').value)
}

/** Ouvir antes de escolher (o mesmo arquivo, pela mesma origem); tocar outro para o anterior. */
function ouvirSom(s, botao) {
  const antes = S.sons.ouvindo
  antes?.audio.pause()
  if (antes) antes.botao.innerHTML = '<svg><use href="#i-play"/></svg>'
  if (antes?.id === s.id) return (S.sons.ouvindo = null)
  const audio = new Audio(bancoSons.urlDoSom(s))
  audio.onended = () => {
    botao.innerHTML = '<svg><use href="#i-play"/></svg>'
    S.sons.ouvindo = null
  }
  audio.play().catch(() => aviso('Não deu para tocar esse som agora.'))
  botao.innerHTML = '<svg><use href="#i-pausa"/></svg>'
  S.sons.ouvindo = { id: s.id, audio, botao }
}

/** Baixa (uma vez por som) e põe no momento escolhido, ou no ponto; o crédito vai junto na origem do som. */
async function colocarSomBuscado(s, botao) {
  let p = P()
  if (!p) return
  const id = idDoSomBuscado(s)
  const q = S.sons.alvo ? S.sons.alvo.q : paraQuadros(player.t, p.fps)
  botao.disabled = true
  try {
    if (!somPorId(p, id) || !S.entradas.has(id)) {
      const blob = await bancoSons.baixar(s)
      const nome = somDoBanco(s, {}).nome
      const e = await ponte.entradaDe(new File([blob], nome, { type: blob.type }))
      const info = await lerInfo(e)
      if (!info.temAudio) throw new Error('o arquivo não tem som')
      S.entradas.set(id, e)
      if (!somPorId(p, id)) p = adicionarSom(p, somDoBanco(s, info)).projeto
    }
    const c = colocarEfeito(p, id, q, { volume: S.sonoplasta.volume_db, momento: S.sons.alvo?.tipo })
    if (!c.id) return aviso('Ponha um vídeo na linha antes do efeito.')
    fazer(c.projeto, 'efeito sonoro')
    linha.selecionarEfeito(c.id)
  } catch (err) {
    aviso(`${s.titulo}: ${err.message}`)
  } finally {
    botao.disabled = false
  }
}

/** Projeto reaberto: os sons que vieram de um banco descem de novo sozinhos (o app não guarda áudio no projeto). */
async function rebaixarSons(p) {
  for (const som of p.sons || []) {
    if (!DESCEM.has(som.origem?.tipo) || S.entradas.has(som.id) || !som.origem.id) continue
    try {
      const blob = await bancoSons.baixar(som.origem)
      S.entradas.set(som.id, await ponte.entradaDe(new File([blob], som.nome, { type: blob.type })))
    } catch {
      aviso(`O som "${som.nome}" não desceu agora; tente abrir de novo.`)
    }
  }
  if (P()) player.carregar(P(), opcoesPlayer(P()))
}

// ───────── salvar e abrir ─────────

async function salvarAgora() {
  const p = P()
  if (!p) return aviso('Abra ou crie um projeto para salvar uma cópia.')
  // o autosave já guarda; ⌘S grava agora e oferece uma cópia em arquivo (para levar a outro computador)
  clearTimeout(gravarTimer)
  await autosalvar()
  const nome = await ponte.salvarProjeto(salvar(p), `${nomeArquivo(p.nome)}${PRODUTO.extensao}`)
  if (nome) aviso('Cópia do projeto salva.')
}

$('abrirProjetoBtn').onclick = () => $('arquivoProjeto').click()
$('arquivoProjeto').onchange = async () => {
  const f = $('arquivoProjeto').files[0]
  $('arquivoProjeto').value = ''
  if (f) await abrirProjetoDe(await f.text())
}

/** Abre um .zroedit. No desktop a mídia é achada pelo caminho; no navegador, pede os arquivos (pelo nome). */
async function abrirProjetoDe(texto, { miniatura: mini = null } = {}) {
  let p
  try {
    p = abrir(texto)
  } catch (err) {
    return aviso(err.message)
  }
  S.entradas.clear()
  S.dbs.clear()
  S.miniaturas.clear()
  const faltam = []
  for (const m of [...p.midias, ...(p.sons || [])]) {
    if (m.caminho && ponte.desktop) S.entradas.set(m.id, await ponte.entradaDoCaminho(m.caminho, m.nome))
    else if (!DESCEM.has(m.origem?.tipo)) faltam.push(m)
  }
  S.h = new Historico(p)
  S.salvo = true
  S.miniaturaGuardada = mini
  autosalvar()
  if (faltam.length) aviso(`Escolha de novo: ${faltam.map((m) => m.nome).join(', ')}.`)
  desenharTudo()
  rebaixarSons(p)
  ir(p.propostas.length ? 'revisar' : 'midia')
}

// ───────── Seus universos: os projetos guardados, novo projeto, fechar ─────────

async function desenharUniversos() {
  const lista = await projetos.listar().catch(() => [])
  if (P()) return
  const ul = $('listaProjetos')
  $('universos').classList.toggle('sem-projetos', !lista.length)
  ul.replaceChildren(
    ...lista.map((r) => {
      const li = document.createElement('li')
      li.className = 'cartao-projeto'
      li.dataset.estado = r.estado
      li.innerHTML = `<button class="cartao-abrir"><span class="cartao-mini"></span><span class="cartao-corpo"><strong></strong><span class="fichas"></span></span></button><button class="icone-btn cartao-apagar" title="Tirar da lista" aria-label="Tirar da lista"><svg><use href="#i-lixo"/></svg></button>`
      const mini = li.querySelector('.cartao-mini')
      if (r.miniatura) mini.append(Object.assign(document.createElement('img'), { src: r.miniatura, alt: '' }))
      else mini.innerHTML = simbolo({ titulo: false })
      li.querySelector('strong').textContent = r.nome
      const ESTADO = { revisar: 'Para revisar', editando: 'Em edição', novo: 'Vazio' }
      li.querySelector('.fichas').append(
        ...[projetos.quando(r.atualizado), r.formato, r.duracao ? relogio(r.duracao) : null, ESTADO[r.estado]].filter(Boolean).map((t) => Object.assign(document.createElement('span'), { className: 'ficha', textContent: t })),
      )
      li.querySelector('.cartao-abrir').onclick = async () => {
        const texto = await projetos.ler(r.id)
        if (texto) abrirProjetoDe(texto, { miniatura: r.miniatura })
        else aviso('Este projeto não abre mais.')
      }
      li.querySelector('.cartao-apagar').onclick = async () => {
        if (!confirm(`Tirar "${r.nome}" da lista? Os vídeos não são tocados.`)) return
        await projetos.apagar(r.id)
        desenharUniversos()
      }
      return li
    }),
  )
}

/** Volta para Seus universos (o projeto já está gravado pelo autosave). */
async function fecharProjeto() {
  if (!P()) return ir('midia')
  clearTimeout(gravarTimer)
  if (!S.salvo) await autosalvar()
  player.pausar()
  S.h = null
  S.entradas.clear()
  S.dbs.clear()
  S.miniaturas.clear()
  S.faixas.clear()
  S.faixasFaltando.clear()
  player.faixasProntas.clear()
  S.selProposta = null
  ir('midia')
  desenharTudo()
}
S.fecharProjeto = fecharProjeto

/** Novo projeto (botão de Seus universos e o menu): com um projeto aberto, ele é guardado e fechado antes. */
async function novoProjetoFolha() {
  if (P()) await fecharProjeto()
  $('formNovo').reset()
  $('folhaNovo').showModal()
  $('novoNome').focus()
}
$('novoProjeto').onclick = () => novoProjetoFolha()
$('folhaNovo').onclose = () => {
  if ($('folhaNovo').returnValue !== 'criar') return
  const [largura, altura] = $('formNovo').formato.value.split('x').map(Number)
  const nome = $('novoNome').value.trim()
  S.h = new Historico({ ...novoProjeto({ nome: nome || 'Sem nome', preset: S.preset, fps: Number($('novoFps').value), largura, altura }), ...(nome ? {} : { semNome: true }) })
  S.miniaturaGuardada = null
  mudou()
  desenharTudo()
  if (S.pagina === 'z') ir('midia')
}

// renomear: clique no nome do projeto na barra
$('nomeProjeto').onclick = () => {
  const s = $('nomeProjeto')
  if (!P() || s.isContentEditable) return
  s.contentEditable = 'plaintext-only'
  s.focus()
  getSelection().selectAllChildren(s)
  const fim = (gravar) => {
    s.contentEditable = 'false'
    s.onblur = s.onkeydown = null
    const nome = s.textContent.trim().slice(0, 80)
    if (gravar && nome && nome !== P().nome) fazer({ ...P(), nome, semNome: undefined }, 'renomear')
    else s.textContent = P().nome
  }
  s.onblur = () => fim(true)
  s.onkeydown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault()
      s.blur()
    } else if (ev.key === 'Escape') fim(false)
  }
}

// "Atualizar" (app de desktop): antes de o app fechar para trocar de versão, grava o projeto aberto agora; com
// exportação andando, não fecha (desktop/main.cjs › entregarTroca pergunta aqui)
globalThis.aeonAntesDeAtualizar = async () => {
  if (renderAtual) return { ok: false, motivo: 'Termine a exportação antes de atualizar. Nada foi trocado.' }
  clearTimeout(gravarTimer)
  if (P()) await autosalvar()
  if (P() && !S.salvo) return { ok: false, motivo: 'Não consegui salvar o projeto aberto. Nada foi trocado.' }
  S.saindo = true
  return { ok: true }
}
montarAtualizacao(globalThis.aiEditDesktop?.atualizacao)

addEventListener('beforeunload', (e) => {
  if (P() && !S.salvo && !S.saindo) {
    autosalvar()
    e.preventDefault()
  }
})

// ───────── entrega ─────────

const ext = await codecsDaMaquina(1920, 1080).catch(() => ({}))
$('extVideo').textContent = `.mp4 · ${ext.video === 'avc' ? 'H.264' : ext.video === 'vp9' ? 'VP9' : 'sem codificador'}${ext.audio ? ` · ${ext.audio === 'aac' ? 'AAC' : 'Opus'}` : ''}`

let renderAtual = null
$('renderCancelar').onclick = () => renderAtual?.abort()

$('exportar').onclick = () => exportar()

/** Exporta o que estiver marcado. Devolve as medidas do render (demo medida). */
async function exportar({ marcados } = {}) {
  const p = P()
  if (!p) return aviso('Nada para exportar ainda.')
  if (pecasUI.ativo) return exportarPecas({ marcados })
  const quer = new Set(marcados || [...$('destinos').querySelectorAll('input:checked')].map((x) => x.value))
  if (!quer.size) return aviso('Escolha pelo menos um destino.')
  const base = nomeArquivo(p.nome)
  const resultado = {}
  $('entregaFim').hidden = true
  // linha do tempo para os editores (o Resolve lê o FCPXML e a EDL)
  const formatos = new Set()
  if (quer.has('xmeml')) formatos.add('xmeml')
  if (quer.has('fcpxml') || quer.has('resolve')) formatos.add('fcpxml')
  if (quer.has('resolve')) formatos.add('edl')
  if (formatos.size) {
    const arquivos = pacote(p, S.preset.legenda, new Date(), [...formatos])
    // os efeitos que vieram do banco (sem arquivo no disco) vão junto, ao lado do XML que aponta para eles
    for (const som of sonsUsados(p)) {
      const e = !som.caminho && S.entradas.get(som.id)
      if (e?.arquivo) arquivos.push({ name: arquivoDoSom(som), data: new Uint8Array(await e.arquivo.arrayBuffer()) })
    }
    // voz e instrumental separados pela NOSSOM: o WAV de cada um, ao lado do XML
    const faltaFaixa = await juntarFaixas(p, arquivos)
    if (faltaFaixa) return aviso(faltaFaixa)
    const r = await ponte.gravarPacote(base, arquivos, zip)
    if (!r) return
    resultado.pasta = r.pasta
    resultado.arquivos = arquivos.map((a) => a.name)
  }
  if (quer.has('video')) {
    const destino = await ponte.destinoDoVideo(`${base}.mp4`)
    if (destino.cancelado) return
    const alvo = destino.fluxo ? new MB.StreamTarget(destino.fluxo, { chunked: true }) : new MB.BufferTarget()
    renderAtual = new AbortController()
    $('render').hidden = false
    $('exportar').disabled = true
    try {
      await document.fonts.load('800 40px Figtree')
      const blocos = blocosDaLegenda(p)
      // câmera lenta com fluxo óptico em algum trecho: o motor (o primeiro uso baixa o modelo); se não abrir, a câmera
      // lenta sai com o quadro mais próximo e a pessoa sabe
      let fluxo = null
      if (segmentos(p).some((s) => s.v < 1 && s.modo === 'fluxo')) {
        $('renderTexto').textContent = 'Preparando o fluxo óptico…'
        try {
          fluxo = await carregarFluxo({ aoBaixar: (f, t) => ($('renderTexto').textContent = `Baixando o motor de fluxo óptico · ${Math.round((f / t) * 100)}%`) })
        } catch (err) {
          aviso(`${err.message} A câmera lenta sai com o quadro mais próximo.`)
        }
      }
      const r = await renderizar(p, {
        fluxo,
        faixas: await faixasDoRender(p),
        entradas: S.entradas,
        destino: alvo,
        blocos,
        legenda: { ligada: p.legenda.ligada, estilo: p.legenda.estilo, posicaoY: S.preset.legenda.posicao_y },
        sinal: renderAtual.signal,
        aoProgresso: (f, i) => {
          $('renderBarra').style.transform = `scaleX(${f})`
          $('renderTexto').textContent = f < 1 ? `${Math.round(f * 100)}% · ${Math.round(i.fps)} quadros/s · falta ${relogio(i.restante)}` : 'Terminando o arquivo…'
        },
      })
      if (!destino.fluxo) ponte.baixar(new Blob([alvo.buffer], { type: 'video/mp4' }), `${base}.mp4`)
      resultado.video = { ...r, caminho: destino.caminho }
    } catch (err) {
      if (err?.name === 'AbortError') aviso('Render cancelado.')
      else {
        console.error(err)
        aviso(`O render parou: ${err.message}`)
      }
      return null
    } finally {
      renderAtual = null
      $('render').hidden = true
      $('exportar').disabled = false
    }
  }
  const partes = []
  if (resultado.arquivos) partes.push(`${resultado.arquivos.length} arquivos para o seu editor`)
  if (resultado.video) partes.push(`vídeo de ${relogio(resultado.video.duracao)} em ${relogio(resultado.video.segundos)}`)
  if (resultado.video?.retempo?.fluxo) partes.push(`${resultado.video.retempo.fluxo} quadros de câmera lenta por fluxo óptico`)
  $('entregaFim').hidden = false
  $('entregaFim').textContent = `Pronto: ${partes.join(' e ')}.`
  if (resultado.pasta && ponte.desktop) {
    const b = Object.assign(document.createElement('button'), { className: 'link', textContent: 'Mostrar na pasta' })
    b.onclick = () => ponte.abrirPasta(resultado.pasta)
    $('entregaFim').append(' ', b)
  }
  return resultado
}
S.exportar = exportar

// ───────── voz e instrumental pela NOSSOM ─────────

/**
 * As faixas de uma separação, do disco do navegador: a voz e o instrumental (a soma das outras quatro) em AudioBuffer a
 * 44,1 kHz, com o ganho da NOSSOM desfeito. Decodifica uma faixa por vez (só uma na memória além das duas). null se não
 * estão neste navegador.
 */
function carregarFaixas(id) {
  if (!S.faixas.has(id))
    S.faixas.set(
      id,
      (async () => {
        const blobs = await discoFaixas.ler(id, STEMS)
        if (!blobs) return null
        const ctx = new OfflineAudioContext(2, 1, 44100)
        let voz = null
        let instrumental = null
        for (const [i, b] of blobs.entries()) {
          const ab = await ctx.decodeAudioData(await b.arrayBuffer())
          if (i === 0) {
            voz = ab
            continue
          }
          instrumental ??= new AudioBuffer({ length: ab.length, numberOfChannels: 2, sampleRate: ab.sampleRate })
          for (let c = 0; c < 2; c++) {
            const d = instrumental.getChannelData(c)
            const o = ab.getChannelData(Math.min(c, ab.numberOfChannels - 1))
            for (let k = 0, n = Math.min(d.length, o.length); k < n; k++) d[k] += o[k]
          }
        }
        const k = 10 ** (-(separacaoPorId(P(), id)?.ganhoDb || 0) / 20)
        if (k !== 1)
          for (const buf of [voz, instrumental])
            for (let c = 0; c < 2; c++) {
              const d = buf.getChannelData(c)
              for (let i = 0; i < d.length; i++) d[i] *= k
            }
        return { voz, instrumental }
      })().catch((err) => {
        console.error(err)
        return null
      }),
    )
  return S.faixas.get(id)
}

/** Começa a carregar as faixas que a linha usa; quando chegam, a prévia passa a tocar voz e instrumental. */
function prepararFaixas(p) {
  for (const id of new Set(p.linha.clipes.map((c) => c.faixas?.sep).filter(Boolean))) {
    if (player.faixasProntas.has(id) || S.faixasFaltando.has(id) || S.faixas.has(id)) continue
    carregarFaixas(id).then((fx) => {
      if (fx) player.faixasProntas.add(id)
      else S.faixasFaltando.add(id)
      const atual = P()
      if (atual) {
        player.carregar(atual, opcoesPlayer(atual))
        desenharInspector()
      }
    })
  }
}

/** As faixas que o render usa (só as que estão aqui; sem elas, o clipe sai com o som original). */
async function faixasDoRender(p) {
  const m = new Map()
  for (const id of new Set(p.linha.clipes.map((c) => c.faixas?.sep).filter(Boolean))) {
    const fx = await carregarFaixas(id)
    if (fx) m.set(id, fx)
  }
  return m
}

/**
 * Os WAV de voz e instrumental que a linha do tempo dos editores usa, ao lado do XML. Devolve o aviso se alguma faixa
 * não está neste navegador (o XML apontaria para um arquivo que não vem), ou null.
 */
async function juntarFaixas(p, arquivos) {
  for (const a of arquivosDeFaixas(p)) {
    const fx = await carregarFaixas(a.sep.id)
    if (!fx) return 'As faixas separadas de um clipe não estão neste computador: separe de novo ou volte ao som original.'
    const buf = fx[a.parte]
    arquivos.push({ name: a.arquivo, data: wav16([buf.getChannelData(0), buf.getChannelData(1)], buf.sampleRate) })
  }
  return null
}

/** Pergunta numa folha (sim/não): Promise<boolean>. */
function perguntar({ titulo, texto, sim, nao = 'Cancelar' }) {
  return new Promise((ok) => {
    const f = Object.assign(document.createElement('dialog'), { className: 'folha folha-pergunta' })
    f.innerHTML = '<h2 class="titulo-p"></h2><p class="apoio"></p><div class="acoes"><button type="button" class="glass-btn" value="nao"></button><button type="button" class="glass-btn glass-btn--ink" value="sim"></button></div>'
    f.querySelector('h2').textContent = titulo
    f.querySelector('p').textContent = texto
    f.querySelector('[value="nao"]').textContent = nao
    f.querySelector('[value="sim"]').textContent = sim
    let r = false
    f.querySelector('[value="nao"]').onclick = () => f.close()
    f.querySelector('[value="sim"]').onclick = () => {
      r = true
      f.close()
    }
    f.addEventListener('close', () => {
      f.remove()
      ok(r)
    })
    document.body.append(f)
    f.showModal()
  })
}

const PEDIDO_NOSSOM = 'aeon.nossom.pedido'
const lerPedido = () => {
  try {
    return JSON.parse(localStorage.getItem(PEDIDO_NOSSOM) || 'null')
  } catch {
    return null
  }
}
const guardarPedido = (x) => {
  try {
    if (x) localStorage.setItem(PEDIDO_NOSSOM, JSON.stringify(x))
    else localStorage.removeItem(PEDIDO_NOSSOM)
  } catch {}
}

/**
 * Separar voz e instrumental do clipe escolhido, pela NOSSOM: confere a conta lá, pergunta (com os minutos do plano),
 * manda o som do trecho, acompanha, guarda as cinco faixas neste navegador, liga no clipe e libera a cópia da NOSSOM.
 */
async function separarClipe() {
  const p = P()
  const c = p && linha.sel ? p.linha.clipes.find((x) => x.id === linha.sel) : null
  if (!c || S.separando) return
  const m = midiaPorId(p, c.midia)
  const t = trechoParaSeparar(p, c)
  if (t.erro) return aviso(t.erro)
  const entrada = S.entradas.get(m.id)
  if (!ponte.urlTocavel(entrada)) return aviso(`Escolha "${m.nome}" de novo na Mídia para separar.`)
  const ctrl = new AbortController()
  const andar = (texto, frac = -1) => {
    if (!S.separando) return
    S.separando.texto = texto
    S.separando.frac = frac
    desenharInspector()
  }
  S.separando = { clipe: c.id, texto: 'Conferindo a NOSSOM…', frac: -1, ctrl }
  desenharInspector()
  try {
    const cn = await nossom.conta()
    const dur = t.fim - t.ini
    if (cn.estado === 'entrar') {
      S.separando = null
      desenharInspector()
      if (await perguntar({ titulo: 'Entre na NOSSOM', texto: 'Uma vez só, com a mesma conta Absolute ZRO. Depois volte aqui e toque em Separar.', sim: 'Entrar na NOSSOM', nao: 'Agora não' }))
        open(`${nossom.NOSSOM}/entrar?next=${encodeURIComponent('/studio')}`, '_blank', 'noopener')
      return
    }
    if (cn.estado === 'sem-franquia') throw new Error('A franquia do seu plano NOSSOM acabou este mês.')
    if (cn.estado !== 'ok') throw new Error(cn.erro || 'A NOSSOM não respondeu agora.')
    const min = minutosDoPedido(dur)
    if (cn.restante !== null && cn.restante < Math.max(60, Math.ceil(dur))) throw new Error(`Faltam minutos no seu plano NOSSOM: este trecho usa ${min} min.`)
    const resta = cn.restante === null ? '' : ` (restam ${Math.floor(cn.restante / 60)} min)`
    andar('Esperando você confirmar…')
    const sim = await perguntar({ titulo: 'Separar voz e instrumental', texto: `O som deste trecho (${relogio(dur)}) sobe para a NOSSOM, separa na nuvem e volta alinhado ao clipe. Usa ${min} min do seu plano${resta}.`, sim: 'Separar' })
    if (!sim) return
    andar('Preparando o som…')
    const som = await audioDoTrecho(entrada, t.ini, dur)
    const wav = new Blob([wav16([som.getChannelData(0), som.getChannelData(1)], som.sampleRate)], { type: 'audio/wav' })
    const guardado = lerPedido()
    const retomar = guardado && guardado.midia === m.id && guardado.ini === t.ini && guardado.fim === t.fim ? guardado.id : null
    const r = await nossom.separar(wav, dur, {
      sinal: ctrl.signal,
      retomar,
      aoPedido: (id) => guardarPedido({ id, midia: m.id, ini: t.ini, fim: t.fim }),
      aoEstado: (x) => andar(x, S.separando?.frac ?? -1),
      aoProgresso: (f) => andar(S.separando?.texto || '', f),
    })
    andar('Guardando as faixas…')
    const atual = P()
    const ainda = atual?.linha.clipes.some((x) => x.id === c.id)
    const nova = adicionarSeparacao(atual, { midia: m.id, ini: t.ini, fim: t.fim, ganhoDb: r.ganhoDb, pedido: r.id }, ainda ? [c.id] : [], MIX_TUDO)
    await discoFaixas.guardar(nova.id, Object.fromEntries(STEMS.map((n, i) => [n, r.faixas[i]])))
    guardarPedido(null)
    S.separando = null
    fazer(nova.projeto, 'separar voz e instrumental')
    nossom.liberar(r.id).catch(() => {})
    aviso('Voz e instrumental prontos, alinhados ao clipe.')
  } catch (err) {
    if (err?.name === 'AbortError') aviso('Separação cancelada. O som original segue no clipe.')
    else {
      console.error(err)
      aviso(err.message)
    }
  } finally {
    S.separando = null
    desenharInspector()
  }
}

/** "Juntar em outra ordem" (Entrega em peças): o projeto novo abre no lugar deste, que fica guardado em Seus universos. */
async function criarProjetoJunto(base) {
  await autosalvar()
  const novo = { ...base, id: globalThis.crypto?.randomUUID?.() || `p${Date.now().toString(36)}` }
  delete novo.semNome
  S.h = new Historico(novo)
  mudou()
  desenharTudo()
  ir('edicao')
  aviso('Projeto novo, com as seções na nova ordem. O anterior está em Seus universos.')
}

/**
 * Entrega em peças: cada seção (de um marcador ao próximo) em cada formato escolhido vira arquivos à parte numa pasta:
 * o vídeo e, se pedido, a linha do tempo para o editor (numa subpasta com o nome da peça). No fim, entrega.csv com o
 * que saiu de cada uma. Uma peça que falha não para as outras; cancelar para tudo (o relatório diz até onde foi).
 */
async function exportarPecas({ marcados } = {}) {
  const p = P()
  const quer = new Set(marcados || [...$('destinos').querySelectorAll('input:checked')].map((x) => x.value))
  if (!quer.size) return aviso('Escolha pelo menos um destino.')
  const plano = planoDePecas(p, pecasUI.opcoes())
  if (!plano.length) return aviso('Escolha pelo menos uma seção.')
  if (quer.has('video')) {
    const faltam = midiasFaltando(p)
    if (faltam.length) return aviso(`Escolha de novo ${faltam.length === 1 ? `"${faltam[0].nome}"` : `${faltam.length} arquivos`} na Mídia para gravar as peças.`)
  }
  const formatos = new Set()
  if (quer.has('xmeml')) formatos.add('xmeml')
  if (quer.has('fcpxml') || quer.has('resolve')) formatos.add('fcpxml')
  if (quer.has('resolve')) formatos.add('edl')
  const pasta = await ponte.pastaDeSaida(`${nomeArquivo(p.nome)} · peças`, zip)
  if (!pasta) return null
  $('entregaFim').hidden = true
  renderAtual = new AbortController()
  const sinal = renderAtual.signal
  $('render').hidden = false
  $('exportar').disabled = true
  const itens = []
  const texto = (t) => ($('renderTexto').textContent = t)
  let parou = null
  try {
    await document.fonts.load('800 40px Figtree')
    // o motor de fluxo óptico uma vez só, se alguma peça tiver câmera lenta com fluxo
    let fluxo = null
    if (quer.has('video') && plano.some((x) => segmentos(x.projeto).some((s) => s.v < 1 && s.modo === 'fluxo'))) {
      texto('Preparando o fluxo óptico…')
      try {
        fluxo = await carregarFluxo({ aoBaixar: (f, t) => texto(`Baixando o motor de fluxo óptico · ${Math.round((f / t) * 100)}%`) })
      } catch (err) {
        aviso(`${err.message} A câmera lenta sai com o quadro mais próximo.`)
      }
    }
    for (const [i, peca] of plano.entries()) {
      if (sinal.aborted) throw new DOMException('cancelado', 'AbortError')
      const arquivos = []
      const passo = `Peça ${i + 1} de ${plano.length} · ${peca.nome}`
      try {
        if (formatos.size) {
          texto(passo)
          const doPacote = pacote(peca.projeto, S.preset.legenda, new Date(), [...formatos])
          const faltaFaixa = await juntarFaixas(peca.projeto, doPacote)
          if (faltaFaixa) throw new Error(faltaFaixa)
          for (const a of doPacote) {
            await pasta.gravar(`${peca.nome}/${a.name}`, a.data)
            arquivos.push(`${peca.nome}/${a.name}`)
          }
          for (const som of sonsUsados(peca.projeto)) {
            const e = !som.caminho && S.entradas.get(som.id)
            if (e?.arquivo) {
              await pasta.gravar(`${peca.nome}/${arquivoDoSom(som)}`, new Uint8Array(await e.arquivo.arrayBuffer()))
              arquivos.push(`${peca.nome}/${arquivoDoSom(som)}`)
            }
          }
        }
        if (quer.has('video')) {
          const nomeV = `${peca.nome}.mp4`
          const fl = await pasta.fluxo(nomeV)
          const alvo = fl ? new MB.StreamTarget(fl, { chunked: true }) : new MB.BufferTarget()
          await renderizar(peca.projeto, {
            fluxo,
            faixas: await faixasDoRender(peca.projeto),
            entradas: S.entradas,
            destino: alvo,
            blocos: blocosDaLegenda(peca.projeto),
            legenda: { ligada: peca.projeto.legenda.ligada, estilo: peca.projeto.legenda.estilo, posicaoY: S.preset.legenda.posicao_y },
            sinal,
            aoProgresso: (f) => {
              $('renderBarra').style.transform = `scaleX(${(i + f) / plano.length})`
              texto(`${passo} · ${Math.round(f * 100)}%`)
            },
          })
          if (!fl) await pasta.gravar(nomeV, new Uint8Array(alvo.buffer))
          arquivos.push(nomeV)
        }
        itens.push({ peca, arquivos, ok: true })
      } catch (err) {
        if (err?.name === 'AbortError') {
          itens.push({ peca, arquivos, ok: false, erro: 'cancelado' })
          throw err
        }
        console.error(err)
        itens.push({ peca, arquivos, ok: false, erro: err.message })
      }
      $('renderBarra').style.transform = `scaleX(${(i + 1) / plano.length})`
    }
  } catch (err) {
    parou = err?.name === 'AbortError' ? 'cancelado' : err.message
    if (err?.name !== 'AbortError') console.error(err)
  } finally {
    try {
      await pasta.gravar('entrega.csv', relatorio(p, itens))
      await pasta.fechar()
    } catch (err) {
      console.error(err)
    }
    renderAtual = null
    $('render').hidden = true
    $('exportar').disabled = false
  }
  const ok = itens.filter((x) => x.ok).length
  $('entregaFim').hidden = false
  $('entregaFim').textContent = parou === 'cancelado' ? `Cancelado: ${ok} de ${plano.length} peças prontas.` : parou ? `Parou: ${parou}` : `Pronto: ${ok} de ${plano.length} ${plano.length === 1 ? 'peça' : 'peças'}${ok < plano.length ? ' (veja entrega.csv)' : ''}.`
  if (pasta.pasta && ponte.desktop) {
    const b = Object.assign(document.createElement('button'), { className: 'link', textContent: 'Mostrar na pasta' })
    b.onclick = () => ponte.abrirPasta(pasta.pasta)
    $('entregaFim').append(' ', b)
  }
  return { itens, pasta: pasta.nome }
}

/** Mídias da linha que ainda não foram escolhidas de novo neste navegador (projeto reaberto): sem elas não há imagem. */
function midiasFaltando(p) {
  const ids = new Set(p.linha.clipes.map((c) => c.midia))
  return p.midias.filter((m) => ids.has(m.id) && m.temVideo && !ponte.urlTocavel(S.entradas.get(m.id)))
}

/** Uma imagem PNG em cada marcador (a aba Marcadores): o quadro que o vídeo final teria ali, com a legenda. */
async function exportarQuadros(ids) {
  const p = P()
  if (!p) return
  const naLinha = new Set(secoes(p).map((x) => x.marcador.id))
  const ms = (p.marcadores || []).filter((m) => ids.includes(m.id) && naLinha.has(m.id))
  if (!ms.length) return aviso('Esses marcadores ficaram depois do fim do vídeo.')
  const faltam = midiasFaltando(p)
  if (faltam.length) return aviso(`Escolha de novo ${faltam.length === 1 ? `"${faltam[0].nome}"` : `${faltam.length} arquivos`} na Mídia para tirar as imagens.`)
  aviso(`Tirando ${ms.length} ${ms.length === 1 ? 'imagem' : 'imagens'}…`)
  try {
    await document.fonts.load('800 40px Figtree')
    const imgs = await imagensEm(p, ms.map((m) => m.q), { entradas: S.entradas, blocos: blocosDaLegenda(p), legenda: { ligada: p.legenda.ligada, estilo: p.legenda.estilo, posicaoY: S.preset.legenda.posicao_y } })
    const arquivos = []
    for (const [i, x] of imgs.entries()) {
      const m = ms[i]
      const t = relogio(paraSegundos(m.q, p.fps)).replace(/:/g, '-')
      arquivos.push({ name: `${String(i + 1).padStart(2, '0')}_${nomeSeguro(m.nome || 'marcador')}_${t}.png`, data: new Uint8Array(await x.blob.arrayBuffer()) })
    }
    const r = await ponte.gravarPacote(`${nomeArquivo(p.nome)} · imagens`, arquivos, zip)
    if (r) aviso(`${arquivos.length} ${arquivos.length === 1 ? 'imagem pronta' : 'imagens prontas'}.`)
  } catch (err) {
    console.error(err)
    aviso(`As imagens não saíram: ${err.message}`)
  }
}

// o app abre na Mídia (os projetos e o vídeo): a tarefa vem primeiro (titular, 29/10/2026; Plano de Integração §7–8).
// A Z fica no ícone discreto da barra e em /app/#z (link direto); nunca abre sozinha.
ir(location.hash === '#z' ? 'z' : 'midia', false)
addEventListener('hashchange', () => location.hash === '#z' && ir('z'))
desenharTudo()
document.documentElement.dataset.pronto = '1'
// o Set, a aba em comum do ecossistema: o fim do dock (app/set.js). Não é a entrada: só a entrada dele aparece
montarSet()

// ───────── aviso ─────────

let avisoTimer = null
function aviso(texto) {
  const a = $('aviso')
  a.textContent = texto
  a.classList.add('visivel')
  clearTimeout(avisoTimer)
  avisoTimer = setTimeout(() => a.classList.remove('visivel'), 4200)
}
