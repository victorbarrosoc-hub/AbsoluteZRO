// CAMZRO · as folhas (painéis que sobem por cima do visor). Uma por vez, título curto, o essencial à mostra e o resto
// numa nota. Cada folha é uma função que devolve HTML; os cliques passam por data-set (muda um ajuste),
// data-acao (faz algo) e data-folha (abre outra folha).

import { A, S, $, definir, substituirAjustes, avisar, cadencia, perfil, reabrir, abrirSlate, zerarNivel, tirarLut, MODO } from './app.js'
import * as E from './estado.js'
import { pintar, svg } from './icones.js'
import * as exp from './nucleo/exposicao.js'
import * as cl from './nucleo/claquete.js'
import { CADENCIAS } from './nucleo/exposicao.js'
import { RESOLUCOES, isosDaCamera } from './nucleo/controles.js'
import { BALANCOS, FALSA_COR, kelvinDeRgb } from './nucleo/cor.js'
import { PROPORCOES, ANAMORFICOS } from './nucleo/guias.js'
import { bitrateTexto, bitrateAudio, bytesTexto, tempoTexto, segundosQueCabem } from './nucleo/armazenamento.js'
import { CODECS_VIDEO } from './motor/gravador.js'
import { dispositivos } from './motor/camera.js'
import { folhaBiblioteca, ligarBiblioteca } from './biblioteca.js'
import { lerRoteiro, posicao, seguinte, ErroRoteiro } from './nucleo/maestro.js'

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// ───────── pecinhas ─────────

export const topo = (fino, forte) => `<div class="folha__alca"></div><div class="folha__topo"><h2 id="folha-titulo">${fino ? `${esc(fino)} ` : ''}<b>${esc(forte)}</b></h2><button type="button" class="fechar" data-acao="fechar-folha" aria-label="Fechar">${svg('fechar')}</button></div>`
export const grupo = (titulo, corpo) => `<div class="grupo">${titulo ? `<h3>${esc(titulo)}</h3>` : ''}${corpo}</div>`
export const cartao = (linhas) => `<div class="cartao">${linhas.join('')}</div>`
export const nota = (t) => `<p class="nota">${t}</p>`

/** Botões de escolha: data-set="grupo.chave" data-v="valor" (data-num para número). */
export function segmentos(caminho, opcoes, atual, { num = false } = {}) {
  return `<div class="segmentos">${opcoes
    .map((o) => {
      const v = typeof o === 'object' ? o.v : o
      const r = typeof o === 'object' ? o.r : o
      return `<button type="button" data-set="${caminho}" data-v="${esc(v)}"${num ? ' data-num' : ''} aria-pressed="${String(v) === String(atual)}"${o.desligado ? ' disabled' : ''}${o.dica ? ` title="${esc(o.dica)}"` : ''}>${esc(r)}</button>`
    })
    .join('')}</div>`
}
export const linha = (rotulo, direita = '', apoio = '') => `<div class="linha"><span>${esc(rotulo)}${apoio ? `<small>${apoio}</small>` : ''}</span>${direita}</div>`
export const interruptor = (caminho, ligado, rotulo, apoio = '') => linha(rotulo, `<button type="button" class="interruptor" role="switch" aria-checked="${Boolean(ligado)}" data-alternar="${caminho}" aria-label="${esc(rotulo)}"></button>`, apoio)
export const selecao = (caminho, opcoes, atual, { num = false } = {}) => `<select data-campo="${caminho}"${num ? ' data-num' : ''}>${opcoes.map((o) => `<option value="${esc(o.v)}"${String(o.v) === String(atual) ? ' selected' : ''}>${esc(o.r)}</option>`).join('')}</select>`
export const campoTexto = (caminho, valor, { max = 24, rotulo = '' } = {}) => `<input type="text" data-campo="${caminho}" value="${esc(valor)}" maxlength="${max}" aria-label="${esc(rotulo)}" autocomplete="off" spellcheck="false" />`
const semControle = (o) => nota(`Este aparelho não deixa o navegador controlar ${o}. ${S.capacidades?.algumManual ? '' : 'No iPhone, o Safari ainda não abre controle manual de câmera: a exposição e o foco ficam no automático (toque na imagem para focar quando o aparelho deixa).'}`)

// ───────── exposição ─────────

function folhaIso() {
  const cap = S.capacidades || {}
  if (!cap.exposicaoManual) return `${topo('', 'ISO')}${semControle('o ISO')}${compensacao()}${travaExposicao()}`
  const isos = isosDaCamera(cap.iso)
  const fixo = A.camera.exposicao === 'manual' || A.camera.exposicao === 'iso'
  return `${topo('', 'ISO')}
    ${grupo('', segmentos('camera.exposicao', [{ v: 'auto', r: 'Auto' }, { v: 'travada', r: 'Travar' }, { v: 'iso', r: 'Prioridade', dica: 'ISO fixo; o obturador acompanha a luz' }, { v: 'manual', r: 'Manual' }], A.camera.exposicao === 'obturador' ? 'auto' : A.camera.exposicao))}
    ${fixo ? grupo('', `<div class="cartao dial"><div class="dial__valor"><b>${Math.round(S.ajustes?.iso || A.camera.iso || isos[0])}</b><small>${cap.iso.min}–${cap.iso.max}</small></div>${segmentos('camera.iso', isos.map((v) => ({ v, r: v })), Math.round(A.camera.iso || S.ajustes?.iso || 0), { num: true })}</div>`) : compensacao()}
    ${A.camera.exposicao === 'iso' ? evPrioridade() : ''}
    ${nota('ISO baixo, menos ruído. No celular a abertura é fixa: a luz se acerta no ISO, no obturador e no ND. <b>Prioridade</b>: o ISO fica, o obturador acompanha a luz.')}`
}
const compensacao = () => {
  const c = S.capacidades?.compensacao
  if (!c || A.camera.exposicao !== 'auto') return ''
  const passos = []
  for (let v = Math.ceil(c.min); v <= Math.floor(c.max); v++) passos.push({ v, r: v > 0 ? `+${v}` : String(v) })
  return grupo('Compensação', segmentos('camera.compensacao', passos, Math.round(A.camera.compensacao), { num: true }))
}
const evPrioridade = () => grupo('EV', segmentos('camera.ev', [-2, -1, -0.7, -0.3, 0, 0.3, 0.7, 1, 2].map((v) => ({ v, r: v > 0 ? `+${String(v).replace('.', ',')}` : String(v).replace('.', ',').replace('-', '−') })), A.camera.ev, { num: true }))
const travaExposicao = () => (S.capacidades?.travaExposicao ? grupo('', segmentos('camera.exposicao', [{ v: 'auto', r: 'Auto' }, { v: 'travada', r: 'Travar' }], A.camera.exposicao)) : '')

function folhaObturador() {
  const cap = S.capacidades || {}
  const c = cadencia()
  const af = exp.antiFlicker(A.formato.rede, c.fps)
  const angulos = [45, 90, 144, 172.8, 180, 216, 270, 360]
  const segurosAng = new Set(af.seguros.map((s) => Math.round(s.angulo * 10) / 10))
  const atual = S.ajustes?.tempo ? exp.tempoParaAngulo(S.ajustes.tempo, c.fps) : A.camera.angulo
  const manual = (A.camera.exposicao === 'manual' || A.camera.exposicao === 'obturador') && cap.exposicaoManual
  const lista = angulos
    .filter((a) => !cap.tempo || exp.anguloParaTempo(a, c.fps) <= cap.tempo.max + 1e-6)
    .map((a) => ({ v: a, r: exp.anguloTexto(a), dica: `${exp.fracao(exp.anguloParaTempo(a, c.fps))}${segurosAng.has(a) ? ' · sem flicker' : ''}` }))
  const seguro = af.seguros.map((s) => `<b>${exp.anguloTexto(s.angulo)}</b> (${s.texto})`).join(', ')
  return `${topo('', 'Obturador')}
    ${cap.exposicaoManual ? grupo('', segmentos('camera.exposicao', [{ v: 'auto', r: 'Auto' }, { v: 'obturador', r: 'Prioridade', dica: 'Obturador fixo; o ISO acompanha a luz' }, { v: 'manual', r: 'Manual' }], ['manual', 'obturador'].includes(A.camera.exposicao) ? A.camera.exposicao : 'auto')) : semControle('o obturador')}
    ${manual ? grupo('', `<div class="cartao dial"><div class="dial__valor"><b>${exp.anguloTexto(atual)}</b><small>${exp.fracao(exp.anguloParaTempo(atual, c.fps))} a ${c.rotulo} fps</small></div>${segmentos('camera.angulo', lista, Math.round(A.camera.angulo * 10) / 10, { num: true })}</div>`) : ''}
    ${A.camera.exposicao === 'obturador' ? evPrioridade() : ''}
    ${grupo('ND na lente', segmentos('camera.nd', [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1].map((v) => ({ v, r: v ? String(v).replace('.', ',') : 'Sem' })), A.camera.nd, { num: true }))}
    ${grupo('Luz da rede', segmentos('formato.rede', [{ v: 50, r: '50 Hz' }, { v: 60, r: '60 Hz (Brasil)' }], A.formato.rede, { num: true }))}
    ${nota(`Sem flicker a ${c.rotulo} fps em ${A.formato.rede} Hz: ${seguro || 'nenhum ângulo'}.${af.cadenciaSegura ? ' Esta cadência já é segura com qualquer um deles.' : ''} 180° é o desfoque de movimento do cinema.`)}
    ${grupo('', interruptor('monitor.mostrarAngulo', A.monitor.mostrarAngulo, 'Mostrar em ângulo', 'Desligado: em velocidade (1/48)'))}`
}

function folhaBalanco() {
  const cap = S.capacidades || {}
  const k = Math.round(S.ajustes?.kelvin || A.camera.kelvin)
  const corpo = cap.balancoManual
    ? `${grupo('', segmentos('camera.balanco', [{ v: 'auto', r: 'Auto' }, { v: 'travado', r: 'Travar' }, { v: 'manual', r: 'Kelvin' }], A.camera.balanco))}
       ${A.camera.balanco === 'manual' ? grupo('', `<div class="cartao dial"><div class="dial__valor"><b>${k}K</b><small>${cap.kelvin.min}–${cap.kelvin.max}K</small></div><input type="range" min="${cap.kelvin.min}" max="${cap.kelvin.max}" step="${cap.kelvin.passo || 50}" value="${k}" data-campo="camera.kelvin" data-num aria-label="Kelvin" />${segmentos('camera.kelvin', BALANCOS.filter((b) => b.k >= cap.kelvin.min && b.k <= cap.kelvin.max).map((b) => ({ v: b.k, r: `${b.k}`, dica: b.nome })), k, { num: true })}</div>`) : ''}`
    : `${semControle('o balanço de branco')}${cap.travaBalanco ? grupo('', segmentos('camera.balanco', [{ v: 'auto', r: 'Auto' }, { v: 'travado', r: 'Travar' }], A.camera.balanco)) : ''}`
  return `${topo('', 'Balanço de branco')}${corpo}
    ${grupo('Medir', `<div class="acoes-folha"><button type="button" class="glass-btn glass-btn--pequeno" data-acao="medir-cinza">Medir no cartão cinza</button></div>`)}
    ${nota('Aponte o centro da imagem para um cartão cinza ou branco: o CAMZRO diz a temperatura da luz.')}`
}

function folhaFoco() {
  const cap = S.capacidades || {}
  const d = S.ajustes?.foco ?? A.camera.distancia
  const corpo = cap.focoManual
    ? `${grupo('', segmentos('camera.foco', [{ v: 'auto', r: 'Auto' }, { v: 'travado', r: 'Travar' }, { v: 'manual', r: 'Manual' }], A.camera.foco))}
       ${A.camera.foco === 'manual' ? grupo('', `<div class="cartao dial"><div class="dial__valor"><b>${Number(d || 0).toFixed(2)} m</b><small>${cap.foco.min}–${cap.foco.max}</small></div><input type="range" min="${cap.foco.min}" max="${cap.foco.max}" step="${cap.foco.passo || 0.01}" value="${d || cap.foco.min}" data-campo="camera.distancia" data-num aria-label="Distância de foco" /></div>`) : ''}`
    : `${semControle('o foco')}${cap.travaFoco ? grupo('', segmentos('camera.foco', [{ v: 'auto', r: 'Auto' }, { v: 'travado', r: 'Travar' }], A.camera.foco)) : ''}`
  return `${topo('', 'Foco')}${corpo}
    ${grupo('Ajuda', cartao([interruptor('monitor.pico', A.monitor.pico, 'Peaking', 'Bordas em foco ganham cor'), linha('Lupa', `<button type="button" class="glass-btn glass-btn--pequeno" data-ferramenta="lupa">${S.lupa ? 'Desligar' : '4×'}</button>`, 'Dois toques na imagem também')]))}
    ${nota(S.capacidades?.pontos ? 'Toque na imagem para focar e expor ali.' : 'Toque na imagem: quando o aparelho deixa, foca ali.')}`
}

function folhaZoom() {
  const z = S.capacidades?.zoom
  if (!z) return `${topo('', 'Zoom')}${semControle('o zoom')}`
  const atual = S.ajustes?.zoom || A.camera.zoom
  const marcas = [1, 1.5, 2, 3, 5, 10].filter((v) => v >= z.min && v <= z.max)
  return `${topo('', 'Zoom')}${grupo('', `<div class="cartao dial"><div class="dial__valor"><b>${Number(atual).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×</b><small>até ${z.max}×</small></div><input type="range" min="${z.min}" max="${z.max}" step="${z.passo || 0.1}" value="${atual}" data-campo="camera.zoom" data-num aria-label="Zoom" />${segmentos('camera.zoom', marcas.map((v) => ({ v, r: `${v}×` })), atual, { num: true })}</div>`)}
    ${nota('Zoom digital acima da lente perde nitidez. Pinça com dois dedos na imagem também.')}
    ${S.capacidades?.tocha ? grupo('', cartao([interruptor('camera.tocha', A.camera.tocha, 'Luz (tocha)')])) : ''}`
}

// ───────── formato ─────────

function folhaFormato() {
  const g = S.oQueGrava || { codecs: {}, audio: {} }
  const p = perfil()
  const bps = p.bitrate + (p.audio ? bitrateAudio({ codec: p.audio }) : 0)
  const cabe = S.espaco ? tempoTexto(segundosQueCabem(S.espaco.livre, bps)) : '—'
  const codecs = [{ v: 'auto', r: 'Auto' }, ...CODECS_VIDEO.map((c) => ({ v: c.id, r: c.rotulo, desligado: !g.codecs?.[c.id] }))]
  const motorTexto = p.motor === 'webcodecs' ? 'WebCodecs: cadência constante, bitrate e quadro-chave no seu controle.' : 'Gravador simples do navegador: sem quadro-chave nem cadência fixa.'
  return `${topo('', 'Formato')}
    ${grupo('Tamanho', segmentos('formato.resolucao', RESOLUCOES.map((r) => ({ v: r.id, r: r.rotulo })), A.formato.resolucao))}
    ${grupo('Cadência', segmentos('formato.cadencia', CADENCIAS.filter((c) => c.nominal <= 60).map((c) => ({ v: c.id, r: c.rotulo })), A.formato.cadencia))}
    ${grupo('Codec', segmentos('formato.codec', codecs, A.formato.codec))}
    ${grupo('Qualidade', `${segmentos('formato.nivel', [{ v: 'padrao', r: 'Padrão' }, { v: 'alta', r: 'Alta' }, { v: 'maxima', r: 'Máxima' }, { v: 'manual', r: 'Manual' }], A.formato.nivel)}${A.formato.nivel === 'manual' ? `<div class="cartao dial"><div class="dial__valor"><b>${bitrateTexto(p.bitrate)}</b><small>vídeo</small></div><input type="range" min="4" max="400" step="1" value="${Math.round(p.bitrate / 1e6)}" data-campo="formato.bitrateMb" data-num aria-label="Bitrate em Mb/s" /></div>` : ''}`)}
    ${grupo(
      'Avançado',
      cartao([
        linha('Bitrate', selecao('formato.modoBitrate', [{ v: 'variable', r: 'Variável' }, { v: 'constant', r: 'Constante' }], A.formato.modoBitrate)),
        linha('Quadro-chave', selecao('formato.quadroChave', [{ v: 0, r: 'Todo quadro (intra)' }, { v: 0.5, r: 'A cada 0,5 s' }, { v: 1, r: 'A cada 1 s' }, { v: 2, r: 'A cada 2 s' }], A.formato.quadroChave, { num: true }), 'Intra: edita leve, arquivo maior'),
        linha('Arquivo', selecao('formato.conteiner', [{ v: 'mov', r: 'MOV (edição)' }, { v: 'mp4', r: 'MP4 (compartilhar)' }], A.formato.conteiner)),
        linha('Áudio', selecao('formato.audio', [{ v: 'pcm-s24', r: 'PCM 24 bits' }, { v: 'pcm-s16', r: 'PCM 16 bits' }, { v: 'aac', r: 'AAC 256', desligado: !g.audio?.aac }, { v: 'sem', r: 'Sem áudio' }].filter((o) => !o.desligado), A.formato.audio)),
        interruptor('formato.fecharTake', A.formato.fecharTake, 'Fechar o take ao parar', 'Reempacota em MOV/MP4 comum, sem recomprimir'),
      ]),
    )}
    ${nota(`<b>${bitrateTexto(p.bitrate)}</b> · cabem <b>${cabe}</b> neste aparelho. ${motorTexto}`)}`
}

// ───────── monitor ─────────

function folhaMonitor() {
  const m = A.monitor
  return `${topo('', 'Monitor')}
    ${grupo('Exposição', cartao([interruptor('monitor.falsaCorLigada', m.falsaCorLigada, 'Falsa cor'), linha('Escala', selecao('monitor.falsaCor', Object.entries(FALSA_COR).map(([v, t]) => ({ v, r: t.nome })), m.falsaCor)), interruptor('monitor.zebra', m.zebra, 'Zebra'), linha('Zebra em', selecao('monitor.zebraModo', [{ v: 'acima', r: 'Acima de' }, { v: 'faixa', r: 'Faixa ±5' }], m.zebraModo)), linha('Nível', selecao('monitor.zebraNivel', [100, 98, 95, 90, 80, 70, 60, 55].map((v) => ({ v, r: `${v}%` })), m.zebraNivel, { num: true }), 'Pele: faixa em 70%')]))}
    ${grupo('Scopes', segmentos('monitor.scopes', [{ v: '', r: 'Nenhum' }, { v: 'histograma', r: 'Histograma' }, { v: 'onda', r: 'Onda' }, { v: 'parade', r: 'RGB' }, { v: 'vetor', r: 'Vetor' }], m.scopes))}
    ${grupo('Foco', cartao([interruptor('monitor.pico', m.pico, 'Peaking'), linha('Cor', selecao('monitor.picoCor', Object.keys(E.CORES_PICO).map((v) => ({ v, r: v[0].toUpperCase() + v.slice(1) })), m.picoCor)), linha('Sensibilidade', `<input type="range" min="0" max="1" step="0.05" value="${m.picoSensibilidade}" data-campo="monitor.picoSensibilidade" data-num aria-label="Sensibilidade do peaking" />`), interruptor('monitor.mono', m.mono, 'Preto e branco')]))}
    ${grupo('Guias', `${segmentos('monitor.guia', [{ v: '', r: 'Nenhuma' }, ...PROPORCOES.map((p) => ({ v: p.id, r: p.rotulo }))], m.guia)}${cartao([interruptor('monitor.grade', m.grade, 'Terços'), interruptor('monitor.aurea', m.aurea, 'Proporção áurea'), interruptor('monitor.centro', m.centro, 'Centro'), interruptor('monitor.segura', m.segura, 'Área segura', '90% e 80%'), interruptor('monitor.nivel', m.nivel, 'Nível', `<button type="button" class="glass-btn glass-btn--pequeno" data-acao="zerar-nivel">Zerar</button>`)])}`)}
    ${grupo('Lente', cartao([linha('Anamórfico', selecao('monitor.anamorfico', ANAMORFICOS.map((v) => ({ v, r: v === 1 ? 'Não' : `${String(v).replace('.', ',')}×` })), m.anamorfico, { num: true }), 'A prévia desespreme; o arquivo fica como gravou'), interruptor('monitor.espelho', m.espelho, 'Espelhar a prévia'), linha('Lente', campoTexto('camera.lente', A.camera.lente, { max: 40, rotulo: 'Lente' }), 'Vai na ficha do clipe')]))}
    ${grupo('LUT de monitor', `${cartao([linha(S.lutNome || 'Nenhuma', S.lutNome ? `<button type="button" class="glass-btn glass-btn--pequeno" data-acao="tirar-lut">Tirar</button>` : '', 'Só na tela: o arquivo grava limpo')])}<div class="acoes-folha"><button type="button" class="glass-btn glass-btn--pequeno" data-acao="carregar-lut">Carregar .cube</button></div>`)}`
}

// ───────── claquete ─────────

function folhaClaquete() {
  const k = A.claquete
  return `${topo('', 'Claquete')}
    ${grupo(
      '',
      cartao([
        linha('Projeto', campoTexto('claquete.projeto', k.projeto, { max: 60, rotulo: 'Projeto' })),
        linha('Cena', campoTexto('claquete.cena', k.cena, { max: 8, rotulo: 'Cena' })),
        linha('Plano', campoTexto('claquete.plano', k.plano, { max: 6, rotulo: 'Plano' })),
        linha('Take', `<input type="number" min="1" max="999" data-campo="claquete.take" data-num value="${k.take}" aria-label="Take" />`),
        linha('Câmera', selecao('claquete.camera', cl.CAMERAS.slice(0, 8).map((v) => ({ v, r: v })), k.camera)),
        linha('Rolo', `<b>${cl.nomeDoRolo(k.camera, k.rolo)}</b>`, `Próximo clipe C${String(k.clipe).padStart(3, '0')}`),
      ]),
    )}
    <div class="acoes-folha">
      <button type="button" class="glass-btn glass-btn--pequeno" data-acao="novo-plano">Novo plano</button>
      <button type="button" class="glass-btn glass-btn--pequeno" data-acao="nova-cena">Nova cena</button>
      <button type="button" class="glass-btn glass-btn--pequeno" data-acao="novo-rolo">Novo rolo</button>
      <button type="button" class="glass-btn glass-btn--pequeno" data-acao="bom-take" title="Marca o último clipe">Bom take</button>
    </div>
    ${blocoRoteiro()}
    ${grupo('Sincronia', `${cartao([interruptor('sincronia.bip', A.sincronia.bip, 'Bip ao gravar', 'Bip de 1 kHz e flash: o Synquei sincroniza com o gravador de som')])}<div class="acoes-folha"><button type="button" class="glass-btn glass-btn--pequeno" data-acao="slate">Claquete na tela</button><button type="button" class="glass-btn glass-btn--pequeno" data-acao="bater">Bater agora</button></div>`)}
    ${grupo('Equipe', cartao([linha('Direção', campoTexto('claquete.diretor', k.diretor, { max: 40, rotulo: 'Direção' })), linha('Fotografia', campoTexto('claquete.fotografo', k.fotografo, { max: 40, rotulo: 'Fotografia' }))]))}
    ${nota('O take sobe sozinho a cada gravação. Cena, plano e take vão na ficha do clipe, no CSV do DaVinci e no ALE.')}`
}

/** O roteiro do Maestro: a decupagem vira a lista da claquete. */
function blocoRoteiro() {
  const r = S.roteiro
  if (!r) return grupo('Roteiro', `<div class="acoes-folha"><button type="button" class="glass-btn glass-btn--pequeno" data-acao="importar-roteiro">Trazer do Maestro</button></div>${nota('No Maestro: Roteiro › Enviar › Arquivo para a edição (.maestro.json). Cena e planos entram na claquete, com a lente.')}`)
  const { cena, plano } = posicao(r, A.claquete)
  const planos = cena ? cena.planos.map((p) => ({ v: p.letra, r: p.letra, dica: p.descricao })) : []
  return grupo(
    `Roteiro · ${r.titulo}${r.versao ? ` v${r.versao}` : ''}`,
    `${cartao([linha(cena ? `Cena ${cena.numero} · ${cena.titulo}` : 'Fora do roteiro', '', esc(cena?.cabecalho || '')), linha(plano ? `Plano ${plano.letra}` : 'Plano', '', esc([plano?.descricao, plano?.lente, plano?.fps ? `${plano.fps} fps` : null].filter(Boolean).join(' · ')))])}
     ${planos.length ? segmentos('roteiro.plano', planos, A.claquete.plano) : ''}
     <div class="acoes-folha"><button type="button" class="glass-btn glass-btn--pequeno glass-btn--ink" data-acao="plano-seguinte"${seguinte(r, A.claquete) ? '' : ' disabled'}>Próximo plano</button>${segmentos('roteiro.cena', r.cenas.filter((c) => c.planos.length).map((c) => ({ v: String(c.numero), r: `Cena ${c.numero}` })), A.claquete.cena)}<button type="button" class="glass-btn glass-btn--pequeno" data-acao="tirar-roteiro">Tirar</button></div>`,
  )
}

/** Vai para um plano do roteiro: cena, plano, take 1 e a lente que o roteiro pede. */
function irParaPlano(cenaNum, letra) {
  const r = S.roteiro
  const c = { ...A.claquete, cena: String(cenaNum), plano: letra || r.cenas.find((x) => String(x.numero) === String(cenaNum))?.planos[0]?.letra || 'A', take: 1 }
  definir('claquete', c)
  const { plano } = posicao(r, c)
  if (plano?.lente) definir('camera.lente', plano.lente)
  if (plano?.fps && Math.abs(plano.fps - cadencia().fps) > 0.01) avisar(`O roteiro pede ${String(plano.fps).replace('.', ',')} fps neste plano.`, { ms: 4000 })
}

// ───────── ajustes (o menu) ─────────

function folhaAjustes() {
  const item = (folha, icone, rotulo, apoio = '') => `<button type="button" class="linha" data-folha="${folha}"><span>${esc(rotulo)}${apoio ? `<small>${esc(apoio)}</small>` : ''}</span>${svg(icone)}</button>`
  const conta = MODO === 'conta' ? 'Conta Absolute ZRO' : MODO === 'previa' ? 'Prévia (sem conta)' : 'Modo local'
  return `${topo('', 'Ajustes')}
    ${grupo('', `<div class="cartao">${[item('formato', 'ajustes', 'Formato'), item('monitor', 'lut', 'Monitor'), item('claquete', 'claquete', 'Claquete'), item('biblioteca', 'biblioteca', 'Clipes'), item('presets', 'preset', 'Presets'), item('calculadora', 'calculadora', 'Calculadora do set'), item('aparelho', 'trocar', 'Câmera e microfone')].join('')}</div>`)}
    ${grupo('', cartao([linha('Tema', segmentos('tema', [{ v: 'claro', r: 'Claro' }, { v: 'escuro', r: 'Escuro' }], A.tema))]))}
    ${grupo('Ecossistema', cartao([linha(conta, MODO === 'conta' ? `<button type="button" class="glass-btn glass-btn--pequeno" data-acao="sair">Sair</button>` : ''), linha('Apps Absolute ZRO', `<a class="glass-btn glass-btn--pequeno" href="https://absolutezro.com/ferramentas" target="_blank" rel="noopener">Abrir</a>`)]))}
    ${nota(`Aparelho <b>${esc(S.aparelho)}</b> · nada sai daqui sem você mandar.`)}`
}

async function folhaAparelho() {
  const cap = S.capacidades || {}
  let d = { cameras: [], microfones: [] }
  try {
    d = await dispositivos()
  } catch {}
  const tem = (ok, t) => `<span class="${ok ? '' : 'nao'}">${svg(ok ? 'ok' : 'fechar')}${esc(t)}</span>`
  const a = S.ajustes || {}
  return `${topo('Câmera e', 'microfone')}
    ${grupo('Câmera', cartao([linha('Câmera', selecao('camera.camera', [{ v: '', r: 'Traseira' }, ...d.cameras.map((c) => ({ v: c.id, r: c.nome }))], A.camera.camera)), linha('Microfone', selecao('camera.microfone', [{ v: '', r: 'Padrão' }, ...d.microfones.map((c) => ({ v: c.id, r: c.nome }))], A.camera.microfone))]))}
    <div class="acoes-folha"><button type="button" class="glass-btn glass-btn--pequeno" data-acao="frente">${A.camera.voltada === 'user' ? 'Usar a traseira' : 'Usar a da frente'}</button></div>
    ${grupo('Entregando agora', nota(`<b>${a.largura || '—'}×${a.altura || '—'}</b> a <b>${a.fps ? Math.round(a.fps * 100) / 100 : '—'} fps</b> · áudio ${a.audio ? `<b>${a.audio.taxa ? `${a.audio.taxa / 1000} kHz` : '—'}</b>, ${a.audio.canais || 1} canal${(a.audio.canais || 1) > 1 ? 'is' : ''}${a.audio.eco || a.audio.ruido || a.audio.ganho ? ' (o navegador forçou processamento de voz)' : ', sem processamento'}` : '—'}`))}
    ${grupo('Este aparelho deixa', `<div class="capaz">${[tem(cap.exposicaoManual, 'ISO e obturador'), tem(cap.balancoManual, 'Kelvin'), tem(cap.focoManual, 'Foco manual'), tem(Boolean(cap.zoom), 'Zoom'), tem(cap.tocha, 'Tocha'), tem(cap.pontos, 'Toque para focar'), tem(Boolean(S.oQueGrava?.webcodecs), 'Gravação profissional'), tem(Boolean(S.oQueGrava?.codecs?.hevc), 'HEVC'), tem(Boolean(window.isSecureContext && navigator.storage?.getDirectory), 'Armazém à prova de queda')].join('')}</div>`)}
    ${nota('Câmera externa (USB, placa de captura HDMI) aparece na lista quando ligada.')}`
}

// ───────── presets ─────────

function folhaPresets() {
  const lista = E.presets()
  return `${topo('', 'Presets')}
    ${grupo('', cartao([linha('Nome', campoTexto('preset.nome', S.nomePreset || '', { max: 40, rotulo: 'Nome do preset' })), linha('', `<button type="button" class="glass-btn glass-btn--pequeno glass-btn--ink" data-acao="salvar-preset">Guardar o atual</button>`)]))}
    ${lista.length ? grupo('Guardados', cartao(lista.map((p, i) => linha(p.nome, `<button type="button" class="glass-btn glass-btn--pequeno" data-acao="usar-preset" data-i="${i}">Usar</button><button type="button" class="glass-btn glass-btn--pequeno" data-acao="levar-preset" data-i="${i}" title="Salva um .camzro.json para outro aparelho">Levar</button><button type="button" class="fechar" data-acao="apagar-preset" data-i="${i}" aria-label="Apagar">${svg('lixo')}</button>`, `${p.ajustes.formato.resolucao.toUpperCase()} · ${p.ajustes.formato.cadencia} fps`)))) : ''}
    <div class="acoes-folha"><button type="button" class="glass-btn glass-btn--pequeno" data-acao="trazer-preset">Trazer de outro aparelho</button></div>
    ${nota('Formato, monitor e exposição num toque. A contagem da claquete não muda.')}`
}

// ───────── calculadora ─────────

function folhaCalculadora() {
  const c = cadencia()
  const desejado = { tempo: exp.anguloParaTempo(180, c.fps), iso: S.capacidades?.iso?.min || 100 }
  const medido = S.medidaAuto || (S.ajustes?.tempo && S.ajustes?.iso ? { tempo: S.ajustes.tempo, iso: S.ajustes.iso } : null)
  let nd = nota('Deixe a exposição no automático por um instante: o CAMZRO mede e diz o ND.')
  if (medido) {
    const r = exp.ndNecessario(medido, desejado)
    nd = r.nd
      ? nota(`O automático está em <b>${exp.fracao(medido.tempo)}</b> a ISO <b>${Math.round(medido.iso)}</b>. Para <b>180°</b> (${exp.fracao(desejado.tempo)}) a ISO ${desejado.iso}: <b>ND ${String(r.nd).replace('.', ',')}</b> (${exp.stopsTexto(exp.stopsDaDensidade(r.nd))})${Math.abs(r.ajusteIso) >= 0.17 ? ` e ISO ${exp.stopsTexto(r.ajusteIso)}` : ''}.`)
      : nota(`Não precisa de ND para 180° agora${r.ajusteIso > 0.17 ? `: falta luz (${exp.stopsTexto(r.ajusteIso)} de ISO)` : ''}.`)
  }
  const lentas = [48, 50, 60, 120].filter((f) => f > c.fps + 0.5).map((f) => `${f} → ${c.rotulo}: <b>${String(exp.camaraLenta(f, c.fps).fator.toFixed(2)).replace('.', ',')}×</b>`)
  const af = (hz) =>
    exp
      .antiFlicker(hz, c.fps)
      .seguros.map((s) => `${exp.anguloTexto(s.angulo)}`)
      .join(' · ')
  return `${topo('Calculadora', 'do set')}
    ${grupo('ND para 180°', nd)}
    ${grupo(`Sem flicker a ${c.rotulo} fps`, nota(`50 Hz: <b>${af(50) || '—'}</b><br>60 Hz: <b>${af(60) || '—'}</b>`))}
    ${grupo('Câmera lenta', nota(lentas.join('<br>') || 'Já está na cadência mais alta.'))}
    ${grupo('ND', nota('0,3 = 1 stop · 0,6 = 2 · 0,9 = 3 · 1,2 = 4 · 1,8 = 6 · 3,0 = 10. ND8 = 0,9.'))}`
}

// ───────── a máquina das folhas ─────────

const FOLHAS = { iso: folhaIso, obturador: folhaObturador, balanco: folhaBalanco, foco: folhaFoco, zoom: folhaZoom, formato: folhaFormato, monitor: folhaMonitor, claquete: folhaClaquete, ajustes: folhaAjustes, aparelho: folhaAparelho, presets: folhaPresets, calculadora: folhaCalculadora, biblioteca: folhaBiblioteca }

let aberta = null
export const folhaAberta = () => aberta

export async function abrirFolha(nome) {
  if (!FOLHAS[nome]) return
  aberta = nome
  const corpo = $('folha-corpo')
  const rolagem = corpo.dataset.aberta === nome ? corpo.scrollTop : 0
  corpo.dataset.aberta = nome
  corpo.innerHTML = await FOLHAS[nome]()
  pintar(corpo)
  $('folha').hidden = false
  corpo.scrollTop = rolagem
  if (nome === 'biblioteca') ligarBiblioteca(corpo)
}
export const redesenharFolha = () => aberta && abrirFolha(aberta)
export function fecharFolha() {
  aberta = null
  $('folha').hidden = true
  $('folha-corpo').innerHTML = ''
  $('folha-corpo').dataset.aberta = ''
}

function valorDe(el) {
  const v = el.dataset.v ?? el.value
  return 'num' in el.dataset ? Number(v) : v
}

function mudar(caminho, valor) {
  if (caminho === 'roteiro.plano') return irParaPlano(A.claquete.cena, valor)
  if (caminho === 'roteiro.cena') return irParaPlano(valor)
  if (caminho === 'formato.bitrateMb') return definir('formato.bitrate', valor * 1e6)
  if (caminho === 'preset.nome') return void (S.nomePreset = valor)
  if (caminho === 'camera.angulo') {
    // ângulo escolhido: o tempo segue a cadência (o tempo fixo some)
    definir('camera.tempo', 0)
  }
  if (caminho === 'camera.voltada') definir('camera.camera', '')
  definir(caminho, valor)
}

export function registrarFolhas() {
  const corpo = $('folha-corpo')
  corpo.addEventListener('click', async (e) => {
    const set = e.target.closest('[data-set]')
    if (set) {
      mudar(set.dataset.set, valorDe(set))
      return redesenharFolha()
    }
    const alt = e.target.closest('[data-alternar]')
    if (alt) {
      const [g, k] = alt.dataset.alternar.split('.')
      mudar(alt.dataset.alternar, !A[g][k])
      return redesenharFolha()
    }
    const ir = e.target.closest('[data-folha]')
    if (ir) return abrirFolha(ir.dataset.folha)
    const ac = e.target.closest('[data-acao]')
    if (!ac) return
    const i = Number(ac.dataset.i)
    switch (ac.dataset.acao) {
      case 'fechar-folha':
        return fecharFolha()
      case 'carregar-lut':
        return $('arquivo-lut').click()
      case 'tirar-lut':
        return tirarLut()
      case 'zerar-nivel':
        return zerarNivel()
      case 'novo-plano':
        definir('claquete', cl.novoPlano(A.claquete))
        return redesenharFolha()
      case 'nova-cena':
        definir('claquete', cl.novaCena(A.claquete))
        return redesenharFolha()
      case 'novo-rolo':
        definir('claquete', cl.novoRolo(A.claquete))
        avisar(`Rolo ${cl.nomeDoRolo(A.claquete.camera, A.claquete.rolo)}`)
        return redesenharFolha()
      case 'bom-take': {
        const { marcarBom } = await import('./biblioteca.js')
        return marcarBom()
      }
      case 'slate':
        fecharFolha()
        return abrirSlate()
      case 'frente':
        mudar('camera.voltada', A.camera.voltada === 'user' ? 'environment' : 'user')
        return redesenharFolha()
      case 'medir-cinza': {
        const rgb = S.monitor?.amostra(0.5, 0.5)
        const k = rgb && kelvinDeRgb(...rgb)
        if (!k) return avisar('Não deu para medir: a imagem está escura demais.')
        avisar(`Luz em ~${Math.round(k / 50) * 50} K`)
        if (S.capacidades?.balancoManual) {
          definir('camera.balanco', 'manual')
          definir('camera.kelvin', Math.round(k / 50) * 50)
        }
        return redesenharFolha()
      }
      case 'salvar-preset': {
        const nome = (S.nomePreset || '').trim() || `${A.formato.resolucao.toUpperCase()} ${A.formato.cadencia}`
        E.guardarPreset(E.paraPreset(nome, A))
        avisar(`Preset ${nome} guardado.`)
        return redesenharFolha()
      }
      case 'usar-preset': {
        const p = E.presets()[i]
        if (p) substituirAjustes(E.aplicarPreset(A, p))
        avisar(`Preset ${p?.nome} em uso.`)
        return redesenharFolha()
      }
      case 'apagar-preset': {
        const p = E.presets()[i]
        if (p) E.apagarPreset(p.nome)
        return redesenharFolha()
      }
      case 'levar-preset': {
        const p = E.presets()[i]
        if (!p) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }))
        a.download = `${cl.campo(p.nome, 40).replace(/\s+/g, '-') || 'preset'}.camzro.json`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
        return
      }
      case 'trazer-preset':
        return $('arquivo-preset').click()
      case 'importar-roteiro':
        return $('arquivo-roteiro').click()
      case 'tirar-roteiro':
        S.roteiro = null
        E.guardarRoteiro(null)
        return redesenharFolha()
      case 'plano-seguinte': {
        const s = seguinte(S.roteiro, A.claquete)
        if (s) irParaPlano(s.cena, s.plano)
        return redesenharFolha()
      }
      case 'sair': {
        const sair = document.querySelector('meta[name="camzro-sair"]')?.content
        if (sair) await fetch(sair, { method: 'POST', credentials: 'same-origin' }).catch(() => {})
        return location.reload()
      }
    }
  })
  const aoCampo = (e) => {
    const el = e.target.closest('[data-campo]')
    if (!el) return
    const v = valorDe(el)
    if (el.type === 'range' && e.type === 'input') {
      // arrastar: aplica na câmera na hora; redesenha só no fim
      mudar(el.dataset.campo, v)
      const b = el.closest('.dial')?.querySelector('.dial__valor b')
      if (b && el.dataset.campo === 'camera.kelvin') b.textContent = `${v}K`
      if (b && el.dataset.campo === 'camera.distancia') b.textContent = `${Number(v).toFixed(2)} m`
      if (b && el.dataset.campo === 'camera.zoom') b.textContent = `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×`
      if (b && el.dataset.campo === 'formato.bitrateMb') b.textContent = bitrateTexto(v * 1e6)
      return
    }
    if (el.type === 'text' && e.type === 'input') return
    mudar(el.dataset.campo, v)
    if (el.tagName === 'SELECT' || el.type === 'number' || el.type === 'range') redesenharFolha()
  }
  corpo.addEventListener('input', aoCampo)
  corpo.addEventListener('change', aoCampo)
  $('arquivo-roteiro').addEventListener('change', async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const r = lerRoteiro(await f.text())
      if (!r.cenas.some((c) => c.planos.length)) throw new ErroRoteiro('Este roteiro ainda não tem planos (decupagem).')
      S.roteiro = r
      E.guardarRoteiro(r)
      const primeira = r.cenas.find((c) => c.planos.length)
      irParaPlano(primeira.numero, primeira.planos[0].letra)
      avisar(`Roteiro ${r.titulo} na claquete.`)
    } catch (err) {
      avisar(err instanceof ErroRoteiro ? err.message : 'Não deu para ler o roteiro.', { ruim: true })
    }
    redesenharFolha()
  })
  $('arquivo-preset').addEventListener('change', async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      if (f.size > 100_000) throw new Error()
      const p = JSON.parse(await f.text())
      substituirAjustes(E.aplicarPreset(A, p))
      E.guardarPreset({ ...E.paraPreset(p.nome, A) })
      avisar(`Preset ${cl.campo(p.nome, 40)} trazido.`)
      redesenharFolha()
    } catch {
      avisar('Não é um preset do CAMZRO.', { ruim: true })
    }
  })
  void reabrir
  void bytesTexto
}
