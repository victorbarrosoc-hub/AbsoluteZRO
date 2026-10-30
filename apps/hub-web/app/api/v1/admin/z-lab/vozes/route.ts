import { adminDoLab, lerPedidoDeVoz } from '@zro/core'
import { audit, DomainError } from '@zro/observability'
import { json, readJson, route } from '@/lib/api'
import { criarVoz, listarVozes, vozLigada } from '@/lib/ia/lab/elevenlabs'

const semChave = () => new DomainError('upstream_unavailable', 'Conecte a chave da ElevenLabs (ELEVENLABS_API_KEY).')

/** As vozes da conta da ElevenLabs (próprias e padrão), com a marca de feminina e português do Brasil para o filtro. */
export const GET = route(async ({ auth, req }) => {
  adminDoLab(auth)
  if (!vozLigada()) throw semChave()
  return json({ vozes: await listarVozes(req.signal) })
})

/**
 * Salva na conta da ElevenLabs a amostra do Voice Design que o titular escolheu (`confirmar: true`). Auditado. Não troca
 * a voz da Z sozinho: o Configurar escolhe e grava no rascunho.
 */
export const POST = route(
  async ({ db, auth, req }) => {
    const a = adminDoLab(auth)
    if (!vozLigada()) throw semChave()
    const p = lerPedidoDeVoz(await readJson(req, 4_000))
    const voz = await criarVoz({ amostra: p.amostra, nome: p.nome, descricao: p.descricao }, req.signal)
    await db.asUser({ userId: a.userId, orgId: a.orgId }, (tx) =>
      audit(tx, { actorUserId: a.userId, actorKind: 'user', action: 'z_lab.voz_criada', targetType: 'z_lab', targetId: voz.id, metadata: { nome: voz.nome } }),
    )
    return json({ voz }, 201)
  },
  { mutation: true },
)
