/**
 * Marca oficial Absolute ZRO, versão flat (26/10/2026): letras do wordmark original vetorizadas e o O redesenhado
 * como anel com a centelha de 4 pontas. Uma cor só, que segue o tema (grafite no claro, branco no escuro).
 */
import Link from 'next/link'
import { ZroWordmark } from '@zro/ui'

export function Wordmark({ href = '/', height = 22 }: { href?: string; height?: number }) {
  return (
    <Link href={href} className="wordmark" aria-label="Absolute ZRO — início">
      <ZroWordmark height={height} title="" />
    </Link>
  )
}
