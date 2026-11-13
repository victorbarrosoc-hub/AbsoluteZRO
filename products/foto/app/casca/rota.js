// A rota mora no hash (#/decupar, #/revelar, #/estilos, #/entregar): recarregar e o botão de voltar funcionam, e nada
// vai ao servidor. As abas trocam só o painel central.

import { useEffect, useState } from '../preact.js'

export const ABAS = [
  { id: 'decupar', rotulo: 'Decupar', icone: 'decupar' },
  { id: 'revelar', rotulo: 'Revelar', icone: 'revelar' },
  { id: 'estilos', rotulo: 'Estilos', icone: 'estilos' },
  { id: 'entregar', rotulo: 'Entregar', icone: 'entregar' },
]
const PADRAO = ABAS[0].id

/** A aba do endereço (a primeira quando o hash não diz ou diz outra coisa). */
export function abaDoEndereco(hash = location.hash) {
  const nome = String(hash).replace(/^#\/?/, '').split(/[/?]/)[0]
  return ABAS.some((a) => a.id === nome) ? nome : PADRAO
}

export const enderecoDaAba = (id) => `#/${id}`

/** [aba, ir]: a aba atual e a função que troca (grava no hash; o botão de voltar desfaz). */
export function usarRota() {
  const [aba, definir] = useState(abaDoEndereco())
  useEffect(() => {
    const mudou = () => definir(abaDoEndereco())
    addEventListener('hashchange', mudou)
    return () => removeEventListener('hashchange', mudou)
  }, [])
  const ir = (id) => {
    if (!ABAS.some((a) => a.id === id)) return
    if (abaDoEndereco() !== id) history.pushState(null, '', enderecoDaAba(id))
    definir(id)
  }
  return [aba, ir]
}
