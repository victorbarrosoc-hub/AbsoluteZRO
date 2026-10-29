import { defaultSender } from '@zro/auth'
import { syncCarroCrew } from '@zro/integrations'
import { json, readJson, route } from '@/lib/api'
import { appOrigin } from '@/lib/env'

const mail = defaultSender()

/**
 * A equipe escalada num job vira a equipe do projeto (carro-do-freela.crew/1). Quem já é da organização entra no
 * projeto; quem não é recebe convite por e-mail. O link do convite só vai por e-mail, nunca na resposta.
 */
export const POST = route(
  async ({ db, auth, req }) => {
    const r = await syncCarroCrew(db, auth, await readJson(req, 200_000))
    for (const i of r.invites) {
      const link = `${appOrigin}/convite?token=${encodeURIComponent(i.token)}`
      await mail.send({
        to: i.email,
        subject: 'Você foi escalado num projeto na Absolute ZRO',
        text: `Você entrou na equipe de "${r.projectTitle}". Para abrir o projeto com a sua conta (vale 7 dias): ${link}`,
      })
    }
    return json({ projectId: r.projectId, members: r.members, emailDelivery: mail.deliveryAvailable })
  },
  { mutation: true, bearer: 'carro-do-freela.jobs' },
)
