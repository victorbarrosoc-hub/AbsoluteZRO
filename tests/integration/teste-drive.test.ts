// Teste do Drive (/admin/teste-drive), sem banco e sem Google: a tabela de decisão (checagens → veredito e fluxos do
// SOBEDESCE), a leitura do escopo do token, a configuração pelo ambiente, a CSP só desta rota e as checagens contra um
// Drive falso em memória (um que se comporta como drive.file e um que lista tudo).
import { describe, expect, it } from 'vitest'
import nextConfig from '../../apps/hub-web/next.config'
import { configDoTesteDrive, cspTesteDrive, ROTA_TESTE_DRIVE } from '../../apps/hub-web/lib/teste-drive/config'
import { checarEscolhidos, checarPasta, limpar, motivoDoErro, type Chamar } from '../../apps/hub-web/lib/teste-drive/drive'
import { EXEMPLO } from '../../apps/hub-web/lib/teste-drive/exemplo'
import {
  falhaDeConfiguracao,
  lerEscopos,
  PASTA_MIME,
  textoDoResultado,
  veredito,
  type Checagem,
  type CheckId,
  type Estado,
} from '../../apps/hub-web/lib/teste-drive/veredito'

const ck = (estados: Partial<Record<CheckId, Estado>>, extra: Partial<Record<CheckId, Partial<Checagem>>> = {}): Checagem[] =>
  Object.entries(estados).map(([id, estado]) => ({ id: id as CheckId, estado: estado!, detalhe: '', status: 200, ...extra[id as CheckId] }))

const TUDO: Partial<Record<CheckId, Estado>> = {
  ler_pasta: 'passou',
  listar_filhos: 'passou',
  ler_arquivo_existente: 'passou',
  listar_subpasta: 'passou',
  enviar_arquivo: 'passou',
  criar_subpasta: 'passou',
  ler_criados: 'passou',
}
const fluxo = (v: ReturnType<typeof veredito>, id: string) => v.fluxos.find((f) => f.id === id)?.estado

describe('veredito: a tabela de decisão do documento', () => {
  it('antes de escolher a pasta, pendente', () => {
    expect(veredito([]).tipo).toBe('pendente')
  })

  it('tudo passa: drive.file cobre e o SOBEDESCE fica sem auditoria paga', () => {
    const v = veredito(ck({ ...TUDO, ler_escolhidos: 'passou' }))
    expect(v.tipo).toBe('cobre')
    expect(v.texto).toContain('sem auditoria paga')
    expect(v.fluxos.every((f) => f.estado === 'funciona')).toBe(true)
  })

  it('lista vazia com escrita ok: parcial, enviar funciona e navegar/Backup/Comparar quebram', () => {
    const v = veredito(
      ck({
        ler_pasta: 'passou',
        listar_filhos: 'falhou',
        ler_arquivo_existente: 'nao_testado',
        listar_subpasta: 'nao_testado',
        enviar_arquivo: 'passou',
        criar_subpasta: 'passou',
        ler_criados: 'passou',
        ler_escolhidos: 'passou',
      }),
    )
    expect(v.tipo).toBe('parcial')
    expect(v.texto).toMatch(/escopo restrito \(auditoria paga\) ou de mudar para seleção de arquivos no Picker/)
    expect(fluxo(v, 'navegar')).toBe('quebra')
    expect(fluxo(v, 'backup')).toBe('quebra')
    expect(fluxo(v, 'comparar')).toBe('quebra')
    expect(fluxo(v, 'porta_malas')).toBe('quebra')
    expect(fluxo(v, 'para_o_drive')).toBe('funciona')
    expect(fluxo(v, 'escolher_arquivo')).toBe('funciona')
  })

  it('o exemplo fictício é o caso parcial', () => {
    expect(veredito(EXEMPLO).tipo).toBe('parcial')
  })

  it('não lê a pasta ou não escreve nela: não cobre', () => {
    expect(veredito(ck({ ...TUDO, ler_pasta: 'falhou' })).tipo).toBe('nao_cobre')
    expect(veredito(ck({ ...TUDO, enviar_arquivo: 'falhou' })).tipo).toBe('nao_cobre')
    expect(fluxo(veredito(ck({ ...TUDO, criar_subpasta: 'falhou' })), 'para_o_drive')).toBe('quebra')
  })

  it('falha de configuração ou token com escopo amplo: inconclusivo, nunca um veredito sobre o escopo', () => {
    expect(veredito(ck({ ...TUDO, ler_pasta: 'falhou' }, { ler_pasta: { status: 403, configuracao: true } })).tipo).toBe('inconclusivo')
    const amplo = veredito(ck(TUDO), { escopoAmplo: true })
    expect(amplo.tipo).toBe('inconclusivo')
    expect(amplo.titulo).toMatch(/escopo amplo/)
  })

  it('pasta sem subpasta: incompleto (falta o que testar)', () => {
    const v = veredito(ck({ ...TUDO, listar_subpasta: 'nao_testado' }))
    expect(v.tipo).toBe('incompleto')
    expect(fluxo(v, 'navegar')).toBe('nao_testado')
    expect(fluxo(v, 'escolher_arquivo')).toBe('nao_testado')
  })

  it('o texto copiado traz as 8 checagens, o HTTP, o veredito e os fluxos, e nada de token', () => {
    const t = textoDoResultado(EXEMPLO, veredito(EXEMPLO), new Date('2026-10-31T12:00:00Z'), { escopos: 'drive.file' })
    expect(t).toContain('2026-10-31T12:00:00.000Z')
    expect(t).toContain('2. Listar o que já existe dentro dela: Falhou (HTTP 200)')
    expect(t).toContain('3. Ler um arquivo que já existia: Não deu para testar')
    expect(t).toContain('Veredito: drive.file cobre só parte')
    expect(t).toContain('- Backup do Drive para o disco: quebra')
    expect(t.split('\n').filter((l) => /^\d\. /.test(l))).toHaveLength(8)
  })
})

describe('escopo do token e falhas de configuração', () => {
  it('só drive.file é limpo; drive ou drive.readonly junto invalidam', () => {
    expect(lerEscopos('https://www.googleapis.com/auth/drive.file')).toEqual({
      temDriveFile: true,
      amplos: [],
      outros: [],
    })
    expect(lerEscopos('https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive').amplos).toHaveLength(1)
    expect(lerEscopos('https://www.googleapis.com/auth/drive.readonly openid').amplos).toEqual(['https://www.googleapis.com/auth/drive.readonly'])
    expect(lerEscopos(undefined).temDriveFile).toBe(false)
  })

  it('API desligada, chave, token e rede são configuração; 404 e appNotAuthorizedToFile são o escopo', () => {
    expect(falhaDeConfiguracao(0)).toBe(true)
    expect(falhaDeConfiguracao(401)).toBe(true)
    expect(falhaDeConfiguracao(403, 'accessNotConfigured, PERMISSION_DENIED, SERVICE_DISABLED')).toBe(true)
    expect(falhaDeConfiguracao(403, 'appNotAuthorizedToFile')).toBe(false)
    expect(falhaDeConfiguracao(403, 'insufficientFilePermissions')).toBe(false)
    expect(falhaDeConfiguracao(404, 'notFound')).toBe(false)
    expect(motivoDoErro(JSON.stringify({ error: { code: 403, errors: [{ reason: 'appNotAuthorizedToFile' }], status: 'PERMISSION_DENIED' } }))).toBe(
      'appNotAuthorizedToFile, PERMISSION_DENIED',
    )
    expect(motivoDoErro('não é json')).toBeUndefined()
  })
})

describe('configuração pelo ambiente', () => {
  it('lista o que falta, na ordem da tela, e aceita o cliente do Entrar com Google', () => {
    expect(configDoTesteDrive({}).faltam).toEqual(['NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'NEXT_PUBLIC_GOOGLE_PICKER_API_KEY', 'NEXT_PUBLIC_GOOGLE_APP_ID'])
    const login = configDoTesteDrive({ GOOGLE_CLIENT_ID: 'c.apps.googleusercontent.com', NEXT_PUBLIC_GOOGLE_APP_ID: 'abc' })
    expect(login.faltam).toEqual(['NEXT_PUBLIC_GOOGLE_PICKER_API_KEY', 'NEXT_PUBLIC_GOOGLE_APP_ID'])
    expect(login.clienteDoLogin).toBe(true)
    const ok = configDoTesteDrive({
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'teste.apps.googleusercontent.com',
      GOOGLE_CLIENT_ID: 'outro',
      NEXT_PUBLIC_GOOGLE_PICKER_API_KEY: 'chave-falsa',
      NEXT_PUBLIC_GOOGLE_APP_ID: '123456789012',
    })
    expect(ok.faltam).toEqual([])
    expect(ok.config).toMatchObject({ clientId: 'teste.apps.googleusercontent.com', clienteDoLogin: false })
  })
})

describe('CSP: as origens do Google só nesta rota', () => {
  it('a regra da rota libera exatamente o Google necessário; as outras não mencionam o Google', async () => {
    const regras = await nextConfig.headers!()
    const csp = (h: { key: string; value: string }[]) => h.find((x) => x.key === 'Content-Security-Policy')?.value ?? ''
    const comGoogle = regras.filter((r) => /google/.test(JSON.stringify(r.headers)))
    expect(comGoogle.map((r) => r.source)).toEqual([ROTA_TESTE_DRIVE])
    const rota = comGoogle[0]!
    const valor = csp(rota.headers)
    expect(valor).toBe(cspTesteDrive({ dev: process.env.NODE_ENV !== 'production' }))
    // A regra da rota vem depois da geral (a do fim vence).
    expect(regras.indexOf(rota)).toBeGreaterThan(regras.findIndex((r) => r.source === '/:path*'))
    expect(rota.headers.find((h) => h.key === 'Cross-Origin-Opener-Policy')?.value).toBe('same-origin-allow-popups')
    // As diretivas de sempre continuam.
    expect(valor).toContain("frame-ancestors 'none'")
    expect(valor).toContain("object-src 'none'")
    expect(csp(regras.find((r) => r.source === '/:path*')!.headers)).not.toMatch(/script-src|google/)
  })

  it('produção: sem eval e sem WebSocket; origens exatas', () => {
    const p = cspTesteDrive()
    const diretiva = (nome: string) => p.split('; ').find((d) => d.startsWith(`${nome} `))
    expect(diretiva('script-src')).toBe("script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com")
    expect(diretiva('connect-src')).toBe(
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://content.googleapis.com https://www.googleapis.com",
    )
    expect(diretiva('frame-src')).toBe('frame-src https://accounts.google.com https://docs.google.com https://content.googleapis.com')
    expect(cspTesteDrive({ dev: true })).toContain("'unsafe-eval'")
  })
})

// ───── Drive falso ─────
type Arq = { id: string; name: string; mimeType: string; parents: string[]; conteudo?: string; doApp?: boolean }

/** `modo: 'drive.file'`: só enxerga a pasta escolhida, os escolhidos e o que o app criou. `'amplo'`: enxerga tudo. */
function driveFalso(modo: 'drive.file' | 'amplo', opcoes: { semApi?: boolean } = {}) {
  const arqs = new Map<string, Arq>()
  const add = (a: Arq) => arqs.set(a.id, a)
  add({ id: 'pastaTeste01', name: 'ZRO-TESTE', mimeType: PASTA_MIME, parents: ['root'] })
  add({ id: 'arquivoA0001', name: 'a.txt', mimeType: 'text/plain', parents: ['pastaTeste01'], conteudo: 'conteúdo de a' })
  add({ id: 'subpasta0001', name: 'sub1', mimeType: PASTA_MIME, parents: ['pastaTeste01'] })
  add({ id: 'arquivoB0001', name: 'b.txt', mimeType: 'text/plain', parents: ['subpasta0001'], conteudo: 'conteúdo de b' })
  // O que a pessoa escolheu no Picker (a pasta, e depois os arquivos da multisseleção).
  const concedidos = new Set(['pastaTeste01'])
  const ve = (id: string) => modo === 'amplo' || concedidos.has(id) || arqs.get(id)?.doApp
  const chamadas: string[] = []
  let n = 0
  const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  const erro = (status: number, reason: string) => json(status, { error: { code: status, errors: [{ reason }], status: 'X' } })

  const f: Chamar = async (url, init = {}) => {
    const u = new URL(url)
    const metodo = init.method ?? 'GET'
    chamadas.push(`${metodo} ${u.pathname}`)
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-falso')
    expect(u.host).toBe('www.googleapis.com')
    if (opcoes.semApi) return erro(403, 'accessNotConfigured')
    const id = u.pathname.split('/files/')[1]
    if (metodo === 'GET' && !id) {
      const pai = /'([\w-]+)' in parents/.exec(u.searchParams.get('q') ?? '')![1]!
      return json(200, {
        files: [...arqs.values()].filter((a) => a.parents.includes(pai) && ve(a.id)).map(({ id, name, mimeType }) => ({ id, name, mimeType })),
      })
    }
    if (metodo === 'POST') {
      const novoId = `criado${String(++n).padStart(6, '0')}`
      let meta: { name: string; mimeType: string; parents: string[] }
      let conteudo: string | undefined
      if (u.pathname.startsWith('/upload/')) {
        const corpo = String(init.body)
        meta = JSON.parse(corpo.split('\r\n\r\n')[1]!.split('\r\n')[0]!)
        conteudo = corpo.split('\r\n\r\n')[2]!.split('\r\n--')[0]
      } else meta = JSON.parse(String(init.body))
      if (!meta.parents.every((p) => ve(p))) return erro(404, 'notFound')
      add({ id: novoId, ...meta, conteudo, doApp: true })
      return json(200, { id: novoId, name: meta.name, parents: meta.parents })
    }
    const a = id ? arqs.get(id) : undefined
    if (!a || !ve(a.id)) return erro(404, 'notFound')
    if (metodo === 'DELETE') {
      arqs.delete(a.id)
      return new Response(null, { status: 204 })
    }
    if (u.searchParams.get('alt') === 'media') {
      const ranged = new Headers(init.headers).get('Range')
      return new Response(a.conteudo ?? '', { status: ranged ? 206 : 200 })
    }
    return json(200, { id: a.id, name: a.name, mimeType: a.mimeType, capabilities: { canListChildren: modo === 'amplo', canAddChildren: true } })
  }
  return { f, arqs, chamadas, conceder: (id: string) => concedidos.add(id) }
}

describe('checagens contra um Drive falso (nenhuma chamada ao Google)', () => {
  const agora = new Date('2026-10-31T12:00:00Z')

  it('comportamento drive.file: lê a pasta e escreve, mas a lista vem só com o que o app criou → parcial', async () => {
    const d = driveFalso('drive.file')
    const vistos: string[] = []
    const { checagens, criados } = await checarPasta(d.f, 'token-falso', 'pastaTeste01', { esperados: 2, agora, aoAvancar: (c) => vistos.push(c.id) })
    const por = Object.fromEntries(checagens.map((c) => [c.id, c]))
    expect(vistos).toEqual(['ler_pasta', 'listar_filhos', 'ler_arquivo_existente', 'listar_subpasta', 'enviar_arquivo', 'criar_subpasta', 'ler_criados'])
    expect(por.ler_pasta).toMatchObject({ estado: 'passou', status: 200 })
    expect(por.listar_filhos).toMatchObject({ estado: 'falhou', status: 200 })
    expect(por.listar_filhos!.detalhe).toMatch(/Voltou 0 itens, embora a pasta tenha 2 itens/)
    expect(por.ler_arquivo_existente!.estado).toBe('nao_testado')
    expect(por.listar_subpasta!.estado).toBe('nao_testado')
    expect(por.enviar_arquivo!.estado).toBe('passou')
    expect(por.criar_subpasta!.estado).toBe('passou')
    expect(por.ler_criados!.estado).toBe('passou')
    expect(por.ler_criados!.detalhe).toMatch(/lista 2 itens \(antes: 0\); 2 de 2 são do app/)
    expect(veredito(checagens).tipo).toBe('parcial')

    // Escolher o arquivo no Picker libera a leitura dele (e só dele).
    d.conceder('arquivoA0001')
    expect(await checarEscolhidos(d.f, 'token-falso', ['arquivoA0001'])).toMatchObject({ estado: 'passou', status: 206 })
    expect((await checarEscolhidos(d.f, 'token-falso', ['arquivoB0001'])).estado).toBe('falhou')

    // Limpar apaga só o que o teste criou, por id.
    const antes = [...d.arqs.keys()].filter((id) => !id.startsWith('criado'))
    expect(await limpar(d.f, 'token-falso', criados)).toEqual({ apagados: 3, falhas: 0 })
    expect([...d.arqs.keys()]).toEqual(antes)
    expect(d.chamadas.filter((c) => c.startsWith('DELETE'))).toHaveLength(3)
  })

  it('comportamento amplo: lista, lê o que existia, entra na subpasta → cobre', async () => {
    const d = driveFalso('amplo')
    const { checagens } = await checarPasta(d.f, 'token-falso', 'pastaTeste01', { agora })
    expect(checagens.every((c) => c.estado === 'passou')).toBe(true)
    expect(checagens.find((c) => c.id === 'ler_arquivo_existente')!.status).toBe(206)
    expect(veredito(checagens).tipo).toBe('cobre')
  })

  it('API do Drive desligada: inconclusivo, e nada foi criado', async () => {
    const d = driveFalso('drive.file', { semApi: true })
    const { checagens, criados } = await checarPasta(d.f, 'token-falso', 'pastaTeste01', { agora })
    expect(checagens[0]).toMatchObject({ estado: 'falhou', status: 403, configuracao: true })
    expect(checagens[0]!.detalhe).toContain('accessNotConfigured')
    expect(veredito(checagens).tipo).toBe('inconclusivo')
    expect(criados).toEqual({})
  })

  it('id estranho do Picker não vira chamada', async () => {
    const d = driveFalso('amplo')
    const { checagens } = await checarPasta(d.f, 'token-falso', "x' or '1'='1", { agora })
    expect(checagens).toHaveLength(1)
    expect(checagens[0]!.estado).toBe('falhou')
    expect(d.chamadas).toHaveLength(0)
  })
})
