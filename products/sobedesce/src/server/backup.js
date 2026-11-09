// Rotas do Backup Automático (Cartões → Projetos; docs/BACKUP-AUTOMATICO.md). Estado pelo SSE 'backup'; avisos
// 'backup-pedido' (cartão novo: de quem é?) e 'backup-feito' (descarga terminou).
import path from 'node:path'
import { BackupService } from '../backup/servico.js'

// a página do relatório: só CSS em linha, nada de script, e só o link synquei:// sai dela
export const RELATORIO_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

/**
 * @param {{ route, ctx, HttpProblem, servico?: BackupService }} o
 * @returns {{ view(): object, close(): Promise<void> }}
 */
export function registerBackup({ route, ctx, HttpProblem, servico }) {
  const svc =
    servico ||
    new BackupService({
      arquivo: ctx.paths?.root ? path.join(ctx.paths.root, 'backup-automatico.json') : null,
      onChange: (v) => ctx.hub?.send('backup', v),
      avisar: (ev, dados) => ctx.hub?.send(ev, dados),
      log: ctx.log,
    })
  ctx.backup = svc
  // pré-color automático: o cartão OK vira frames com a cor do dono (src/frames/servico.js › precolorDoCartao)
  svc.aoTerminarCartao ??= (entrada) => ctx.frames?.precolorDoCartao(entrada)
  const pronto = svc.init().catch((err) => ctx.log?.('backup: iniciar', err?.message || err))
  const tratar = (fn) => async (a) => {
    await pronto
    try {
      return await fn(a)
    } catch (err) {
      if (err?.name === 'BackupError' || err?.name === 'DiscosError') throw new HttpProblem(err.status === 499 ? 409 : err.status, err.message)
      throw err
    }
  }
  const texto = (v, max = 4096) => (typeof v === 'string' && v.length <= max ? v : null)
  // "Escolher o que passar": { tipos: [...], pastas: [...] } (o serviço limpa; aqui só o tamanho).
  const escolha = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? { tipos: Array.isArray(v.tipos) ? v.tipos.slice(0, 3).map((x) => texto(x, 20)) : undefined, pastas: Array.isArray(v.pastas) ? v.pastas.slice(0, 60).map((x) => texto(x, 1024)) : undefined } : null)
  const lista = (v) => (Array.isArray(v) ? v.slice(0, 4).map((x) => texto(x)) : null)

  route('GET', '/api/backup', tratar(async () => svc.view()))

  // Relatório da diária (src/backup/relatorio.js): página sem script, aberta no navegador pelo botão "Relatório".
  route(
    'GET',
    '/api/backup/relatorio',
    tratar(async ({ res, query }) => {
      const n = query.get('diaria')
      const { html } = await svc.relatorio(texto(query.get('id'), 100) || undefined, n != null && /^\d{1,4}$/.test(n) ? Number(n) : null)
      const corpo = Buffer.from(html, 'utf8')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': RELATORIO_CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-length': corpo.length })
      res.end(corpo)
    }),
    { raw: true },
  )

  route('POST', '/api/backup/projetos', tratar(async ({ body }) => svc.criarProjeto({ nome: texto(body.nome, 200), destinos: lista(body.destinos), ejetar: body.ejetar === true, ligar: body.ligar !== false, tipo: texto(body.tipo, 40), midia: texto(body.midia, 20), synquei: body.synquei !== false, precolor: body.precolor === true, levarProxies: body.levarProxies === true })))

  route('POST', '/api/backup/projeto', tratar(async ({ body }) => {
    const id = texto(body.id, 100)
    if (!id) throw new HttpProblem(400, 'Projeto inválido.')
    return svc.editarProjeto(id, {
      nome: body.nome === undefined ? undefined : texto(body.nome, 200),
      destinos: body.destinos === undefined ? undefined : lista(body.destinos),
      ejetar: body.ejetar === undefined ? undefined : body.ejetar === true,
      tipo: body.tipo === undefined ? undefined : texto(body.tipo, 40),
      midia: body.midia === undefined ? undefined : texto(body.midia, 20),
      synquei: body.synquei === undefined ? undefined : body.synquei !== false,
      precolor: body.precolor === undefined ? undefined : body.precolor === true,
      levarProxies: body.levarProxies === undefined ? undefined : body.levarProxies === true,
    })
  }))

  route('POST', '/api/backup/abrir', tratar(async ({ body }) => svc.abrir(texto(body.id, 100))))

  // "Preparar no Synquei": o link synquei://organizar da pasta do projeto (quem abre é a ponte do app ou o navegador).
  route('POST', '/api/backup/synquei', tratar(async ({ body }) => svc.paraSynquei(texto(body.id, 100) || undefined)))

  route('POST', '/api/backup/apagar', tratar(async ({ body }) => svc.apagarProjeto(texto(body.id, 100))))

  // "Gravando agora": o momento que vai nos próximos cartões ('' = automático).
  route('POST', '/api/backup/momento', tratar(async ({ body }) => svc.momento(body.momento == null ? '' : texto(body.momento, 200) ?? '')))

  route('POST', '/api/backup/ligar', tratar(async ({ body }) => svc.ligar(body.ligado === true)))

  route('POST', '/api/backup/diaria', tratar(async ({ body }) => (body.n == null ? svc.novaDiaria() : svc.escolherDiaria(Number(body.n)))))

  route('POST', '/api/backup/responder', tratar(async ({ body }) =>
    svc.responder({
      caminho: texto(body.caminho),
      donoId: texto(body.donoId, 100),
      nome: texto(body.nome, 200),
      camera: texto(body.camera, 200),
      pasta: texto(body.pasta, 200),
      secao: texto(body.secao, 20),
      escolha: escolha(body.escolha),
      ignorar: body.ignorar === true,
    })))

  route('POST', '/api/backup/dono', tratar(async ({ body }) => {
    const id = texto(body.id, 100)
    if (!id) throw new HttpProblem(400, 'Dono inválido.')
    return svc.editarDono(id, {
      nome: body.nome === undefined ? undefined : texto(body.nome, 200),
      camera: body.camera === undefined ? undefined : texto(body.camera, 200),
      pasta: body.pasta === undefined ? undefined : texto(body.pasta, 200),
      secao: body.secao === undefined ? undefined : texto(body.secao, 20),
    })
  }))

  route('POST', '/api/backup/repetir', tratar(async ({ body }) => svc.repetir(texto(body.caminho))))

  route('POST', '/api/backup/usar', tratar(async ({ body }) => svc.usarComoCartao(texto(body.caminho))))

  route('POST', '/api/backup/pasta', tratar(async ({ body }) => svc.copiarPasta(texto(body.caminho, 4096))))

  route('POST', '/api/backup/nao-cartao', tratar(async ({ body }) => svc.naoECartao(texto(body.caminho))))

  route('POST', '/api/backup/conteudo', tratar(async ({ body }) => svc.conteudo(texto(body.caminho))))
  // Prévia do cartão: as fotos e os vídeos, para ver antes de copiar (a tela pede as miniaturas às rotas da montagem).
  route('POST', '/api/backup/previa', tratar(async ({ body }) => svc.previa(texto(body.caminho))))

  route('POST', '/api/backup/escolher', tratar(async ({ body }) => svc.escolher(texto(body.caminho), escolha(body.escolha))))

  route('POST', '/api/backup/historico/limpar', tratar(async () => svc.limparHistorico()))

  route('POST', '/api/backup/ejetar', tratar(async ({ body }) => svc.ejetar(texto(body.caminho))))

  route('POST', '/api/backup/cancelar', tratar(async () => svc.cancelar()))

  route('POST', '/api/backup/ignorados/limpar', tratar(async () => svc.esquecerIgnorados()))

  return { view: () => svc.view(), close: () => svc.close() }
}
