// Seus universos: os projetos guardados sozinhos (autosave) e a lista do painel. No app de desktop, arquivos na pasta
// de dados do app (desktop/main.cjs › projetos:*); no navegador, IndexedDB. A mídia nunca entra aqui: o projeto guarda
// só o caminho (desktop) ou o nome (navegador) de cada arquivo.

const D = globalThis.aiEditDesktop?.projetos || null
const BANCO = 'aeon'
const LOJA = 'projetos'

function abrirBanco() {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA, { keyPath: 'id' })
    r.onsuccess = () => ok(r.result)
    r.onerror = () => falha(r.error)
  })
}
async function transacao(modo, fn) {
  const db = await abrirBanco()
  return new Promise((ok, falha) => {
    const t = db.transaction(LOJA, modo)
    const req = fn(t.objectStore(LOJA))
    t.oncomplete = () => ok(req?.result)
    t.onerror = () => falha(t.error)
  })
}

/** Resumo de um projeto para o cartão do painel. */
export function resumoDe(p, extra = {}) {
  const dur = p.linha.clipes.reduce((s, c) => s + c.fim - c.ini, 0) * (p.fps.d / p.fps.n)
  const fps = Math.round((p.fps.n / p.fps.d) * 1000) / 1000
  return {
    id: p.id,
    nome: p.nome,
    atualizado: new Date().toISOString(),
    formato: `${p.largura}×${p.altura} · ${String(fps).replace('.', ',')} qps`,
    duracao: dur,
    clipes: p.linha.clipes.length,
    midias: p.midias.length,
    estado: extra.estado || (p.propostas.some((x) => x.estado === 'pendente') ? 'revisar' : p.midias.length ? 'editando' : 'novo'),
    miniatura: extra.miniatura ?? null,
  }
}

export async function listar() {
  if (D) return D.listar()
  try {
    const todos = await transacao('readonly', (l) => l.getAll())
    return (todos || []).map(({ texto, ...r }) => r).sort((a, b) => String(b.atualizado).localeCompare(String(a.atualizado)))
  } catch {
    return []
  }
}

export async function gravar(texto, resumo) {
  if (D) return D.gravar(resumo.id, texto, resumo)
  await transacao('readwrite', (l) => l.put({ ...resumo, texto }))
}

export async function ler(id) {
  if (D) return D.ler(id)
  const r = await transacao('readonly', (l) => l.get(id))
  return r?.texto ?? null
}

export async function apagar(id) {
  if (D) return D.apagar(id)
  await transacao('readwrite', (l) => l.delete(id))
}

/** "há 5 min", "ontem", "12/10" */
export function quando(iso) {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const min = Math.round(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  if (h < 48) return 'ontem'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
