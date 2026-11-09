// Menu do item da aba Drive igual ao do Google Drive (titular, 09/11/2026): "Copiar link" com a escolha "Qualquer
// pessoa com o link pode ver" (anyone/leitor, sem aparecer em busca), o selo "Público (link)", a estrela e o menu do
// vazio. Os textos são os mesmos do app de computador (public/lib/compartilhar.js). A escolha do Copiar link pode
// ficar lembrada neste aparelho, mas nunca vira pública sem a pessoa ter escolhido: sem escolha guardada, pergunta.
// Sem dependência do navegador: os testes rodam em Node.

export const LINK_PUBLICO = 'Qualquer pessoa com o link pode ver'
export const LINK_PUBLICO_SUB = 'Leitor. Não aparece em buscas.'
export const LINK_SO_COPIAR = 'Só copiar'
export const LINK_SO_COPIAR_SUB = 'Sem mudar quem tem acesso.'
export const SELO_PUBLICO = 'Público (link)'
export const RESTRITO = 'Restrito'
export const PADRAO_LINK = 'sobedesce.linkPadrao'

// Ids que o Google dá para "qualquer pessoa": com o link (`anyoneWithLink`) ou aberto na busca (`anyone`).
export const PUBLICO_IDS = Object.freeze(['anyoneWithLink', 'anyone'])

/** A escolha guardada do "Copiar link": 'publico', 'copiar' ou null (perguntar). */
export function padraoDoLink(v) {
  return v === 'publico' || v === 'copiar' ? v : null
}

/** O item abre para qualquer pessoa com o link? (permissionIds da listagem; o herdado da pasta de cima conta) */
export function ehPublico(f) {
  return Array.isArray(f?.permissionIds) && f.permissionIds.some((id) => PUBLICO_IDS.includes(id))
}

/** Campos a mais na listagem da aba Drive: a estrela, o selo, o dono e a criação (Detalhes) e quem pode compartilhar. */
export function comCamposDoMenu(fields) {
  const extra = 'starred,permissionIds,createdTime,owners(displayName,emailAddress)'
  return fields.replace('capabilities(', 'capabilities(canShare,') + ',' + extra
}

/**
 * O menu do vazio (segurar no espaço livre ou botão direito): Nova pasta, Enviar arquivos, Enviar pasta. O que não dá
 * fica cinza com o motivo. `dest`: a pasta aberta como destino (null = não recebe nada aqui); `busca`: há uma busca;
 * `pastaInteira`: o navegador escolhe pastas (o iPhone não).
 */
export function acoesDoVazio({ dest, busca = false, pastaInteira = true }) {
  const motivo = busca ? 'Saia da busca para escolher a pasta.' : !dest ? 'Abra uma pasta em que você pode pôr arquivos.' : null
  return [
    { id: 'pasta', icon: 'folder-plus', label: 'Nova pasta', motivo },
    { id: 'arquivos', icon: 'upload', label: 'Enviar arquivos', motivo },
    { id: 'enviar-pasta', icon: 'folder-up', label: 'Enviar pasta', motivo: motivo || (pastaInteira ? null : 'Este aparelho não deixa escolher uma pasta inteira.') },
  ]
}

/**
 * Enviar pasta: agrupa os arquivos de um <input webkitdirectory> pela subpasta (webkitRelativePath), na ordem em que
 * as pastas precisam ser criadas. Devolve [{ caminho: ['Pasta', 'Sub'], arquivos: File[] }]. Pastas sem arquivo
 * direto também entram (para a árvore sair inteira).
 */
export function gruposDaPasta(files) {
  const grupos = new Map()
  for (const f of files) {
    const partes = String(f.webkitRelativePath || f.name).split('/').filter(Boolean)
    const pastas = partes.slice(0, -1)
    for (let i = 1; i <= pastas.length; i++) {
      const k = pastas.slice(0, i).join('/')
      if (!grupos.has(k)) grupos.set(k, { caminho: pastas.slice(0, i), arquivos: [] })
    }
    const k = pastas.join('/')
    if (!grupos.has(k)) grupos.set(k, { caminho: pastas, arquivos: [] })
    grupos.get(k).arquivos.push(f)
  }
  return [...grupos.values()].sort((a, b) => a.caminho.length - b.caminho.length)
}

/** Para onde cada item volta no Desfazer de um mover: { [pai de origem]: [ids] } (sem quem já estava no destino). */
export function voltasDoMover(itens, destId) {
  const out = {}
  for (const f of itens) {
    const de = f.parents?.[0]
    if (!de || de === destId) continue
    ;(out[de] ||= []).push(f.id)
  }
  return out
}
