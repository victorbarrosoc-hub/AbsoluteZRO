// Rotas do Arquivar (src/arquivar/servico.js): o que a pasta tem, o teste de 8 s, começar, parar e o andamento.
import path from 'node:path'
import { Arquivador } from '../arquivar/servico.js'
import { detectarMotor } from '../media/previa.js'

export function registerArquivar({ route, ctx, HttpProblem }) {
  const cacheDir = path.join(ctx.paths?.root || path.dirname(ctx.paths?.settings || '.'), 'arquivar-cache')
  const svc = (ctx.arquivar ??= new Arquivador({
    cacheDir,
    // o mesmo ffmpeg das prévias (já detectado); sem ele (testes), procura sozinho
    motor: () => (ctx.manager?.previas?.motor ? ctx.manager.previas.motor() : detectarMotor()),
    log: (...a) => ctx.log?.(...a),
  }))
  const tratar = (fn) => async (a) => {
    try {
      return await fn(a)
    } catch (err) {
      if (err instanceof HttpProblem) throw err
      if (err?.status) throw new HttpProblem(err.status, err.message)
      throw err
    }
  }
  const texto = (v) => (typeof v === 'string' && v.length <= 4096 ? v : null)

  route(
    'GET',
    '/api/arquivar',
    tratar(async () => svc.estado()),
  )
  route(
    'POST',
    '/api/arquivar/planejar',
    tratar(async ({ body }) => ({ plano: await svc.planejar(texto(body.origem)) })),
  )
  route(
    'POST',
    '/api/arquivar/testar',
    tratar(async ({ body }) => ({ teste: await svc.testar({ origem: texto(body.origem), nivel: texto(body.nivel), perfil: texto(body.perfil) }) })),
  )
  route(
    'POST',
    '/api/arquivar/iniciar',
    tratar(async ({ body }) =>
      svc.iniciar({ origem: texto(body.origem), nivelFoto: texto(body.nivelFoto), nivelVideo: texto(body.nivelVideo), perfil: texto(body.perfil) }),
    ),
  )
  route(
    'POST',
    '/api/arquivar/cancelar',
    tratar(async () => svc.cancelar()),
  )
  return svc
}
