// "Preparar no Synquei": o projeto do Backup Automático (ou a pasta baixada do Drive) vira um projeto no Synquei. O Synquei já vigia
// <destino>/<Projeto>/.sobedesce/descargas.jsonl; aqui só montamos o link que o app dele entende
// (synquei://organizar?pasta=…&tipo=…) e a lista dos tipos de projeto dele. Ele pergunta antes de adicionar a pasta.
// Os ids batem com products/synquei/app/js/tipos.js (test/synquei-ponte.test.js confere).
import path from 'node:path'

export const TIPOS_SYNQUEI = [
  { id: 'videoclipe', label: 'Videoclipe' },
  { id: 'show', label: 'Show ao vivo' },
  { id: 'dvd', label: 'DVD · Gravação ao vivo' },
  { id: 'sessao', label: 'EP · Sessão ao vivo' },
  { id: 'entrevista', label: 'Entrevista' },
  { id: 'podcast', label: 'Podcast · Videocast' },
  { id: 'documentario', label: 'Documentário' },
  { id: 'conteudo', label: 'Vídeo de conteúdo' },
  { id: 'aula', label: 'Aula · Curso online' },
  { id: 'casamento', label: 'Casamento' },
  { id: 'evento', label: 'Evento · Palestra' },
  { id: 'culto', label: 'Culto · Celebração' },
  { id: 'ficcao', label: 'Curta · Filme · Série' },
  { id: 'publicidade', label: 'Publicidade' },
  { id: 'espetaculo', label: 'Teatro · Dança' },
  { id: 'esporte', label: 'Esporte · Ação' },
  { id: 'outro', label: 'Outro' },
]

// Synquei não instalado: a central do Absolute ZRO (se estiver no computador) abre a página Downloads do HUB, que
// instala conferindo o SHA-256; sem a central, a mesma página no navegador. (No HUB a rota é /baixar.)
export const SYNQUEI_BAIXAR = 'https://absolutezro.com/baixar'
export const CENTRAL_BAIXAR = 'absolutezro://baixar'

const OP = /^[A-Za-z0-9_-]{6,100}$/

/** O id do tipo, se for um que o Synquei conhece; senão null (o Synquei pergunta). */
export const tipoSynquei = (v) => (TIPOS_SYNQUEI.some((t) => t.id === v) ? v : null)

/** synquei://organizar?pasta=<caminho absoluto>[&tipo=<id>][&op=<id da operação>] */
export function linkSynquei(pasta, tipo = null, op = null) {
  if (typeof pasta !== 'string' || !pasta || pasta.includes('\0') || !path.isAbsolute(pasta)) throw new Error('Pasta inválida.')
  const q = new URLSearchParams({ pasta: path.resolve(pasta) })
  const t = tipoSynquei(tipo)
  if (t) q.set('tipo', t)
  if (op != null) {
    if (!OP.test(String(op))) throw new Error('Operação inválida.')
    q.set('op', String(op))
  }
  return `synquei://organizar?${q}`
}

/**
 * O que a ponte do app faz com o pedido (desktop/main.js): abre o Synquei; sem ele, a central ou a página de download.
 * @returns {{ abrir: string|null, para: 'synquei'|'central'|'site'|null }}
 */
export function aberturaSynquei({ link, temSynquei, temCentral }) {
  if (typeof link !== 'string' || !link.startsWith('synquei://organizar?') || link.length > 8192) return { abrir: null, para: null }
  if (temSynquei) return { abrir: link, para: 'synquei' }
  return temCentral ? { abrir: CENTRAL_BAIXAR, para: 'central' } : { abrir: SYNQUEI_BAIXAR, para: 'site' }
}
