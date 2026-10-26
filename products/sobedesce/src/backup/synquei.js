// "Abrir no Synquei": o projeto do Backup Automático vira um projeto de edição no Synquei. O Synquei já vigia
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

export const SYNQUEI_BAIXAR = 'https://synquei.vercel.app/#baixar'

/** O id do tipo, se for um que o Synquei conhece; senão null (o Synquei pergunta). */
export const tipoSynquei = (v) => (TIPOS_SYNQUEI.some((t) => t.id === v) ? v : null)

/** synquei://organizar?pasta=<caminho absoluto>[&tipo=<id>] */
export function linkSynquei(pasta, tipo = null) {
  if (typeof pasta !== 'string' || !pasta || pasta.includes('\0') || !path.isAbsolute(pasta)) throw new Error('Pasta inválida.')
  const q = new URLSearchParams({ pasta: path.resolve(pasta) })
  const t = tipoSynquei(tipo)
  if (t) q.set('tipo', t)
  return `synquei://organizar?${q}`
}
