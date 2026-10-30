// Tela de entrada (decisão do titular, 29/10/2026; Plano de Integração §7–8: a tarefa principal vem primeiro). Sem rota
// no endereço o app abre no Início (a Z nunca é a entrada: fica discreta no pé da barra lateral e num anel no Início do
// celular, em #/z); se, logo ao abrir, houver cartão na fila do Organizar (o que chegou
// com o app fechado ou ficou pela metade) ou sincronia rodando, vai direto para a tela da tarefa. Uma vez, nos primeiros
// segundos e só se a pessoa ainda não mexeu. Rota no endereço (#/midia, #/organizar...) e o "Abrir no Synquei" do
// SOBEDESCE (synquei:org-abrir → Organizar) são respeitados sempre. Sem dependências: teste em tests/entrada.test.mjs.

export const JANELA_MS = 8000

/** O endereço não pede tela nenhuma (o app escolhe a entrada)? */
export function semRota(hash, rotas) {
  const r = String(hash || '')
    .replace(/^#\/?/, '')
    .split('/')[0]
  return !r || !rotas.includes(r)
}

/**
 * A tela da tarefa em curso, ou null.
 * @param {{ sync?: { running?: boolean }, org?: { atual?: object|null, fila?: unknown[] } }} estado
 */
export function telaDaTarefa({ sync, org } = {}) {
  if (sync?.running) return 'sincronizar'
  if (org?.atual || (org?.fila?.length ?? 0) > 0) return 'organizar'
  return null
}

/**
 * Decide uma vez depois que o Organizar contou o que ficou pendente. `ir` só é chamado se o endereço ainda não pede
 * tela (a pessoa não navegou), dentro da janela e com tarefa em curso.
 */
export function decidirEntrada({ hashInicial, hashAgora, rotas, estado, inicio, agora, ir, janelaMs = JANELA_MS }) {
  if (!semRota(hashInicial, rotas) || !semRota(hashAgora, rotas)) return null
  if (agora - inicio > janelaMs) return null
  const tela = telaDaTarefa(estado)
  if (tela) ir(tela)
  return tela
}
