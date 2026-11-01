// Quem atualiza cada ferramenta (ADR 0018, adendo de 28/10/2026): a central grava, na pasta de dados do Absolute ZRO,
// a lista das ferramentas que ela mantém em dia neste computador.
//
//   <pasta de dados do sistema>/Absolute ZRO/apps-gerenciados.json
//   { "versao": 1, "visto": "<ISO>", "apps": { "sobedesce": { "desde": "<ISO>" } } }
//
// `visto` é renovado a cada conferência da central (na abertura e a cada poucas horas). Até a 1.3 o SOBEDESCE e o
// Synquei liam este arquivo para desligar o atualizador próprio. Desde a central única (ADR 0036, 01/11/2026) nenhum
// app se atualiza sozinho (o src/gerenciado.js e o desktop/gerenciado.cjs deles saíram): o arquivo segue gravado só
// para as versões antigas desses apps que ainda estejam instaladas.

const path = require('node:path')

const ARQUIVO = 'apps-gerenciados.json'
const VALIDADE_DIAS = 14
const ID = /^[a-z0-9-]{2,40}$/

/** Monta o conteúdo do arquivo, guardando o `desde` de quem já estava na lista. */
function montar(ids, agora = Date.now(), anterior = null) {
  const antes = anterior && anterior.apps && typeof anterior.apps === 'object' ? anterior.apps : {}
  const apps = {}
  for (const id of [...new Set(ids)].filter((x) => ID.test(x)).sort()) {
    const desde = antes[id] && typeof antes[id].desde === 'string' ? antes[id].desde : new Date(agora).toISOString()
    apps[id] = { desde }
  }
  return { versao: 1, visto: new Date(agora).toISOString(), apps }
}

/** A ferramenta `id` está com a central, e a central deu sinal de vida nos últimos VALIDADE_DIAS? */
function eGerenciado(json, id, agora = Date.now()) {
  if (!json || typeof json !== 'object' || json.versao !== 1 || !json.apps || typeof json.apps !== 'object') return false
  if (!Object.prototype.hasOwnProperty.call(json.apps, id)) return false
  const visto = Date.parse(json.visto)
  if (!Number.isFinite(visto)) return false
  return agora - visto <= VALIDADE_DIAS * 86_400_000 && visto - agora <= 86_400_000
}

function ler(fs, pasta) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pasta, ARQUIVO), 'utf8'))
  } catch {
    return null
  }
}

/** Grava a lista (troca atômica: escreve ao lado e renomeia). Sem disco, fica a lista anterior. */
function gravar(fs, pasta, ids, agora = Date.now()) {
  const conteudo = montar(ids, agora, ler(fs, pasta))
  try {
    fs.mkdirSync(pasta, { recursive: true })
    const tmp = path.join(pasta, `.${ARQUIVO}.${process.pid}`)
    fs.writeFileSync(tmp, JSON.stringify(conteudo, null, 2))
    fs.renameSync(tmp, path.join(pasta, ARQUIVO))
  } catch {
    // sem disco: as ferramentas seguem com o que estava gravado
  }
  return conteudo
}

module.exports = { ARQUIVO, VALIDADE_DIAS, montar, eGerenciado, ler, gravar }
