// Entrega conferida (a pasta de entrega da Revela, ou qualquer pasta de entrega): depois que a pasta inteira sobe para o
// Drive com o MD5 de cada arquivo conferido (o MD5 que o Drive devolve = o do arquivo no computador), o app gera o
// comprovante sobedesce.entrega/1. A pessoa registra o comprovante no projeto do HUB (Finalização e entregas), que
// publica delivery.ready com o link da pasta. O comprovante não leva caminho do computador nem dado da conta: só os
// arquivos dentro da pasta, tamanho, MD5 e o id de cada um no Drive.
// Leitor do outro lado: packages/integrations/src/sobedesce.ts (parseEntrega).

export const FORMATO_ENTREGA = 'sobedesce.entrega/1'

export class EntregaError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'EntregaError'
    this.status = status
  }
}

/** A pasta que o lote subiu: o primeiro pedaço do caminho de todos os arquivos (um envio de uma pasta só). */
export function pastaDoLote(records) {
  const tops = new Set(records.map((r) => String(r.relPath || '').split('/')[0]))
  if (records.length === 0 || tops.size !== 1 || records.some((r) => !String(r.relPath || '').includes('/'))) return null
  return [...tops][0]
}

/**
 * O comprovante de um lote de envio. Só sai com o lote inteiro concluído e conferido.
 * @param {{ records: object[], pastaId: string, id: string, agora?: Date, origem?: 'revela'|null }} o
 */
export function comprovanteDeEntrega({ records, pastaId, id, agora = new Date(), origem = null }) {
  const ups = records.filter((r) => r.type === 'upload')
  const pasta = pastaDoLote(ups)
  if (!pasta) throw new EntregaError(400, 'O comprovante é de uma pasta enviada inteira (um envio, uma pasta).')
  // pulado = já estava no Drive igual (MD5 conferido na comparação): também é parte da entrega
  const pendentes = ups.filter((r) => !['completed', 'skipped'].includes(r.status) || !r.target?.fileId || r.verify?.state !== 'ok' || !/^[0-9a-f]{32}$/.test(String(r.verify?.actual || '')))
  if (pendentes.length) {
    const n = pendentes.length
    throw new EntregaError(409, `${n === 1 ? '1 arquivo ainda não foi' : `${n} arquivos ainda não foram`} conferido${n === 1 ? '' : 's'} pelo MD5. O comprovante sai quando a pasta inteira estiver conferida.`)
  }
  if (!/^[\w-]{6,200}$/.test(String(pastaId || ''))) throw new EntregaError(502, 'Não achei a pasta no Drive.')
  return {
    formato: FORMATO_ENTREGA,
    id,
    quando: agora.toISOString(),
    pasta,
    drive: { pastaId, link: `https://drive.google.com/drive/folders/${pastaId}` },
    origem: origem === 'revela' ? 'revela' : null,
    arquivos: ups
      .map((r) => ({ rel: r.relPath.slice(pasta.length + 1), size: Number(r.size) || 0, md5: r.verify.actual, fileId: String(r.target?.fileId || '') }))
      .sort((a, b) => a.rel.localeCompare(b.rel)),
  }
}

