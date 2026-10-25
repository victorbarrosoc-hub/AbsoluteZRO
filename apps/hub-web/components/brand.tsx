/** Marca oficial Absolute ZRO (arte fornecida pelo titular, sem o subtítulo de serviço da ZRO Filmes). */
import Link from 'next/link'

export function Wordmark({ href = '/', height = 22 }: { href?: string; height?: number }) {
  return (
    <Link href={href} className="wordmark" aria-label="Absolute ZRO — início">
      <img src="/brand/absolute-zro-wordmark-alpha.webp" alt="Absolute ZRO" height={height} width={Math.round((height * 760) / 99)} />
    </Link>
  )
}
