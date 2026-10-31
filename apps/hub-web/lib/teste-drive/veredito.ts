// Teste do Drive (/admin/teste-drive): a parte pura. Do resultado de cada checagem ao veredito da tabela de decisão de
// docs/operations/google-drive-sobedesce-teste.md e ao texto que o titular copia. Sem DOM, sem rede: testável.

export const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'
export const PASTA_MIME = 'application/vnd.google-apps.folder'

/** Escopos restritos do Drive: se o token vier com um deles, o teste não mede o drive.file. */
const ESCOPOS_AMPLOS = new Set(['drive', 'drive.readonly', 'drive.metadata', 'drive.metadata.readonly'].map((s) => `https://www.googleapis.com/auth/${s}`))

export type CheckId =
  'ler_pasta' | 'listar_filhos' | 'ler_arquivo_existente' | 'listar_subpasta' | 'enviar_arquivo' | 'criar_subpasta' | 'ler_criados' | 'ler_escolhidos'

export type Estado = 'passou' | 'falhou' | 'nao_testado'

export type Checagem = {
  id: CheckId
  estado: Estado
  /** HTTP da chamada principal (0 = sem resposta). */
  status?: number
  detalhe: string
  /** A falha veio da configuração (API desligada, token vencido, rede), não do escopo. */
  configuracao?: boolean
}

export const TITULOS: Record<CheckId, string> = {
  ler_pasta: 'Ler a pasta escolhida',
  listar_filhos: 'Listar o que já existe dentro dela',
  ler_arquivo_existente: 'Ler um arquivo que já existia',
  listar_subpasta: 'Entrar numa subpasta que já existia',
  enviar_arquivo: 'Enviar um arquivo novo',
  criar_subpasta: 'Criar uma subpasta',
  ler_criados: 'Ler de volta o que o app criou',
  ler_escolhidos: 'Ler os arquivos escolhidos no Picker',
}

export const ORDEM: CheckId[] = [
  'ler_pasta',
  'listar_filhos',
  'ler_arquivo_existente',
  'listar_subpasta',
  'enviar_arquivo',
  'criar_subpasta',
  'ler_criados',
  'ler_escolhidos',
]

/** Fluxos do SOBEDESCE e as checagens de que cada um depende (tabela "O que o código de hoje exige do Drive"). */
export const FLUXOS = [
  { id: 'navegar', nome: 'Navegar pastas (aba Drive, "Escolher no Drive" do Maestro e do Relay)', depende: ['listar_filhos', 'listar_subpasta'] },
  { id: 'backup', nome: 'Backup do Drive para o disco', depende: ['listar_filhos', 'listar_subpasta', 'ler_arquivo_existente'] },
  { id: 'comparar', nome: 'Comparar disco × Drive', depende: ['listar_filhos', 'listar_subpasta', 'ler_arquivo_existente'] },
  { id: 'para_o_drive', nome: '"Para o Drive" (enviar para a pasta escolhida)', depende: ['ler_pasta', 'enviar_arquivo', 'criar_subpasta', 'ler_criados'] },
  { id: 'escolher_arquivo', nome: 'Abrir arquivo escolhido (Maestro, Relay, player)', depende: ['ler_escolhidos'] },
  {
    id: 'porta_malas',
    nome: 'Porta-malas / embutido (Drive e Transferências)',
    depende: ['listar_filhos', 'listar_subpasta', 'enviar_arquivo', 'criar_subpasta', 'ler_criados'],
  },
] as const satisfies readonly { id: string; nome: string; depende: readonly CheckId[] }[]

export type FluxoId = (typeof FLUXOS)[number]['id']
export type EstadoFluxo = 'funciona' | 'quebra' | 'nao_testado'

export type Veredito = {
  tipo: 'pendente' | 'inconclusivo' | 'cobre' | 'parcial' | 'nao_cobre' | 'incompleto'
  titulo: string
  texto: string
  fluxos: { id: FluxoId; nome: string; estado: EstadoFluxo }[]
}

const LEITURA_DO_QUE_EXISTIA: CheckId[] = ['listar_filhos', 'ler_arquivo_existente', 'listar_subpasta']
const ESCRITA: CheckId[] = ['enviar_arquivo', 'criar_subpasta', 'ler_criados']

/** O que não rodou conta como "não testado". */
function mapa(checagens: readonly Checagem[]) {
  const m = new Map(checagens.map((c) => [c.id, c]))
  return (id: CheckId): Estado => m.get(id)?.estado ?? 'nao_testado'
}

export function estadoDoFluxo(depende: readonly CheckId[], estado: (id: CheckId) => Estado): EstadoFluxo {
  const e = depende.map(estado)
  if (e.includes('falhou')) return 'quebra'
  return e.every((x) => x === 'passou') ? 'funciona' : 'nao_testado'
}

/** A tabela de decisão do documento, aplicada ao que o teste mediu. */
export function veredito(checagens: readonly Checagem[], opcoes: { escopoAmplo?: boolean } = {}): Veredito {
  const estado = mapa(checagens)
  const fluxos = FLUXOS.map((f) => ({ id: f.id, nome: f.nome, estado: estadoDoFluxo(f.depende, estado) }))
  const v = (tipo: Veredito['tipo'], titulo: string, texto: string): Veredito => ({ tipo, titulo, texto, fluxos })

  if (opcoes.escopoAmplo)
    return v(
      'inconclusivo',
      'Teste inválido: o token veio com escopo amplo',
      'O Google devolveu um escopo restrito do Drive junto. Remova o acesso em myaccount.google.com/permissions e repita.',
    )
  if (estado('ler_pasta') === 'nao_testado') return v('pendente', 'Escolha a pasta de teste', 'As checagens rodam sozinhas depois da escolha.')
  if (checagens.some((c) => c.estado === 'falhou' && c.configuracao))
    return v(
      'inconclusivo',
      'Inconclusivo: falha de configuração',
      'Uma chamada falhou por configuração (API desligada, token vencido ou rede), não pelo escopo. Corrija e repita.',
    )
  if (estado('ler_pasta') === 'falhou' || ESCRITA.some((id) => estado(id) === 'falhou'))
    return v(
      'nao_cobre',
      'drive.file não serve ao SOBEDESCE',
      'drive.file não lê a pasta escolhida ou não escreve nela → não migrar; só o escopo restrito serve (auditoria paga, CASA).',
    )
  if (LEITURA_DO_QUE_EXISTIA.some((id) => estado(id) === 'falhou'))
    return v(
      'parcial',
      'drive.file cobre só parte',
      'drive.file não lista o conteúdo existente de uma pasta escolhida → o fluxo "navegar pelo Drive inteiro" do SOBEDESCE precisa do escopo restrito (auditoria paga) ou de mudar para seleção de arquivos no Picker. Enviar e criar pastas funcionam.',
    )
  if ([...LEITURA_DO_QUE_EXISTIA, ...ESCRITA].every((id) => estado(id) === 'passou'))
    return v(
      'cobre',
      'drive.file cobre o SOBEDESCE',
      'drive.file cobre: navegar pastas escolhidas, ler o que já existia, enviar e criar pastas → o SOBEDESCE pode ficar no escopo não sensível (sem auditoria paga).',
    )
  return v(
    'incompleto',
    'Faltou o que testar',
    'A pasta precisa ter ao menos um arquivo e uma subpasta com arquivo, criados fora deste app. Escolha outra e repita.',
  )
}

/** Escopos que o token trouxe além do drive.file e se algum é amplo (restrito). */
export function lerEscopos(scope: string | undefined) {
  const lista = (scope ?? '').split(/\s+/).filter(Boolean)
  return {
    temDriveFile: lista.includes(DRIVE_FILE),
    amplos: lista.filter((s) => ESCOPOS_AMPLOS.has(s)),
    outros: lista.filter((s) => s !== DRIVE_FILE),
  }
}

/**
 * Falha que não diz nada sobre o escopo: sem resposta (rede, CSP), 401 (token) ou 403 de API desligada / chave / cota.
 * 404 e 403 de permissão (appNotAuthorizedToFile, insufficientFilePermissions) são o drive.file respondendo.
 */
export function falhaDeConfiguracao(status: number, motivo?: string): boolean {
  if (status === 0 || status === 401 || status >= 500) return true
  if (status === 403 || status === 429)
    return /accessNotConfigured|SERVICE_DISABLED|API_KEY|keyInvalid|ipRefererBlocked|dailyLimitExceeded|userRateLimitExceeded|rateLimitExceeded|RATE_LIMIT/i.test(
      motivo ?? '',
    )
  return false
}

const ROTULO: Record<Estado, string> = { passou: 'Passou', falhou: 'Falhou', nao_testado: 'Não deu para testar' }
const ROTULO_FLUXO: Record<EstadoFluxo, string> = { funciona: 'funciona', quebra: 'quebra', nao_testado: 'não testado' }

export const rotulo = (e: Estado) => ROTULO[e]
export const rotuloFluxo = (e: EstadoFluxo) => ROTULO_FLUXO[e]

/** O texto do "Copiar resultado": sem token, sem id de arquivo, sem nome de pasta (só o que o teste mediu). */
export function textoDoResultado(checagens: readonly Checagem[], v: Veredito, quando: Date, extra: { escopos?: string } = {}): string {
  const estado = new Map(checagens.map((c) => [c.id, c]))
  const linhas = [`Teste drive.file + Picker (Absolute ZRO) · ${quando.toISOString()}`]
  if (extra.escopos) linhas.push(`Escopos do token: ${extra.escopos}`)
  linhas.push('')
  ORDEM.forEach((id, i) => {
    const c = estado.get(id)
    const http = c?.status !== undefined ? ` (HTTP ${c.status})` : ''
    linhas.push(`${i + 1}. ${TITULOS[id]}: ${ROTULO[c?.estado ?? 'nao_testado']}${http}${c ? ` · ${c.detalhe}` : ''}`)
  })
  linhas.push('', `Veredito: ${v.titulo}`, v.texto, '')
  for (const f of v.fluxos) linhas.push(`- ${f.nome}: ${ROTULO_FLUXO[f.estado]}`)
  return linhas.join('\n')
}
