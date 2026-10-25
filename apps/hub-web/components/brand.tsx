/**
 * Marca oficial Absolute ZRO (arte fornecida pelo titular, sem o subtítulo de serviço da ZRO Filmes).
 * Duas versões derivadas da mesma arte: luz (fundo escuro) e tinta (tema claro). O CSS mostra a certa.
 */
import Link from 'next/link'

export function Wordmark({ href = '/', height = 22 }: { href?: string; height?: number }) {
  const width = Math.round((height * 760) / 99)
  return (
    <Link href={href} className="wordmark" aria-label="Absolute ZRO — início">
      <img className="wordmark__glow" src="/brand/absolute-zro-wordmark-alpha.webp" alt="" height={height} width={width} />
      <img className="wordmark__ink" src="/brand/absolute-zro-wordmark-ink.webp" alt="" height={height} width={width} />
    </Link>
  )
}
