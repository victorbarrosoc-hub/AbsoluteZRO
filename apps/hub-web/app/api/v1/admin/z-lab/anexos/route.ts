import { toFile } from '@anthropic-ai/sdk'
import { adminDoLab, lerArquivo, Z_ANEXO_MAX_BYTES } from '@zro/core'
import { DomainError } from '@zro/observability'
import { json, route } from '@/lib/api'
import { clienteAnthropic, iaLigada } from '@/lib/ia/modelo'

export const maxDuration = 60

/** Validade dos arquivos nos servidores da Anthropic: depois disso somem sozinhos (a remoção na tela apaga antes). */
const VALIDADE_SEGUNDOS = 24 * 3600

/**
 * Um anexo do laboratório (multipart, campo `arquivo`, até 4 MB). O tipo vem do conteúdo. Imagem e PDF vão para os
 * arquivos da Anthropic com validade de 24 h e voltam como id; Word, Excel, PowerPoint e texto voltam como texto. Nada
 * fica guardado no HUB.
 */
export const POST = route(
  async ({ req, auth }) => {
    adminDoLab(auth)
    if (Number(req.headers.get('content-length') || 0) > Z_ANEXO_MAX_BYTES + 64_000)
      throw new DomainError('invalid_input', 'Arquivo grande demais (até 4 MB por aqui).')
    const form = await req.formData().catch(() => null)
    const f = form?.get('arquivo')
    if (!f || typeof f === 'string') throw new DomainError('invalid_input', 'Envie um arquivo no campo "arquivo".')
    const bytes = new Uint8Array(await f.arrayBuffer())
    const lido = lerArquivo(bytes, f.name)
    if (lido.tipo === 'texto') return json(lido)
    if (!iaLigada()) throw new DomainError('upstream_unavailable', 'Conecte a chave do Claude (IA_ANTHROPIC_KEY).')
    const up = await clienteAnthropic().files.upload({
      file: await toFile(bytes, lido.nome, { type: lido.mime }),
      expires_in_seconds: VALIDADE_SEGUNDOS,
    })
    return json({ ...lido, arquivo: up.id })
  },
  { mutation: true },
)
