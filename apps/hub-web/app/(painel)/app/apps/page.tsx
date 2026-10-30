import { redirect } from 'next/navigation'

/**
 * Endereço antigo do painel de apps. Desde 29/10/2026 o app Absolute ZRO abre direto nos apps (/app), a tarefa; a Z
 * fica em /app/ia. Quem tinha o link guardado chega no mesmo lugar.
 */
export default function AppsAntigo() {
  redirect('/app')
}
