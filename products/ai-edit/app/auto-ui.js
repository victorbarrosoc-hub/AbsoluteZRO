// A folha "Edição automática": os modos em cartões (Clipe, Aftermovie, Conteúdo). Nos de música: escolhe a música e as
// tomadas, analisa tudo na máquina (a barra anda pelo que foi medido: segundos de som, quadros olhados), mostra o que
// achou (a batida, as partes da música e cada tomada em sincronia ou como B-roll, tudo corrigível com um toque), e
// Montar troca a linha pela montagem num passo só do Desfazer. Depois, o Inspector mostra as outras opções de cada
// plano (montarTroca). Conteúdo leva para a análise de fala que o AEON já faz.

import { MODOS, modoPorId } from '../src/auto/modos.js'
import { comAnalise, empurrarSincronia, marcarTomada, montar, alternativasDoClipe, trocarPlano, zoomsNaBatida, comPartes } from '../src/auto/montar.js'
import { NIVEIS_BROLL, RITMOS } from '../src/musica/montagem.js'
import { NOMES as NOMES_PARTE, TIPOS as TIPOS_PARTE, renomearPartes } from '../src/musica/estrutura.js'
import { bytesParaBase64, notasEmBytes, referenciaDeNitidez } from '../src/musica/nota.js'
import { corrigirAndamento } from '../src/musica/ritmo.js'
import { comPropostas } from '../src/projeto.js'
import { relogio } from '../src/tempo.js'

const ROTULO_RITMO = { calmo: 'Calmo', normal: 'Normal', rapido: 'Rápido' }
const ROTULO_BROLL = { nenhum: 'Nenhum', pouco: 'Pouco', muito: 'Muito' }
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const sinal = (s) => `${s < 0 ? '−' : ''}${relogio(Math.abs(s))}`

/**
 * o: { projeto() → p, fazer(p, rotulo), preset(modo) → Promise<preset>, entrada(midiaId) → { arquivo | url },
 * escolherMusica() (abre o seletor de arquivo), analisarFala(), perguntar({ titulo, texto, sim }) → Promise<boolean>,
 * aviso(texto), aoMontar() }
 */
export class FolhaAuto {
  constructor(dialogo, o) {
    this.d = dialogo
    this.o = o
    this.modo = null
    this.preset = null
    this.musica = null
    this.fora = new Set()
    this.ritmo = 'normal'
    this.broll = 'pouco'
    this.zoom = true
    this.semente = 1
    this.trabalho = null
    this.worker = null
    this.montar()
  }

  montar() {
    this.d.innerHTML = `
<div class="criar-cab">
  <button type="button" class="icone-btn" data-acao="voltar" aria-label="Voltar aos modos" hidden><svg><use href="#i-voltar" /></svg></button>
  <h2 class="titulo-p" id="autoTitulo">Edição automática</h2>
  <button type="button" class="icone-btn" data-acao="fechar" aria-label="Fechar"><svg><use href="#i-x" /></svg></button>
</div>
<p class="apoio auto-sub" data-sub>Escolha o tipo de vídeo. Tudo roda no seu computador.</p>
<div class="auto-modos" data-modos role="list">${MODOS.map(
      (m) => `<button type="button" class="auto-modo" data-modo="${m.id}" role="listitem" title="${esc(m.dica)}"><span class="auto-modo-icone"><svg><use href="#${m.icone}" /></svg></span><strong>${esc(m.nome)}</strong><span class="vel-dica">${esc(m.dica)}</span></button>`,
    ).join('')}</div>
<div class="auto-corpo" data-corpo hidden>
  <section class="criar-passo" aria-labelledby="autoP1">
    <div class="criar-passo-cab"><span class="criar-num">1</span><h3 id="autoP1">Música e tomadas</h3></div>
    <div class="criar-linha">
      <label class="auto-campo"><span class="insp-rotulo">Música</span><select data-musica aria-label="A música"></select></label>
      <button type="button" class="glass-btn" data-acao="escolher-musica">Escolher música</button>
    </div>
    <ul class="auto-tomadas" data-tomadas aria-label="Tomadas"></ul>
    <div class="criar-linha"><span class="vel-dica" data-conta></span><button type="button" class="glass-btn glass-btn--ink" data-acao="analisar">Analisar</button></div>
    <div class="criar-estado" data-estado hidden><div class="barra-progresso"><div class="faixas-barra"></div></div><div class="faixas-linha"><span class="apoio" aria-live="polite"></span><button type="button" class="link" data-acao="cancelar">Cancelar</button></div></div>
  </section>
  <section class="criar-passo" aria-labelledby="autoP2" data-resultado hidden>
    <div class="criar-passo-cab"><span class="criar-num">2</span><h3 id="autoP2">Confira</h3><span class="vel-dica">Medido pela batida e pela harmonia. Toque para corrigir.</span></div>
    <div class="auto-batida"><strong data-bpm></strong><button type="button" class="ficha" data-andamento="0.5" title="A batida saiu em dobro">÷2</button><button type="button" class="ficha" data-andamento="2" title="A batida saiu pela metade">×2</button></div>
    <div class="auto-partes" data-partes role="list" aria-label="Partes da música"></div>
  </section>
  <section class="criar-passo" aria-labelledby="autoP3" data-ajustes hidden>
    <div class="criar-passo-cab"><span class="criar-num">3</span><h3 id="autoP3">Monte</h3></div>
    <div class="auto-ajustes">
      <div class="auto-ajuste"><span class="insp-rotulo">Ritmo</span><div class="segmento" role="radiogroup" aria-label="Ritmo dos cortes" data-ritmo>${RITMOS.map((r) => `<button type="button" role="radio" data-r="${r}" aria-checked="${r === 'normal'}">${ROTULO_RITMO[r]}</button>`).join('')}</div></div>
      <div class="auto-ajuste" data-caixa-broll><span class="insp-rotulo">B-roll</span><div class="segmento" role="radiogroup" aria-label="Quanto B-roll" data-broll>${NIVEIS_BROLL.map((b) => `<button type="button" role="radio" data-b="${b}" aria-checked="${b === 'pouco'}">${ROTULO_BROLL[b]}</button>`).join('')}</div></div>
      <label class="criar-ref auto-ajuste"><span class="chave"><input type="checkbox" data-zoom checked /><span></span></span>Zoom na batida <span class="vel-dica">(para aprovar no Revisar)</span></label>
    </div>
    <div class="criar-linha"><span class="vel-dica" data-resumo></span><button type="button" class="glass-btn" data-acao="outra" hidden>Outra versão</button><button type="button" class="glass-btn glass-btn--ink" data-acao="montar">Montar</button></div>
  </section>
</div>`
    const q = (s) => this.d.querySelector(s)
    this.q = q
    this.d.addEventListener('click', (e) => {
      const alvo = e.target.closest('[data-acao],[data-modo],[data-r],[data-b],[data-andamento],[data-parte],[data-tipo],[data-empurra],[data-fora]')
      if (!alvo) return
      const ds = alvo.dataset
      if (ds.acao === 'fechar') this.d.close()
      else if (ds.acao === 'voltar') this.mostrarModos()
      else if (ds.acao === 'escolher-musica') this.o.escolherMusica()
      else if (ds.acao === 'analisar') this.analisar()
      else if (ds.acao === 'cancelar') this.cancelar()
      else if (ds.acao === 'montar') this.montarLinha()
      else if (ds.acao === 'outra') this.montarLinha({ outra: true })
      else if (ds.modo) this.escolherModo(ds.modo)
      else if (ds.r) {
        this.ritmo = ds.r
        this.desenhar()
      } else if (ds.b) {
        this.broll = ds.b
        this.desenhar()
      } else if (ds.andamento) this.mudarAnalise((a) => corrigirAndamento(a, Number(ds.andamento)), 'corrigir a batida')
      else if (ds.parte) {
        const p = this.o.projeto()
        const i = Number(ds.parte)
        const atual = p?.auto?.partes?.[i]
        if (!atual) return
        const prox = TIPOS_PARTE[(TIPOS_PARTE.indexOf(atual.tipo) + 1) % TIPOS_PARTE.length]
        this.o.fazer(comPartes(p, renomearPartes(p.auto.partes, i, prox)), 'corrigir parte da música')
        this.desenhar()
      } else if (ds.tipo) {
        const p = this.o.projeto()
        const novo = marcarTomada(p, alvo.closest('[data-midia]').dataset.midia, ds.tipo)
        if (novo !== p) this.o.fazer(novo, 'corrigir tomada')
        this.desenhar()
      } else if (ds.empurra) {
        const p = this.o.projeto()
        const novo = empurrarSincronia(p, alvo.closest('[data-midia]').dataset.midia, Number(ds.empurra))
        if (novo !== p) this.o.fazer(novo, 'acertar sincronia')
        this.desenhar()
      }
    })
    this.d.addEventListener('change', (e) => {
      if (e.target.matches('[data-musica]')) {
        this.musica = e.target.value || null
        this.desenhar()
      } else if (e.target.matches('[data-fora]')) {
        const id = e.target.closest('[data-midia]').dataset.midia
        if (e.target.checked) this.fora.delete(id)
        else this.fora.add(id)
        this.desenhar()
      } else if (e.target.matches('[data-zoom]')) this.zoom = e.target.checked
    })
    this.d.addEventListener('close', () => this.cancelar())
  }

  abrir() {
    this.mostrarModos()
    if (!this.d.open) this.d.showModal()
  }

  mostrarModos() {
    this.modo = null
    this.q('[data-modos]').hidden = false
    this.q('[data-corpo]').hidden = true
    this.q('[data-acao="voltar"]').hidden = true
    this.q('#autoTitulo').textContent = 'Edição automática'
    this.q('[data-sub]').textContent = 'Escolha o tipo de vídeo. Tudo roda no seu computador.'
  }

  async escolherModo(id) {
    const m = modoPorId(id)
    if (!m) return
    if (m.motor === 'fala') {
      this.d.close()
      this.o.analisarFala()
      return
    }
    try {
      this.preset = await this.o.preset(m)
    } catch {
      return this.o.aviso('Não deu para abrir o preset desse modo.')
    }
    this.modo = m
    this.q('[data-modos]').hidden = true
    this.q('[data-corpo]').hidden = false
    this.q('[data-acao="voltar"]').hidden = false
    this.q('#autoTitulo').textContent = m.nome
    this.q('[data-sub]').textContent = m.dica
    const p = this.o.projeto()
    if (p?.auto?.modo !== m.id) this.musica = null
    if (p?.auto?.ajustes) Object.assign(this, { ritmo: p.auto.ajustes.ritmo, broll: p.auto.ajustes.broll, semente: p.auto.ajustes.semente })
    this.desenhar()
  }

  /** A música que vale agora: a escolhida, a da análise, ou a primeira mídia só de som (a mais longa). */
  musicaAtual(p) {
    const sons = p.midias.filter((m) => m.temAudio)
    if (this.musica && sons.some((m) => m.id === this.musica)) return this.musica
    if (p.auto?.musica && sons.some((m) => m.id === p.auto.musica)) return p.auto.musica
    const soSom = sons.filter((m) => !m.temVideo).sort((a, b) => b.duracao - a.duracao)
    return soSom[0]?.id || null
  }

  tomadasAtuais(p, musica) {
    return p.midias.filter((m) => m.temVideo && m.id !== musica)
  }

  analiseValida(p, musica) {
    const a = p?.auto
    return Boolean(a && a.modo === this.modo?.id && a.musica === musica && a.batidas?.length && this.tomadasAtuais(p, musica).every((m) => this.fora.has(m.id) || a.tomadas?.[m.id]))
  }

  desenhar() {
    const p = this.o.projeto()
    if (!p || !this.modo) return
    const musica = this.musicaAtual(p)
    const sel = this.q('[data-musica]')
    const sons = p.midias.filter((m) => m.temAudio)
    sel.innerHTML = sons.length ? sons.map((m) => `<option value="${esc(m.id)}"${m.id === musica ? ' selected' : ''}>${esc(m.nome)} · ${relogio(m.duracao)}</option>`).join('') : '<option value="">Nenhuma música no projeto</option>'
    sel.disabled = !sons.length
    const tomadas = this.tomadasAtuais(p, musica)
    const a = p.auto?.musica === musica && p.auto?.modo === this.modo.id ? p.auto : null
    this.q('[data-tomadas]').innerHTML = tomadas
      .map((m) => {
        const t = a?.tomadas?.[m.id]
        const usar = !this.fora.has(m.id)
        let estado = ''
        if (t && !this.preset.so_broll) {
          const perf = t.tipo === 'performance'
          const sinc = Number.isFinite(t.inicio)
          estado = `<div class="segmento auto-tipo" role="radiogroup" aria-label="Tipo de ${esc(m.nome)}"><button type="button" role="radio" data-tipo="performance" aria-checked="${perf}"${sinc ? '' : ' disabled title="Sem a música no som: não dá para sincronizar"'}>Performance</button><button type="button" role="radio" data-tipo="broll" aria-checked="${!perf}">B-roll</button></div>`
          if (perf)
            estado += `<span class="auto-sinc${t.ambigua ? ' auto-confira' : ''}" title="${t.ambigua ? 'Outro ponto da música casa quase igual (um refrão igual ao outro): confira ouvindo.' : `Confiança ${Math.round((t.ncc || 0) * 100)}%`}">${t.ambigua ? 'Confira · ' : ''}entra em ${sinal(t.inicio)}</span><button type="button" class="icone-btn auto-empurra" data-empurra="-1" aria-label="Um quadro antes" title="Um quadro antes"><svg><use href="#i-voltar" /></svg></button><button type="button" class="icone-btn auto-empurra" data-empurra="1" aria-label="Um quadro depois" title="Um quadro depois"><svg><use href="#i-avancar" /></svg></button>`
        } else if (t) estado = '<span class="vel-dica">Medida</span>'
        return `<li class="auto-tomada${usar ? '' : ' fora'}" data-midia="${esc(m.id)}"><label class="auto-usar"><span class="chave"><input type="checkbox" data-fora${usar ? ' checked' : ''} aria-label="Usar ${esc(m.nome)}" /><span></span></span><span class="auto-nome">${esc(m.nome)}</span><span class="vel-dica">${relogio(m.duracao)}</span></label>${estado}</li>`
      })
      .join('')
    const usadas = tomadas.filter((m) => !this.fora.has(m.id))
    this.q('[data-conta]').textContent = !musica ? 'Escolha a música primeiro.' : !usadas.length ? 'Adicione os vídeos na Mídia.' : `${usadas.length} ${usadas.length === 1 ? 'tomada' : 'tomadas'} · ${relogio(usadas.reduce((s, m) => s + m.duracao, 0))} de vídeo`
    const botao = this.q('[data-acao="analisar"]')
    botao.disabled = !musica || !usadas.length || Boolean(this.trabalho)
    const valida = this.analiseValida(p, musica)
    botao.textContent = a ? 'Analisar de novo' : 'Analisar'
    botao.classList.toggle('glass-btn--ink', !valida)
    this.q('[data-resultado]').hidden = !valida
    this.q('[data-ajustes]').hidden = !valida
    if (!valida) return
    this.q('[data-bpm]').textContent = `${String(a.bpm).replace('.', ',')} BPM · ${a.partes.length} ${a.partes.length === 1 ? 'parte' : 'partes'}`
    this.q('[data-partes]').innerHTML = a.partes
      .map((x, i) => `<button type="button" class="auto-parte" role="listitem" data-parte="${i}" data-cor="${this.preset.cores_partes[x.tipo] || 'azul'}" style="flex-grow:${Math.max(1, Math.round((x.fim - x.ini) * 10))}" title="${esc(`${x.nome} · ${relogio(x.ini)}–${relogio(x.fim)} · toque para trocar (${TIPOS_PARTE.map((t) => NOMES_PARTE[t]).join(', ')})`)}"><span>${esc(x.nome)}</span></button>`)
      .join('')
    for (const b of this.d.querySelectorAll('[data-r]')) b.setAttribute('aria-checked', String(b.dataset.r === this.ritmo))
    for (const b of this.d.querySelectorAll('[data-b]')) b.setAttribute('aria-checked', String(b.dataset.b === this.broll))
    this.q('[data-caixa-broll]').hidden = this.preset.so_broll
    this.q('[data-zoom]').checked = this.zoom
    const perf = Object.values(a.tomadas).filter((t) => t.tipo === 'performance').length
    this.q('[data-resumo]').textContent = this.preset.so_broll ? `${relogio(a.duracao)} de música` : `${perf} em sincronia · ${relogio(a.duracao)} de música`
    this.q('[data-acao="outra"]').hidden = !(p.auto?.ajustes && p.trilha?.midia === musica)
  }

  mudarAnalise(fn, rotulo) {
    const p = this.o.projeto()
    if (!p?.auto) return
    this.o.fazer({ ...p, auto: fn(p.auto) }, rotulo)
    this.desenhar()
  }

  andamento(frac, texto) {
    const e = this.q('[data-estado]')
    e.hidden = false
    e.querySelector('.faixas-barra').style.transform = `scaleX(${Math.max(0.02, Math.min(1, frac))})`
    e.querySelector('.apoio').textContent = texto
  }

  cancelar() {
    if (!this.trabalho) return
    this.trabalho.cancelado = true
    this.worker?.terminate()
    this.worker = null
    this.trabalho.rej?.(new DOMException('cancelado', 'AbortError'))
  }

  pedir(msg, aoAndar) {
    this.worker ??= new Worker(new URL('./auto-worker.js', import.meta.url), { type: 'module' })
    return new Promise((res, rej) => {
      this.trabalho.rej = rej
      this.worker.onmessage = ({ data }) => {
        if (data.tipo === 'andamento') aoAndar(data)
        else if (data.tipo === 'erro') rej(data.mensagem === 'cancelado' ? new DOMException('cancelado', 'AbortError') : new Error(data.mensagem))
        else res(data)
      }
      this.worker.onerror = (e) => rej(new Error(e.message || 'a análise parou'))
      this.worker.postMessage(msg)
    })
  }

  async analisar() {
    const p0 = this.o.projeto()
    if (!p0 || this.trabalho) return
    const musica = this.musicaAtual(p0)
    const mus = p0.midias.find((m) => m.id === musica)
    const tomadas = this.tomadasAtuais(p0, musica).filter((m) => !this.fora.has(m.id))
    if (!mus || !tomadas.length) return
    const entradaMus = this.o.entrada(musica)
    const semArquivo = [mus, ...tomadas].find((m) => !this.o.entrada(m.id))
    if (!entradaMus || semArquivo) return this.o.aviso(`O arquivo de "${(semArquivo || mus).nome}" não está aberto aqui. Escolha os arquivos de novo na Mídia.`)
    this.trabalho = { cancelado: false }
    this.desenhar()
    // peso de cada etapa pela duração: a música, depois o som e a imagem de cada tomada
    const sincronizar = !this.preset.so_broll
    const pesoMus = mus.duracao
    const pesoTomada = (m) => (sincronizar && m.temAudio ? m.duracao * 0.5 : 0) + m.duracao
    const total = pesoMus + tomadas.reduce((s, m) => s + pesoTomada(m), 0)
    let antes = 0
    const t0 = performance.now()
    try {
      const { analise } = await this.pedir({ tipo: 'musica', entrada: entradaMus, preset: this.preset }, (x) => this.andamento((x.feito / x.total) * (pesoMus / total), `Ouvindo a música · ${relogio(x.feito)} de ${relogio(x.total)}`))
      antes = pesoMus
      const resultados = []
      for (const [i, m] of tomadas.entries()) {
        const de = `${i + 1} de ${tomadas.length}`
        const somPeso = sincronizar && m.temAudio ? m.duracao * 0.5 : 0
        const r = await this.pedir({ tipo: 'tomada', id: m.id, entrada: this.o.entrada(m.id), temAudio: m.temAudio, temVideo: m.temVideo, sincronizar, preset: this.preset }, (x) => {
          if (x.fase === 'som') this.andamento((antes + (x.feito / x.total) * somPeso) / total, `Sincronizando ${de} · ${m.nome}`)
          else this.andamento((antes + somPeso + (x.feito / x.total) * m.duracao) / total, `Olhando os planos ${de} · ${x.feito} de ${x.total} quadros`)
        })
        resultados.push({ m, r })
        antes += pesoTomada(m)
      }
      // a nitidez boa é a do material todo (uma câmera mais suave não perde tudo para a outra)
      const ref = referenciaDeNitidez(resultados.map(({ r }) => r.imagem?.medidas || []))
      const anteriores = p0.auto?.musica === musica ? p0.auto.tomadas || {} : {}
      const tomadasA = { ...Object.fromEntries(Object.entries(anteriores).filter(([id]) => p0.midias.some((m) => m.id === id))) }
      for (const { m, r } of resultados) {
        const notas = r.imagem ? { hz: r.imagem.hz, b64: bytesParaBase64(notasEmBytes(r.imagem.medidas, ref, this.preset.nota)) } : { hz: this.preset.analise.amostras_por_s, b64: '' }
        const s = r.sincronia
        tomadasA[m.id] = { tipo: this.preset.so_broll ? 'broll' : s?.tipo || 'broll', ...(s ? { inicio: s.inicio, ncc: s.ncc, destaque: s.destaque, ambigua: s.ambigua } : {}), ...notas }
      }
      const p = this.o.projeto()
      this.o.fazer(comAnalise(p, { modo: this.modo.id, preset: { nome: this.preset.preset, versao: this.preset.version }, musica, ...analise, tomadas: tomadasA }), 'análise da edição automática')
      const perf = Object.values(tomadasA).filter((t) => t.tipo === 'performance').length
      this.o.aviso(this.preset.so_broll ? `Música e ${resultados.length} tomadas medidas em ${relogio((performance.now() - t0) / 1000)}.` : `${perf} de ${resultados.length} tomadas em sincronia, medidas em ${relogio((performance.now() - t0) / 1000)}.`)
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error(err)
        this.o.aviso(`A análise parou: ${err.message}`)
      } else this.o.aviso('Análise cancelada.')
    } finally {
      this.trabalho = null
      this.q('[data-estado]').hidden = true
      this.worker?.postMessage({ tipo: 'esquecer' })
      this.desenhar()
    }
  }

  async montarLinha({ outra = false } = {}) {
    const p = this.o.projeto()
    if (!p?.auto) return
    if (!p.auto.ajustes && p.linha.clipes.length > 1) {
      const ok = await this.o.perguntar({ titulo: 'Trocar a linha pela montagem?', texto: 'O Desfazer volta a linha de agora.', sim: 'Montar' })
      if (!ok) return
    }
    if (outra) this.semente = (this.semente % 9973) + 1
    const { projeto, planos } = montar(p, this.preset, { ritmo: this.ritmo, broll: this.preset.so_broll ? 'muito' : this.broll, semente: this.semente })
    if (!planos.length) return this.o.aviso('Nada para montar: confira a música e as tomadas.')
    let novo = projeto
    if (this.zoom) {
      const zs = zoomsNaBatida(novo, this.preset)
      if (zs.length) novo = comPropostas(novo, zs, ['zoom'])
    }
    this.o.fazer(novo, outra ? 'outra versão da montagem' : 'edição automática')
    const sync = planos.filter((x) => x.tipo === 'performance').length
    this.o.aviso(`${novo.linha.clipes.length} planos${this.preset.so_broll ? '' : `, ${sync} em sincronia`}. Troque qualquer um no Inspector.`)
    this.d.close()
    this.o.aoMontar()
  }
}

/**
 * Troca de plano no Inspector: as outras opções do mesmo trecho da música para o clipe escolhido (só em linha montada
 * com trilha). caixa: onde montar. o: { obter() → { p, clipe }, trocar(alt) }.
 */
export function montarTroca(caixa, o) {
  const sec = document.createElement('div')
  sec.className = 'insp-troca'
  sec.hidden = true
  sec.innerHTML = `<div class="vel-cabeca"><span class="insp-rotulo">Trocar plano</span><span class="vel-dica">Mesmo trecho da música</span></div><ul class="troca-lista"></ul>`
  caixa.append(sec)
  const lista = sec.querySelector('ul')
  let alts = []
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-alt]')
    if (b) o.trocar(alts[Number(b.dataset.alt)])
  })
  function desenhar() {
    const { p, clipe } = o.obter()
    alts = p?.auto && p.trilha && clipe ? alternativasDoClipe(p, clipe.id) : []
    sec.hidden = !alts.length
    lista.innerHTML = alts
      .map((x, i) => `<li><button type="button" class="troca-opcao" data-alt="${i}" title="${esc(x.nome)} em ${relogio(x.de)}"><span class="troca-nome">${esc(x.nome)}</span><span class="vel-dica">${x.tipo === 'performance' ? 'Em sincronia' : 'B-roll'}</span><span class="troca-nota" style="--nota:${x.nota}" aria-label="Nota ${Math.round(x.nota * 100)}"></span></button></li>`)
      .join('')
  }
  return { el: sec, desenhar }
}

export { trocarPlano }
