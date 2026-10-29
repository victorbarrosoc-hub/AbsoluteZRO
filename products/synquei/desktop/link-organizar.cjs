// "Preparar no Synquei" vindo do SOBEDESCE: synquei://organizar?pasta=<caminho absoluto>&tipo=<id> (Backup Automático)
// ou …&op=<id da operação> (download do Drive; a operação precisa existir no manifesto da pasta, desktop/organizador.cjs).
// O sistema entrega o link ao app (open-url no Mac, argv no Windows). Aqui só a leitura; quem pergunta à pessoa e
// adiciona a pasta é o desktop/main.cjs. O tipo só vale se for um dos de app/js/tipos.js (senão a pessoa escolhe).

const path = require('node:path')

// id → nome (o mesmo de app/js/tipos.js; tests/link-organizar.test.mjs confere)
const TIPOS = {
  videoclipe: 'Videoclipe',
  show: 'Show ao vivo',
  dvd: 'DVD · Gravação ao vivo',
  sessao: 'EP · Sessão ao vivo',
  entrevista: 'Entrevista',
  podcast: 'Podcast · Videocast',
  documentario: 'Documentário',
  conteudo: 'Vídeo de conteúdo',
  aula: 'Aula · Curso online',
  casamento: 'Casamento',
  evento: 'Evento · Palestra',
  culto: 'Culto · Celebração',
  ficcao: 'Curta · Filme · Série',
  publicidade: 'Publicidade',
  espetaculo: 'Teatro · Dança',
  esporte: 'Esporte · Ação',
  outro: 'Outro',
}

const OP = /^[A-Za-z0-9_-]{6,100}$/

/** { pasta, tipo, op } do link, ou null se não for um link de organizar válido (op estranho = link inválido). */
function lerLinkOrganizar(link) {
  let u
  try {
    u = new URL(String(link || ''))
  } catch {
    return null
  }
  if (u.protocol !== 'synquei:' || u.hostname !== 'organizar') return null
  const pasta = u.searchParams.get('pasta') || ''
  if (!pasta || pasta.includes('\0') || !path.isAbsolute(pasta)) return null
  const tipo = u.searchParams.get('tipo')
  const op = u.searchParams.get('op')
  if (op != null && !OP.test(op)) return null
  return { pasta: path.resolve(pasta), tipo: Object.hasOwn(TIPOS, tipo || '') ? tipo : null, op: op || null }
}

/** O link no meio dos argumentos (Windows abre o app com o link no argv). */
const linkNoArgv = (argv) => (Array.isArray(argv) ? argv.find((a) => typeof a === 'string' && /^synquei:\/\/organizar/i.test(a)) : null) || null

module.exports = { TIPOS, lerLinkOrganizar, linkNoArgv }
