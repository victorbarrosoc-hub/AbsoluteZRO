import { EsqueletoPagina } from '@/components/esqueleto'

/** Telas da área logada sem esqueleto próprio: cabeçalho e cartões, só depois de 320 ms (components/esqueleto.tsx). */
export default function Loading() {
  return <EsqueletoPagina />
}
