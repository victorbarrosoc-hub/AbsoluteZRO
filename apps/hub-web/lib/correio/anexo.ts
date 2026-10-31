/**
 * Cabeçalhos do download de um anexo: sempre `attachment` (o navegador nunca mostra na página do HUB), tipo declarado
 * só quando é inofensivo (o resto vira octet-stream), nosniff e CSP que não roda nada.
 */
const SEGUROS =
  /^(application\/pdf|image\/(png|jpe?g|gif|webp|heic|heif)|text\/plain|text\/csv|application\/zip|application\/(vnd\.openxmlformats-officedocument\.[a-z.]+|msword|vnd\.ms-excel)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)$/i

export function tipoSeguro(tipo: string): string {
  const t = (tipo.split(';')[0] ?? '').trim().toLowerCase()
  return SEGUROS.test(t) ? t : 'application/octet-stream'
}

export function cabecalhosDoAnexo(a: { nome: string; tipo: string; conteudo: { length: number } }): Record<string, string> {
  const ascii = a.nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'anexo'
  return {
    'content-type': tipoSeguro(a.tipo),
    'content-length': String(a.conteudo.length),
    'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': 'no-store',
  }
}
