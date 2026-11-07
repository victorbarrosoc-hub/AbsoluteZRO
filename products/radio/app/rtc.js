// Voz de aparelho para aparelho (WebRTC, malha: cada par tem uma conexão). O servidor só leva a oferta e a resposta
// (api/radio/batida.js); a voz e os recados de "estou falando" vão direto pela conexão e nunca passam pelo servidor.
//
// Roteamento: cada conexão tem um transceptor de áudio que nasce mudo (sem trilha). Com o TALK aberto, a trilha do
// microfone entra só nas conexões de quem escuta o canal de destino (cada aparelho diz o que escuta pelo canal de
// dados); ao fechar, sai de todas. Quem não escuta aquele canal não recebe nem um byte da fala. Várias pessoas falam ao
// mesmo tempo (full duplex): cada conexão traz a voz de um aparelho e o navegador mistura.
//
// Silêncio (moderação do RADION): o servidor diz quem está silenciado; este aparelho corta a voz que chega de quem está
// (e de quem a pessoa silenciou só para si) e não manda a própria voz quando é ela que está.
//
// Servidores de conexão: os que o servidor manda (/ice: STUN e, com a chave da Cloudflare, TURN, a ponte para redes que
// não se alcançam direto, como 4G com CGNAT). Sem TURN, a lista da equipe mostra quem ficou "conectando".

const ICE_PADRAO = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
const ESPERA_ICE_MS = 2500
const REFAZER_MS = 9000

/** Espera juntar os candidatos (sem trickle: uma oferta e uma resposta por par) ou o tempo acabar. */
function juntarCandidatos(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((ok) => {
    const fim = () => {
      pc.removeEventListener('icegatheringstatechange', ver)
      clearTimeout(t)
      ok()
    }
    const ver = () => pc.iceGatheringState === 'complete' && fim()
    const t = setTimeout(fim, ESPERA_ICE_MS)
    pc.addEventListener('icegatheringstatechange', ver)
  })
}

/** Falhou, ou ainda não abriu depois de REFAZER_MS ("disconnected" é queda curta: espera virar "failed"). */
function precisaRefazer(c) {
  const s = c.pc.connectionState
  if (s === 'failed' || s === 'closed') return true
  return s !== 'connected' && s !== 'disconnected' && Date.now() - c.desde > REFAZER_MS
}

export class Malha {
  /**
   * @param {{ eu: string, enviarSinal: (para: string, tipo: string, dados: object) => void, aoMudar: () => void,
   *           aoRecado: (peer: string, msg: object) => void }} op
   */
  constructor(op) {
    this.eu = op.eu
    this.ice = Array.isArray(op.iceServers) && op.iceServers.length ? op.iceServers : ICE_PADRAO
    this.enviarSinal = op.enviarSinal
    this.aoMudar = op.aoMudar
    this.aoRecado = op.aoRecado
    this.aoAbrir = op.aoAbrir || (() => {})
    this.conexoes = new Map()
    this.trilha = null
    this.falandoPara = null // Set de peers que estão recebendo minha voz agora
    this.recadoAtual = null
    this.calados = new Set() // peers cuja voz não toca aqui
  }

  /** A voz destes aparelhos não toca aqui (silenciados pela moderação ou por mim). */
  calarDe(peers) {
    this.calados = new Set(peers)
    for (const [peer, c] of this.conexoes) if (c.audio) c.audio.muted = this.calados.has(peer)
  }

  usarMicrofone(trilha) {
    this.trilha = trilha
  }

  /** Quem está online agora (da batida). Abre conexão com quem chegou; fecha a de quem saiu. */
  atualizar(peers) {
    const online = new Set(peers)
    for (const [peer, c] of this.conexoes) {
      if (!online.has(peer)) this.fechar(peer)
      else if (c.iniciador && precisaRefazer(c)) this.fechar(peer)
    }
    for (const peer of online) {
      // um lado só oferece (o de id menor): sem ofertas cruzadas
      if (peer !== this.eu && !this.conexoes.has(peer) && this.eu < peer) this.oferecer(peer)
    }
  }

  estado(peer) {
    const c = this.conexoes.get(peer)
    if (!c) return 'sem'
    return c.pc.connectionState === 'connected' && c.dc?.readyState === 'open' ? 'ligado' : 'ligando'
  }

  nova(peer, iniciador) {
    const pc = new RTCPeerConnection({ iceServers: this.ice })
    const c = { pc, iniciador, desde: Date.now(), sender: null, dc: null, audio: null }
    this.conexoes.set(peer, c)
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') c.desde = 0
      this.aoMudar()
    })
    pc.addEventListener('track', (e) => {
      if (!c.audio) {
        c.audio = document.createElement('audio')
        c.audio.autoplay = true
        c.audio.setAttribute('playsinline', '')
        c.audio.hidden = true
        document.body.append(c.audio)
      }
      c.audio.muted = this.calados.has(peer)
      c.audio.srcObject = new MediaStream([e.track])
      c.audio.play().catch(() => {})
    })
    return c
  }

  ligarCanal(peer, c, dc) {
    c.dc = dc
    dc.addEventListener('open', () => {
      // chegou alguém enquanto eu falava no Geral: entra na fala também
      if (this.recadoAtual) {
        dc.send(JSON.stringify(this.recadoAtual))
        if (this.deveOuvir?.(peer)) this.mandarVoz(peer, true)
      }
      this.aoAbrir(peer)
      this.aoMudar()
    })
    dc.addEventListener('close', () => this.aoMudar())
    dc.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg && typeof msg.t === 'string') this.aoRecado(peer, msg)
      } catch {
        // recado que não é JSON: ignora
      }
    })
  }

  async oferecer(peer) {
    const c = this.nova(peer, true)
    c.sender = c.pc.addTransceiver('audio', { direction: 'sendrecv' }).sender
    this.ligarCanal(peer, c, c.pc.createDataChannel('radio'))
    try {
      await c.pc.setLocalDescription(await c.pc.createOffer())
      await juntarCandidatos(c.pc)
      if (this.conexoes.get(peer) === c) this.enviarSinal(peer, 'oferta', { sdp: c.pc.localDescription.sdp })
    } catch {
      this.fechar(peer)
    }
  }

  async receber(de, tipo, dados) {
    if (tipo === 'oferta') {
      this.fechar(de)
      const c = this.nova(de, false)
      c.pc.addEventListener('datachannel', (e) => this.ligarCanal(de, c, e.channel))
      try {
        await c.pc.setRemoteDescription({ type: 'offer', sdp: dados.sdp })
        const tr = c.pc.getTransceivers().find((t) => t.receiver.track?.kind === 'audio')
        if (tr) {
          tr.direction = 'sendrecv'
          c.sender = tr.sender
        }
        await c.pc.setLocalDescription(await c.pc.createAnswer())
        await juntarCandidatos(c.pc)
        if (this.conexoes.get(de) === c) this.enviarSinal(de, 'resposta', { sdp: c.pc.localDescription.sdp })
      } catch {
        this.fechar(de)
      }
    } else if (tipo === 'resposta') {
      const c = this.conexoes.get(de)
      if (!c || !c.iniciador || c.pc.signalingState !== 'have-local-offer') return
      try {
        await c.pc.setRemoteDescription({ type: 'answer', sdp: dados.sdp })
      } catch {
        this.fechar(de)
      }
    }
  }

  mandarVoz(peer, sim) {
    const c = this.conexoes.get(peer)
    if (!c?.sender) return
    c.sender.replaceTrack(sim && this.trilha ? this.trilha : null).catch(() => {})
    if (sim) this.falandoPara?.add(peer)
    else this.falandoPara?.delete(peer)
  }

  /** Segurou o botão: a voz vai para quem `deveOuvir(peer)` diz. */
  falar(recado, deveOuvir) {
    this.recadoAtual = { t: 'fala', ...recado }
    this.deveOuvir = deveOuvir
    this.falandoPara = new Set()
    for (const [peer, c] of this.conexoes) {
      const sim = deveOuvir(peer)
      this.mandarVoz(peer, sim)
      if (c.dc?.readyState === 'open') c.dc.send(JSON.stringify(this.recadoAtual))
    }
  }

  calar() {
    this.recadoAtual = null
    this.deveOuvir = null
    for (const [, c] of this.conexoes) {
      c.sender?.replaceTrack(null).catch(() => {})
      if (c.dc?.readyState === 'open') c.dc.send(JSON.stringify({ t: 'fim' }))
    }
    this.falandoPara = null
  }

  /** Recado só para um aparelho (o que eu escuto, para quem acabou de chegar). */
  enviar(peer, msg) {
    const c = this.conexoes.get(peer)
    if (c?.dc?.readyState === 'open') c.dc.send(JSON.stringify(msg))
  }

  /** Quem fala reavalia um aparelho (ele mudou o que escuta): entra ou sai da fala sem renegociar. */
  reavaliar(peer) {
    if (this.recadoAtual && this.deveOuvir) this.mandarVoz(peer, this.deveOuvir(peer))
  }

  /** Recado para todos (aviso de set já gravado no servidor). */
  avisar(msg) {
    for (const [, c] of this.conexoes) if (c.dc?.readyState === 'open') c.dc.send(JSON.stringify(msg))
  }

  fechar(peer) {
    const c = this.conexoes.get(peer)
    if (!c) return
    this.conexoes.delete(peer)
    try {
      c.pc.close()
    } catch {
      // já fechada
    }
    c.audio?.remove()
    this.aoMudar()
  }

  fecharTodas() {
    for (const peer of [...this.conexoes.keys()]) this.fechar(peer)
  }
}
