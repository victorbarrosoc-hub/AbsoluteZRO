// Relay · o painel da conta: o que foi convertido e os projetos, guardados no aparelho (o arquivo nunca sai dele; o
// registro também não). Aqui só a conta pura, sem DOM nem IndexedDB (app/historico.js guarda, app/painel.js mostra),
// para o teste rodar no Node.

import { preset as presetDoRelay } from './presets.js'

export const NOME_MAX = 60
export const DESTINOS_MAX = 12
export const HISTORICO_MAX = 500

const texto = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const numero = (v) => (Number.isFinite(v) && v >= 0 ? v : 0)

/**
 * O registro de uma saída pronta: o que entrou, para onde foi e o que saiu. Só números e nomes; nada do conteúdo.
 * `preset`: o preset usado (do Relay ou da pessoa). `resultado`: o do motor ({ bytes, segundos, codecVideo, plano }).
 */
export function registro({ arquivo, info, preset, resultado, nome, projeto = null, quando = Date.now(), id = null }) {
  const v = resultado?.plano?.video
  return {
    id: id ?? `cv-${quando.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    quando,
    projeto: projeto ? texto(projeto, 80) : null,
    entrada: { nome: texto(arquivo?.name), bytes: numero(arquivo?.size), duracao: numero(info?.duracao), video: Boolean(info?.temVideo) },
    preset: { id: texto(preset?.id, 80), nome: texto(preset?.nome, NOME_MAX), icone: texto(preset?.icone, 30) || 'seta', meu: Boolean(preset?.id && !presetDoRelay(preset.id)) },
    saida: {
      nome: texto(nome),
      bytes: numero(resultado?.bytes),
      largura: v ? numero(v.largura) : 0,
      altura: v ? numero(v.altura) : 0,
      codec: texto(resultado?.codecVideo ?? resultado?.codecAudio ?? '', 20),
      pasta: Boolean(resultado && !resultado.blob),
    },
    segundos: numero(resultado?.segundos),
  }
}

/** Os números do topo do painel: quantas, quanto vídeo e quanto espaço a conversão poupou. */
export function numeros(lista) {
  let entrada = 0
  let saida = 0
  let duracao = 0
  for (const r of lista) {
    entrada += r.entrada.bytes
    saida += r.saida.bytes
    duracao += r.entrada.duracao
  }
  return { conversoes: lista.length, entrada, saida, poupado: Math.max(0, entrada - saida), duracao, arquivos: new Set(lista.map((r) => `${r.entrada.nome}|${r.entrada.bytes}`)).size }
}

const DIA = 86_400_000
const doisDigitos = (n) => String(n).padStart(2, '0')

/** "agora", "há 5 min", "hoje, 14:20", "ontem, 09:05", "12/10" ou "12/10/2025". */
export function quando(ts, agora = Date.now()) {
  const d = new Date(ts)
  const s = (agora - ts) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  const hoje = new Date(agora)
  hoje.setHours(0, 0, 0, 0)
  const hora = `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`
  if (ts >= hoje.getTime()) return `hoje, ${hora}`
  if (ts >= hoje.getTime() - DIA) return `ontem, ${hora}`
  const data = `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}`
  return d.getFullYear() === hoje.getFullYear() ? data : `${data}/${d.getFullYear()}`
}

/** Duração somada, curta: "45 s", "12 min", "3 h 05". */
export function duracaoCurta(s) {
  if (s < 60) return `${Math.round(s)} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  const m = Math.round(s / 60)
  return `${Math.floor(m / 60)} h ${doisDigitos(m % 60)}`
}

/**
 * Um projeto: nome e os destinos de sempre (abrir no conversor já marca todos). `existe(id)` diz se um destino vale
 * (preset do Relay ou da pessoa). Erro em português com nome vazio.
 */
export function projeto({ id = null, nome, destinos = [], criado = Date.now(), atualizado = criado }, existe = (d) => Boolean(presetDoRelay(d))) {
  const n = texto(nome, NOME_MAX)
  if (!n) throw new Error('Dê um nome ao projeto.')
  const ds = [...new Set((Array.isArray(destinos) ? destinos : []).filter((d) => typeof d === 'string' && existe(d)))].slice(0, DESTINOS_MAX)
  return { id: id ?? `pj-${criado.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, nome: n, destinos: ds, criado, atualizado }
}

/** Por projeto: { [id]: { conversoes, ultima } }. */
export function porProjeto(lista) {
  const r = {}
  for (const c of lista) {
    if (!c.projeto) continue
    const p = (r[c.projeto] ??= { conversoes: 0, ultima: 0 })
    p.conversoes += 1
    p.ultima = Math.max(p.ultima, c.quando)
  }
  return r
}
