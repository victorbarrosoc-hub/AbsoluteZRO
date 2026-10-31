import { adminDoLab } from '@zro/core'
import { DomainError } from '@zro/observability'
import { json, route } from '@/lib/api'
import { clienteAnthropic, iaLigada } from '@/lib/ia/modelo'

/** Tira um anexo (imagem ou PDF) dos arquivos da Anthropic antes da validade de 24 h. */
export const DELETE = route<{ id: string }>(
  async ({ auth }, { id }) => {
    adminDoLab(auth)
    if (!/^file_[A-Za-z0-9_-]{6,80}$/.test(id)) throw new DomainError('not_found', 'Anexo não encontrado.')
    if (!iaLigada()) throw new DomainError('upstream_unavailable', 'Conecte a chave do Claude (IA_ANTHROPIC_KEY).')
    await clienteAnthropic()
      .files.delete(id)
      .catch((e: { status?: number }) => {
        if (e?.status !== 404) throw new DomainError('upstream_unavailable', 'Não deu para apagar o anexo agora. Ele some sozinho em 24 h.')
      })
    return json({ ok: true })
  },
  { mutation: true },
)
