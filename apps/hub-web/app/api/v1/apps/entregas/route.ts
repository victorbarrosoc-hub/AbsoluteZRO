import { ESCOPO_ENVIAR_ENTREGA, enviarEntrega, entregasEnviadas } from '@zro/integrations'
import { json, readJson, route } from '@/lib/api'

/**
 * Entregas entre apps (Criação F8; contrato em docs/integration-contracts/maestro-tpeasy.md): o roteiro do Maestro
 * direto no TPeasy. Só servidor a servidor, com o access token da pessoa no app de origem (Maestro: `maestro.projects`);
 * a pessoa, o papel, o TPeasy no plano e os gates saem do banco (packages/integrations/src/entregas.ts).
 * - POST `{ destino, tipo, para?, roteiro: { id, versao, pessoa, sha256 }, titulo, corpo, link, alvo_seg }`: guarda na
 *   caixa de entrada de quem recebe. A mesma versão de novo não duplica (`situacao: reenviada`). 201 nova, 200 reenviada.
 * - GET `?roteiro=<id>`: o que a pessoa mandou daquele roteiro (para o "Enviado ao TPeasy · v3 · Recebido").
 */
export const GET = route(async ({ db, auth, req }) => entregasEnviadas(db, auth, { roteiro: new URL(req.url).searchParams.get('roteiro') ?? undefined }), {
  bearer: ESCOPO_ENVIAR_ENTREGA.maestro,
})

export const POST = route(
  async ({ db, auth, req }) => {
    const estado = await enviarEntrega(db, auth, await readJson(req, 300_000))
    return json(estado, estado.situacao === 'nova' ? 201 : 200)
  },
  { bearer: ESCOPO_ENVIAR_ENTREGA.maestro, mutation: true },
)
