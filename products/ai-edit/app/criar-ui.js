// A folha "Criar com IA" (a Higgsfield das Conexões, pelo HUB): no topo, os créditos (o saldo de agora, o plano e o
// medidor do que o AEON já usou no mês). Passo 1, "Veja antes": 1, 2 ou 4 telas em imagem (bem mais baratas), com o
// quadro atual do vídeo como referência se a pessoa quiser; cada tela pode ir para a Mídia como clipe parado. Passo 2,
// "Anime": a tela escolhida (ou o quadro atual) numa das três opções, com o preço de cada uma; o vídeo entra na Mídia.
// Todo preço e todo estado vêm da Higgsfield; o botão diz quanto custa antes, e o vídeo pergunta antes de gastar.
// Fechar a folha não perde o pedido: ele termina e entra na Mídia; recarregar a página retoma o que estava no meio.

import { cabe, creditos, DURACOES, estadoLegivel, medidor, nomeDaCriacao, precoDe, proporcaoDo, QUANTIDADES } from '../src/criar.js'
import * as hf from './higgsfield.js'

const PENDENTE = 'aeon.criar.pendente'
const ROTULO_DURACAO = { curto: 'Curta', longo: 'Longa' }

const lerPendente = () => {
  try {
    const x = JSON.parse(localStorage.getItem(PENDENTE) || 'null')
    return x && /^[a-z0-9]{12}$/.test(x.id) && ['imagem', 'video'].includes(x.saida) ? x : null
  } catch {
    return null
  }
}
const guardarPendente = (x) => {
  try {
    if (x) localStorage.setItem(PENDENTE, JSON.stringify(x))
    else localStorage.removeItem(PENDENTE)
  } catch {
    // sem armazenamento (janela privada): o pedido só não retoma depois de recarregar
  }
}

/** PNG (ou o que vier) → JPEG, para mandar menos bytes como referência. */
async function paraJpeg(blob) {
  const img = await createImageBitmap(blob)
  const c = new OffscreenCanvas(img.width, img.height)
  c.getContext('2d').drawImage(img, 0, 0)
  img.close?.()
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
}

/**
 * o: { projeto() → p | null, quadroAtual() → Promise<Blob | null>, porNaMidia(arquivo, { prompt, saida, id }) →
 * Promise<midiaId>, porNaLinha(midiaId), paraClipe(blob, nome) → Promise<File>, perguntar({ titulo, texto, sim }) →
 * Promise<boolean>, aviso(texto) }
 */
export class FolhaCriar {
  constructor(dialogo, o) {
    this.d = dialogo
    this.o = o
    this.painel = null
    this.leitura = null
    this.carregando = false
    this.duracao = 'curto'
    this.quantidade = 2
    this.opcao = 'equilibrado'
    this.telas = []
    this.base = null
    this.usarQuadro = false
    this.quadro = null
    this.trabalho = { telas: null, video: null }
    this.feitos = []
    this.refs = new WeakMap()
    this.montar()
  }

  montar() {
    this.d.innerHTML = `
<div class="criar-cab">
  <h2 class="titulo-p" id="criarTitulo">Criar com IA</h2>
  <span class="faixas-selo" title="Com os créditos do seu plano Higgsfield, conectado na sua conta Absolute ZRO">Higgsfield</span>
  <button type="button" class="icone-btn" data-acao="fechar" aria-label="Fechar"><svg><use href="#i-x" /></svg></button>
</div>
<div class="criar-creditos" aria-live="polite">
  <p class="criar-saldo"><strong data-saldo>—</strong> <span class="apoio" data-plano>créditos</span></p>
  <div class="criar-medidor" role="meter" aria-label="Créditos usados pelo AEON neste mês" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
  <p class="vel-dica" data-uso></p>
</div>
<div class="criar-aviso" hidden><p class="apoio" data-aviso></p><div class="acoes"><button type="button" class="glass-btn" data-acao="recarregar">Já conectei</button><a class="glass-btn glass-btn--ink" data-acao="conectar" target="_blank" rel="noopener">Conectar</a></div></div>
<div class="criar-corpo">
  <section class="criar-passo" aria-labelledby="criarP1">
    <div class="criar-passo-cab"><span class="criar-num">1</span><h3 id="criarP1">Veja antes</h3><span class="vel-dica">Telas em imagem custam bem menos que o vídeo</span></div>
    <textarea class="criar-texto" data-prompt rows="2" maxlength="2000" placeholder="Descreva a cena" aria-label="Descreva a cena"></textarea>
    <div class="criar-linha">
      <label class="criar-ref" data-ref-caixa><span class="chave"><input type="checkbox" data-ref /><span></span></span>Partir do quadro atual</label>
      <div class="segmento" role="radiogroup" aria-label="Quantas telas" data-qtd>${QUANTIDADES.map((n) => `<button type="button" role="radio" data-n="${n}" aria-checked="${n === 2}">${n}</button>`).join('')}</div>
      <button type="button" class="glass-btn" data-acao="telas">Gerar telas</button>
    </div>
    <div class="criar-estado" data-estado-telas hidden><div class="barra-progresso"><div class="faixas-barra andando"></div></div><span class="apoio"></span></div>
    <div class="criar-grade" role="radiogroup" aria-label="A tela que vai ser animada" data-grade></div>
  </section>
  <section class="criar-passo" aria-labelledby="criarP2">
    <div class="criar-passo-cab"><span class="criar-num">2</span><h3 id="criarP2">Anime</h3><span class="vel-dica" data-base-dica>Escolha uma tela ou parta do quadro atual</span></div>
    <textarea class="criar-texto" data-movimento rows="2" maxlength="2000" placeholder="Como a cena se mexe: câmera, ação" aria-label="Como a cena se mexe"></textarea>
    <div class="criar-opcoes" role="radiogroup" aria-label="Qualidade do vídeo" data-opcoes></div>
    <div class="criar-linha">
      <div class="segmento" role="radiogroup" aria-label="Duração" data-duracao>${DURACOES.map((x) => `<button type="button" role="radio" data-d="${x}" aria-checked="${x === 'curto'}">${ROTULO_DURACAO[x]}</button>`).join('')}</div>
      <button type="button" class="glass-btn glass-btn--ink" data-acao="animar">Animar</button>
    </div>
    <div class="criar-estado" data-estado-video hidden><div class="barra-progresso"><div class="faixas-barra andando"></div></div><span class="apoio"></span></div>
    <ul class="criar-feitos" data-feitos></ul>
  </section>
</div>`
    const q = (s) => this.d.querySelector(s)
    this.q = q
    this.d.addEventListener('click', (e) => {
      const a = e.target.closest('[data-acao]')?.dataset.acao
      if (a === 'fechar') this.d.close()
      else if (a === 'recarregar') this.carregar()
      else if (a === 'telas') this.gerarTelas()
      else if (a === 'animar') this.animar()
      const n = e.target.closest('[data-n]')?.dataset.n
      if (n) {
        this.quantidade = Number(n)
        this.desenhar()
      }
      const d = e.target.closest('[data-d]')?.dataset.d
      if (d && d !== this.duracao) {
        this.duracao = d
        this.desenhar()
        this.carregar()
      }
      const op = e.target.closest('[data-opcao]')?.dataset.opcao
      if (op) {
        this.opcao = op
        this.desenhar()
      }
      const t = e.target.closest('[data-tela]')
      if (t && !e.target.closest('[data-por]')) {
        const i = Number(t.dataset.tela)
        this.base = this.base?.tela === i ? null : { tela: i, blob: this.telas[i].blob, url: this.telas[i].url }
        this.desenhar()
      }
      const por = e.target.closest('[data-por]')?.dataset.por
      if (por !== undefined) this.telaNaMidia(Number(por), e.target.closest('[data-por]'))
      const linha = e.target.closest('[data-linha]')?.dataset.linha
      if (linha) this.o.porNaLinha(linha)
    })
    q('[data-ref]').addEventListener('change', async (e) => {
      this.usarQuadro = e.target.checked
      if (this.usarQuadro && !this.quadro) this.quadro = await this.capturar()
      if (!this.usarQuadro && this.base?.quadro) this.base = null
      if (this.usarQuadro && this.quadro && !this.base) this.base = { quadro: true, blob: this.quadro.blob, url: this.quadro.url }
      this.desenhar()
    })
    for (const s of ['[data-prompt]', '[data-movimento]']) q(s).addEventListener('input', () => this.desenhar())
  }

  async capturar() {
    try {
      const b = await this.o.quadroAtual()
      if (!b) return null
      const blob = await paraJpeg(b)
      return { blob, url: URL.createObjectURL(blob) }
    } catch {
      this.o.aviso('Não deu para pegar o quadro atual.')
      return null
    }
  }

  /** Abre a folha. doQuadro: veio do botão do player (parte do quadro atual). */
  async abrir({ doQuadro = false } = {}) {
    if (!this.d.open) this.d.showModal()
    const p = this.o.projeto()
    const temVideo = Boolean(p?.linha?.clipes?.length && p.midias.some((m) => m.temVideo))
    this.q('[data-ref-caixa]').hidden = !temVideo
    if (doQuadro && temVideo) {
      this.usarQuadro = true
      this.q('[data-ref]').checked = true
      this.quadro = await this.capturar()
      if (this.quadro) this.base = { quadro: true, blob: this.quadro.blob, url: this.quadro.url }
    }
    this.desenhar()
    await this.carregar()
    const pend = lerPendente()
    if (pend && !this.trabalho.telas && !this.trabalho.video) this.retomar(pend)
  }

  async carregar() {
    this.carregando = true
    this.leitura = null
    this.desenhar()
    try {
      this.painel = await hf.painel({ duracao: this.duracao, proporcao: proporcaoDo(this.o.projeto()) })
    } catch (e) {
      this.painel = null
      this.leitura = e.leitura || { estado: 'erro', texto: e.message }
    } finally {
      this.carregando = false
      this.desenhar()
    }
  }

  desenhar() {
    const q = this.q
    const pn = this.painel
    const m = medidor(pn)
    q('[data-saldo]').textContent = this.carregando && !pn ? '…' : creditos(m.saldo)
    q('[data-plano]').textContent = m.plano ? `créditos · ${m.plano}` : 'créditos'
    const med = q('.criar-medidor')
    med.setAttribute('aria-valuenow', String(Math.round(m.frac * 100)))
    med.firstElementChild.style.transform = `scaleX(${m.frac})`
    q('[data-uso]').textContent = pn
      ? `${creditos(m.usado)} usados no AEON este mês${m.usoMes != null ? ` · ${creditos(m.usoMes)} na Higgsfield toda` : ''}`
      : this.carregando
        ? 'Lendo seus créditos…'
        : ''
    q('[data-uso]').title = pn
      ? `${m.pedidos} ${m.pedidos === 1 ? 'pedido' : 'pedidos'} do AEON neste mês. Saldo e preços informados pela Higgsfield agora.`
      : ''

    const l = this.leitura
    const aviso = q('.criar-aviso')
    aviso.hidden = !l
    q('.criar-corpo').hidden = Boolean(l) || (!pn && !this.carregando)
    if (l) {
      q('[data-aviso]').textContent = l.texto
      const conectar = q('[data-acao="conectar"]')
      const precisa = l.estado === 'conectar' || l.estado === 'desligado' || l.estado === 'entrar'
      conectar.hidden = !precisa
      q('[data-acao="recarregar"]').hidden = !precisa || l.estado === 'entrar'
      conectar.textContent =
        l.estado === 'entrar' ? 'Entrar de novo' : l.estado === 'desligado' ? 'Abrir Conexões' : l.reconectar ? 'Conectar de novo' : 'Conectar'
      conectar.href = l.estado === 'entrar' ? '/api/zro/entrar?volta=%2Fapp%2F' : l.conectar || 'https://absolutezro.com/conexoes'
      conectar.target = l.estado === 'entrar' ? '_self' : '_blank'
    }

    for (const b of q('[data-qtd]').querySelectorAll('[data-n]')) {
      const n = Number(b.dataset.n)
      b.setAttribute('aria-checked', String(n === this.quantidade))
      const preco = precoDe(pn, { quantidade: n })
      b.title = preco == null ? 'Sem preço agora' : `${n} ${n === 1 ? 'tela' : 'telas'} · ${creditos(preco)} créditos`
    }
    for (const b of q('[data-duracao]').querySelectorAll('[data-d]')) b.setAttribute('aria-checked', String(b.dataset.d === this.duracao))

    const prompt = q('[data-prompt]').value.trim()
    const precoTelas = precoDe(pn, { quantidade: this.quantidade })
    const bt = q('[data-acao="telas"]')
    bt.textContent = precoTelas == null ? 'Gerar telas' : `Gerar ${this.quantidade} ${this.quantidade === 1 ? 'tela' : 'telas'} · ${creditos(precoTelas)}`
    bt.disabled = !prompt || Boolean(this.trabalho.telas) || !cabe(precoTelas, m.saldo)
    bt.title = !prompt
      ? 'Descreva a cena primeiro'
      : !cabe(precoTelas, m.saldo)
        ? precoTelas == null
          ? 'A Higgsfield não informou o preço agora'
          : 'Faltam créditos'
        : `Usa ${creditos(precoTelas)} dos seus ${creditos(m.saldo)} créditos`

    const ops = q('[data-opcoes]')
    ops.replaceChildren(
      ...(pn?.opcoes || []).map((o) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'criar-opcao'
        b.setAttribute('role', 'radio')
        b.dataset.opcao = o.id
        b.setAttribute('aria-checked', String(o.id === this.opcao))
        b.title = o.desc
        b.innerHTML = '<strong></strong><span class="ficha"></span><span class="criar-preco"></span>'
        b.querySelector('strong').textContent = o.nome
        b.querySelector('.ficha').textContent = `${o.segundos} s`
        b.querySelector('.criar-preco').textContent = o.creditos == null ? '—' : creditos(o.creditos)
        return b
      }),
    )

    const grade = q('[data-grade]')
    grade.replaceChildren(
      ...this.telas.map((t, i) => {
        const fig = document.createElement('div')
        fig.className = 'criar-tela'
        fig.dataset.tela = String(i)
        fig.setAttribute('role', 'radio')
        fig.tabIndex = 0
        fig.setAttribute('aria-checked', String(this.base?.tela === i))
        fig.setAttribute('aria-label', `Tela ${i + 1}`)
        fig.style.aspectRatio = proporcaoDo(this.o.projeto()).replace(':', ' / ')
        const img = Object.assign(document.createElement('img'), { src: t.url, alt: '' })
        const por = Object.assign(document.createElement('button'), {
          type: 'button',
          className: 'criar-por',
          title: 'Pôr na Mídia como clipe parado',
          textContent: t.naMidia ? 'Na Mídia' : 'Pôr na Mídia',
        })
        por.dataset.por = String(i)
        por.disabled = Boolean(t.naMidia)
        fig.append(img, por)
        return fig
      }),
    )

    const op = pn?.opcoes?.find((o) => o.id === this.opcao)
    const precoVideo = op?.creditos ?? null
    const ba = q('[data-acao="animar"]')
    const mov = q('[data-movimento]').value.trim()
    ba.textContent = precoVideo == null ? 'Animar' : `Animar · ${creditos(precoVideo)}`
    ba.disabled = !this.base || !mov || Boolean(this.trabalho.video) || !cabe(precoVideo, m.saldo)
    ba.title = !this.base
      ? 'Escolha uma tela ou parta do quadro atual'
      : !mov
        ? 'Diga como a cena se mexe'
        : !cabe(precoVideo, m.saldo)
          ? precoVideo == null
            ? 'A Higgsfield não informou o preço agora'
            : 'Faltam créditos'
          : `Usa ${creditos(precoVideo)} dos seus ${creditos(m.saldo)} créditos`
    q('[data-base-dica]').textContent = this.base
      ? this.base.quadro
        ? 'A partir do quadro atual'
        : `A partir da tela ${this.base.tela + 1}`
      : 'Escolha uma tela ou parta do quadro atual'

    for (const [chave, sel] of [
      ['telas', '[data-estado-telas]'],
      ['video', '[data-estado-video]'],
    ]) {
      const t = this.trabalho[chave]
      const caixa = q(sel)
      caixa.hidden = !t
      if (t) caixa.querySelector('span').textContent = t.texto
    }
    q('[data-feitos]').replaceChildren(
      ...this.feitos.map((f) => {
        const li = document.createElement('li')
        li.innerHTML = '<svg><use href="#i-ok" /></svg><span></span><button type="button" class="link">Pôr na linha</button>'
        li.querySelector('span').textContent = f.nome
        li.querySelector('button').dataset.linha = f.midia
        return li
      }),
    )
  }

  async referencia(blob) {
    if (this.refs.has(blob)) return this.refs.get(blob)
    const ref = await hf.enviarReferencia(blob)
    this.refs.set(blob, ref)
    return ref
  }

  async gerarTelas() {
    const prompt = this.q('[data-prompt]').value.trim()
    if (!prompt || this.trabalho.telas) return
    this.trabalho.telas = { texto: 'Enviando o pedido…' }
    this.desenhar()
    try {
      const ref = this.usarQuadro && this.quadro ? await this.referencia(this.quadro.blob) : null
      const r = await hf.telas({ prompt, quantidade: this.quantidade, proporcao: proporcaoDo(this.o.projeto()), ref })
      guardarPendente({ id: r.id, saida: 'imagem', prompt })
      await this.acompanharTelas(r.id, prompt)
    } catch (e) {
      this.falhou('telas', e)
    }
  }

  async acompanharTelas(id, prompt) {
    this.trabalho.telas = { texto: estadoLegivel('na_fila') }
    this.desenhar()
    try {
      const a = await hf.esperar(id, { aoEstado: (s) => ((this.trabalho.telas = { texto: estadoLegivel(s) }), this.desenhar()) })
      this.trabalho.telas = { texto: 'Recebendo as telas…' }
      this.desenhar()
      const novas = []
      for (const url of a.urls) {
        const blob = await hf.baixar(url)
        novas.push({ blob, url: URL.createObjectURL(blob), prompt })
      }
      this.telas = [...novas, ...this.telas].slice(0, 8)
      this.base = { tela: 0, blob: this.telas[0].blob, url: this.telas[0].url }
      guardarPendente(null)
      this.trabalho.telas = null
      this.desenhar()
      this.carregar()
    } catch (e) {
      // só esquece o pedido quando ele acabou de vez; senão, abrir a folha de novo retoma (o vídeo já foi pago)
      if (hf.encerrado(e)) guardarPendente(null)
      this.falhou('telas', e)
    }
  }

  async telaNaMidia(i, botao) {
    const t = this.telas[i]
    if (!t || t.naMidia) return
    botao.disabled = true
    botao.textContent = 'Pondo…'
    try {
      const arquivo = await this.o.paraClipe(t.blob, nomeDaCriacao(t.prompt, 'mp4', i + 1))
      await this.o.porNaMidia(arquivo, { prompt: t.prompt, saida: 'imagem' })
      t.naMidia = true
      this.o.aviso('A tela entrou na Mídia.')
    } catch (e) {
      this.o.aviso(`Não deu para pôr na Mídia: ${e.message}`)
    } finally {
      this.desenhar()
    }
  }

  async animar() {
    const mov = this.q('[data-movimento]').value.trim()
    const op = this.painel?.opcoes?.find((o) => o.id === this.opcao)
    if (!this.base || !mov || !op || this.trabalho.video) return
    const ok = await this.o.perguntar({
      titulo: `Animar em ${op.nome}?`,
      texto: `${op.segundos} s de vídeo. Usa ${creditos(op.creditos)} dos seus ${creditos(this.painel.saldo)} créditos da Higgsfield.`,
      sim: 'Animar',
    })
    if (!ok) return
    this.trabalho.video = { texto: 'Enviando a imagem…' }
    this.desenhar()
    try {
      const ref = await this.referencia(this.base.blob)
      const r = await hf.animar({ prompt: mov, opcao: op.id, duracao: this.duracao, ref })
      guardarPendente({ id: r.id, saida: 'video', prompt: mov })
      await this.acompanharVideo(r.id, mov)
    } catch (e) {
      this.falhou('video', e)
    }
  }

  async acompanharVideo(id, prompt) {
    this.trabalho.video = { texto: estadoLegivel('na_fila') }
    this.desenhar()
    try {
      const a = await hf.esperar(id, { intervaloMs: 5000, aoEstado: (s) => ((this.trabalho.video = { texto: estadoLegivel(s) }), this.desenhar()) })
      this.trabalho.video = { texto: 'Recebendo o vídeo…' }
      this.desenhar()
      const blob = await hf.baixar(a.urls[0])
      const nome = nomeDaCriacao(prompt, 'mp4')
      const midia = await this.o.porNaMidia(new File([blob], nome, { type: 'video/mp4' }), { prompt, saida: 'video', id })
      this.feitos = [{ nome, midia }, ...this.feitos].slice(0, 6)
      guardarPendente(null)
      this.trabalho.video = null
      this.o.aviso('O vídeo entrou na Mídia.')
      this.desenhar()
      this.carregar()
    } catch (e) {
      // só esquece o pedido quando ele acabou de vez; senão, abrir a folha de novo retoma (o vídeo já foi pago)
      if (hf.encerrado(e)) guardarPendente(null)
      this.falhou('video', e)
    }
  }

  retomar(pend) {
    if (pend.saida === 'video') this.acompanharVideo(pend.id, pend.prompt)
    else this.acompanharTelas(pend.id, pend.prompt)
  }

  falhou(chave, e) {
    this.trabalho[chave] = null
    if (e instanceof hf.ErroCriar && ['entrar', 'conectar', 'desligado'].includes(e.leitura.estado)) this.leitura = e.leitura
    this.desenhar()
    this.o.aviso(e.message)
  }
}
