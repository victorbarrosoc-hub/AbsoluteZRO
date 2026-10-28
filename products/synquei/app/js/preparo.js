// Recibo do download do Drive (desktop/manifesto-drive.cjs, synquei.preparo/1): o que a página conta ao SOBEDESCE
// depois de preparar a pasta. Função pura (dá para testar no Node). Só conta o que o projeto mostra de fato:
//  - organizados: arquivos da operação que viraram clipe pronto no projeto;
//  - sincronizados: desses, os que entraram na linha do tempo;
//  - revisar: sincronia ambígua (confiança baixa, o laranja da linha do tempo) que ninguém ajustou à mão;
//  - ignorados: arquivos da operação que o Synquei não usa (não são mídia) ou que não abriram.
// Ausentes, movidos e alterados vêm da conferência do disco (o processo principal soma no recibo).

const REVISAR_CONF = 0.5 // o mesmo limite das pendências da linha do tempo (pendencias.js)

/**
 * @param {object} p projeto (S.project)
 * @param {{ arquivos: { rel: string }[] }} ev a operação (evento do Organizar)
 * @returns {{ estado: 'preparado'|'com_pendencias', resultado: object, exemplos: { revisar: string[] } }}
 */
export function resumoPreparo(p, ev) {
  const rels = new Set((ev.arquivos || []).map((a) => a.rel))
  const clips = (p.clips || []).filter((c) => rels.has(c.relPath))
  const prontos = clips.filter((c) => c.status === 'ready')
  const sincronizados = p.result ? prontos.filter((c) => c.sync) : []
  const revisar = sincronizados.filter((c) => c.sync.conf < REVISAR_CONF && !String(c.sync.method || '').startsWith('manual'))
  const usados = new Set(clips.map((c) => c.relPath))
  const ignorados = (p.ignored || []).filter((i) => rels.has(i.relPath) && !usados.has(i.relPath)).length + clips.filter((c) => c.status === 'error').length
  const resultado = { organizados: prontos.length, sincronizados: sincronizados.length, ignorados, revisar: revisar.length }
  return { estado: revisar.length ? 'com_pendencias' : 'preparado', resultado, exemplos: { revisar: revisar.map((c) => c.relPath).slice(0, 30) } }
}
