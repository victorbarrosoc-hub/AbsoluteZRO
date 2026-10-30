// Rotas por hash: #/painel (Início), #/transferencias, #/drive, #/comparar, #/ajustes, #/z (a Z, discreta no pé da
// barra); #/inicio = Primeiros passos. Sem rota no endereço (`padrao`), o app escolhe a entrada (lib/entrada.js,
// 29/10/2026): a tarefa em curso, senão o Início. A Z nunca é a entrada.
import { useEffect, useState } from '/vendor/preact-htm.js'

export const ROUTES = ['painel', 'transferencias', 'drive', 'referencias', 'frames', 'comparar', 'computadores', 'cartoes', 'ajustes', 'z', 'inicio']

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '')
  const [p, qs] = raw.split('?')
  const parts = p.split('/').filter(Boolean).map(decodeURIComponent)
  const padrao = !ROUTES.includes(parts[0])
  const name = padrao ? 'painel' : parts[0]
  return { name, parts, query: new URLSearchParams(qs || ''), padrao }
}

export function navigate(to, { replace = false } = {}) {
  const hash = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`
  if (replace) history.replaceState(null, '', hash)
  else location.hash = hash
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const on = () => setRoute(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
