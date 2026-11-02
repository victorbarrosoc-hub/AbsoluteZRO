// Rede Local e Firewall do macOS (src/celular/rede-local.js e firewall.js) para a tela Dispositivos: sem a permissão de
// Rede Local (macOS 15+) ou com o Firewall recusando, outro computador acha este pela conta mas não conecta ("Entre
// computadores", docs/LAN.md). Antes isto vivia no Wi-Fi com o celular, descontinuado em 02/11/2026.
import { criarRedeLocal } from '../celular/rede-local.js'
import { criarFirewall } from '../celular/firewall.js'

/**
 * @param {{ route, ctx, redeLocal?, firewall? }} o
 * @returns {{ view(): { redeLocal: string|null, firewall: object|null }, conferir(o?: { forcar?: boolean }): Promise<object>, close(): void }}
 */
export function registerRede({ route, ctx, redeLocal = criarRedeLocal(), firewall = criarFirewall() }) {
  const view = () => ({ redeLocal: redeLocal.estado ?? null, firewall: firewall.estado ?? null })
  async function conferir({ forcar = false } = {}) {
    const antes = JSON.stringify(view())
    await Promise.all([redeLocal.conferir({ forcar }).catch(() => null), firewall.conferir({ forcar }).catch(() => null)])
    if (JSON.stringify(view()) !== antes) ctx.hub?.send?.('rede', view())
    return view()
  }
  // No macOS 15+, a primeira conferida também faz o sistema pedir a permissão de Rede Local.
  conferir().catch(() => {})
  route('POST', '/api/rede/conferir', async () => conferir({ forcar: true }))
  return { view, conferir, close() {} }
}
