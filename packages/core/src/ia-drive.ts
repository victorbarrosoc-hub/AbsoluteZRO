/**
 * A Z no Google Drive da pessoa, pelo SOBEDESCE (que guarda a conexão do Drive). O HUB chama o SOBEDESCE servidor a
 * servidor com um JWT curto (`assinarPedidoDeApp`, 60 s, uso único) em nome da pessoa: buscar arquivos e listar uma
 * pasta. Só leitura e só metadados; nada é guardado aqui. Contrato: docs/integration-contracts/sobedesce-drive.md.
 *
 * O resultado volta como texto para o modelo (dados, não instruções). Falhas viram frases que a Z explica à pessoa,
 * com o link de onde resolver; nenhuma falha vira arquivo inventado.
 */
import { assinarPedidoDeApp } from '@zro/auth'
import type { Database } from '@zro/db'

export const SOBEDESCE_URL_PADRAO = 'https://sobedesce.com'
export const SOBEDESCE_CLIENT_PADRAO = 'sobedesce-web'
export const DRIVE_ORDENS = ['mais_antigo', 'mais_recente', 'nome'] as const
export type DriveOrdem = (typeof DRIVE_ORDENS)[number]

export type DriveConfig = { base: string; clientId: string; fetch?: typeof fetch; timeoutMs?: number }

export function driveConfigDoAmbiente(env: Record<string, string | undefined> = process.env): DriveConfig {
  return {
    base: (env.ZRO_SOBEDESCE_URL?.trim() || SOBEDESCE_URL_PADRAO).replace(/\/$/, ''),
    clientId: env.ZRO_SOBEDESCE_CLIENT_ID?.trim() || SOBEDESCE_CLIENT_PADRAO,
  }
}

/** Formatos que o computador sabe fazer ("Baixar como…" do SOBEDESCE). */
export const DRIVE_FORMATOS = ['mp4', 'mp4-1080', 'mp4-720', 'mp3-320', 'wav', 'm4a', 'jpg'] as const
export type DriveFormato = (typeof DRIVE_FORMATOS)[number]

export type DrivePedido =
  | { tipo: 'buscar'; termo: string }
  | { tipo: 'pasta'; pasta: string; ordem: DriveOrdem }
  | { tipo: 'versao'; arquivoId: string; formato: DriveFormato }
  | { tipo: 'computador'; arquivoId: string; formato: DriveFormato }

const ROTAS: Record<DrivePedido['tipo'], { acao: string; caminho: string }> = {
  buscar: { acao: 'drive.buscar', caminho: '/api/zro/drive/buscar' },
  pasta: { acao: 'drive.pasta', caminho: '/api/zro/drive/pasta' },
  versao: { acao: 'drive.versao', caminho: '/api/zro/drive/versao' },
  computador: { acao: 'drive.computador', caminho: '/api/zro/drive/computador' },
}

const SIM =
  /^(sim|s|pode|pode sim|pode pedir|pode mandar|quero|quero sim|claro|ok|okay|beleza|blz|manda|isso|confirmo|confirmado|bora|fechado|faz|faz isso|pede|por favor|perfeito|vai|uhum|aham|yes)\b/
const NAO = /\b(nao|nunca|espera|cancela|cancelar|melhor nao|pare)\b/

/**
 * A última mensagem da pessoa é um "sim" claro à oferta da Z de pedir ao computador? Exige: a mensagem anterior é da
 * Z e fala do computador; a da pessoa começa com uma confirmação, é curta e não traz negação. Na dúvida, não.
 */
export function confirmacaoClara(historico: { papel: 'user' | 'assistant'; texto: string }[]): boolean {
  const pessoa = historico.at(-1)
  const oferta = historico.at(-2)
  if (pessoa?.papel !== 'user' || oferta?.papel !== 'assistant' || !/computador/i.test(oferta.texto)) return false
  const t = pessoa.texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > 0 && t.length <= 160 && SIM.test(t) && !NAO.test(t)
}
export type DriveResposta = { texto: string; erro: boolean }

type ArquivoSd = {
  id?: string
  nome?: string
  tipo?: string
  pasta?: boolean
  criado?: string | null
  modificado?: string | null
  tamanho?: number | null
  video?: { largura: number | null; altura: number | null; duracao_s: number | null } | null
  imagem?: { largura: number | null; altura: number | null } | null
  link?: string | null
  link_download?: string | null
}

const TIPOS: [RegExp, string][] = [
  [/^application\/vnd\.google-apps\.folder$/, 'pasta'],
  [/^application\/vnd\.google-apps\.document$/, 'Documento Google'],
  [/^application\/vnd\.google-apps\.spreadsheet$/, 'Planilha Google'],
  [/^application\/vnd\.google-apps\.presentation$/, 'Apresentação Google'],
  [/^application\/vnd\.google-apps\.shortcut$/, 'atalho'],
  [/^application\/pdf$/, 'PDF'],
  [/wordprocessingml|msword/, 'documento Word'],
  [/spreadsheetml|ms-excel|text\/csv/, 'planilha'],
  [/presentationml|ms-powerpoint/, 'apresentação'],
  [/^video\/mp4$/, 'vídeo MP4'],
  [/^video\/quicktime$/, 'vídeo MOV'],
  [/^video\//, 'vídeo'],
  [/^audio\//, 'áudio'],
  [/^image\//, 'imagem'],
  [/zip|x-rar|x-7z|x-tar/, 'arquivo compactado'],
  [/^text\//, 'texto'],
]

/** Tipo em português a partir do mimeType do Drive. */
export function tipoLegivel(mime: string | undefined | null): string {
  if (!mime) return 'arquivo'
  return TIPOS.find(([re]) => re.test(mime))?.[1] ?? 'arquivo'
}

export function tamanhoLegivel(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null
  const un = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1000 && i < un.length - 1) {
    v /= 1000
    i++
  }
  return `${i === 0 ? v : v.toFixed(v < 10 ? 1 : 0).replace('.', ',')} ${un[i]}`
}

const duracao = (s: number | null) => (s === null ? null : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)

/** O que a Z lê de cada arquivo: só o necessário para responder e apontar o link. */
export function arquivoParaIa(a: ArquivoSd) {
  const v = a.video
  const img = a.imagem
  return {
    nome: a.nome,
    tipo: tipoLegivel(a.tipo),
    formato: a.tipo,
    ...(a.criado ? { entrou_no_drive: a.criado } : {}),
    ...(a.modificado ? { modificado: a.modificado } : {}),
    ...(tamanhoLegivel(a.tamanho) ? { tamanho: tamanhoLegivel(a.tamanho) } : {}),
    ...(v && v.largura && v.altura
      ? { resolucao: `${v.largura}×${v.altura}` }
      : img && img.largura && img.altura
        ? { resolucao: `${img.largura}×${img.altura}` }
        : {}),
    ...(v && v.duracao_s !== null ? { duracao: duracao(v.duracao_s) } : {}),
    ...(a.link ? { abrir: a.link } : {}),
    ...(a.link_download ? { baixar: a.link_download } : {}),
    id: a.id,
  }
}

/** Falha do SOBEDESCE → frase para a Z explicar. */
export function falhaParaIa(status: number, codigo: string | null, base: string): string {
  const conta = `${base}/conta`
  switch (codigo) {
    case 'sem_drive':
      return `A pessoa ainda não conectou um Google Drive no SOBEDESCE. Diga que, para você procurar no Drive, ela conecta o Drive em ${conta} (uma vez só).`
    case 'reconectar_drive':
      return `O Google pediu para reconectar o Drive da pessoa. Diga para reconectar em ${conta} e pedir de novo.`
    case 'sem_vinculo':
      return `A conta Absolute ZRO desta pessoa ainda não entrou no SOBEDESCE, que é onde o Drive fica conectado. Diga para entrar em ${base} com a conta Absolute ZRO e conectar o Drive em ${conta}.`
    case 'sem_acesso_zro':
      return 'O SOBEDESCE não está liberado para esta conta, e é por ele que você chega ao Drive. Diga para ver em absolutezro.com/ferramentas.'
    case 'sem_computador':
      return `Não há computador com o SOBEDESCE conectado a esta conta, e é ele que converte. Diga que, para isso, ela instala o SOBEDESCE no computador (${base}) e entra com a mesma conta. Não diga que pediu.`
    case 'nao_achou':
      return 'Esse arquivo não está mais no Drive (ou o id está errado). Procure de novo antes de qualquer coisa.'
    case 'formato_incompativel':
      return 'O computador não converte esse tipo de arquivo para o formato pedido. Diga isso com honestidade. Não diga que pediu.'
    case 'devagar':
      return 'Foram muitas consultas ao Drive em pouco tempo. Diga para esperar uns minutos e pedir de novo.'
    default:
      return `O Drive não respondeu agora (SOBEDESCE ${status || 'fora do ar'}). Diga que não conseguiu olhar o Drive neste momento e para tentar de novo em instantes. Não invente arquivo.`
  }
}

/**
 * Faz o pedido ao SOBEDESCE em nome de `sub` (o id da pessoa na Absolute ZRO) e devolve o texto para o modelo.
 */
export async function driveParaIa(
  db: Database,
  sub: string,
  pedido: DrivePedido,
  cfg: DriveConfig = driveConfigDoAmbiente(),
  signal?: AbortSignal,
): Promise<DriveResposta> {
  const { acao, caminho } = ROTAS[pedido.tipo]
  const corpo =
    pedido.tipo === 'buscar'
      ? { termo: pedido.termo }
      : pedido.tipo === 'pasta'
        ? { pasta: pedido.pasta, ordem: pedido.ordem }
        : { arquivoId: pedido.arquivoId, formato: pedido.formato }
  const token = await assinarPedidoDeApp(db, { sub, aud: cfg.clientId, acao })
  let res: Response
  try {
    const tempo = AbortSignal.timeout(cfg.timeoutMs ?? 20_000)
    res = await (cfg.fetch ?? fetch)(`${cfg.base}${caminho}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corpo),
      signal: signal ? AbortSignal.any([signal, tempo]) : tempo,
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    return { texto: falhaParaIa(0, null, cfg.base), erro: true }
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !json) return { texto: falhaParaIa(res.status, typeof json?.erro === 'string' ? json.erro : null, cfg.base), erro: true }

  if (pedido.tipo === 'buscar') {
    const arquivos = Array.isArray(json.arquivos) ? (json.arquivos as ArquivoSd[]) : []
    if (!arquivos.length) return { texto: `Nada no Drive com "${pedido.termo}" no nome ou no conteúdo.`, erro: false }
    return {
      texto: JSON.stringify({
        busca: pedido.termo,
        arquivos: arquivos.map(arquivoParaIa),
        ...(json.incompleta ? { aviso: 'Um dos Drives não respondeu.' } : {}),
      }),
      erro: false,
    }
  }
  if (pedido.tipo === 'versao') return { texto: versaoParaIa(json), erro: false }
  if (pedido.tipo === 'computador') return { texto: pedidoParaIa(json), erro: false }
  if (json.nao_achou)
    return { texto: `Nenhuma pasta com "${pedido.pasta}" no nome. Tente buscar_no_drive com outra palavra ou pergunte o nome certo.`, erro: false }
  if (Array.isArray(json.escolher)) {
    const pastas = (json.escolher as { id: string; nome: string; modificado?: string | null }[]).map((p) => ({
      id: p.id,
      nome: p.nome,
      modificado: p.modificado ?? undefined,
    }))
    return { texto: JSON.stringify({ varias_pastas: pastas, dica: 'Pergunte qual delas e chame de novo com o id.' }), erro: false }
  }
  const pasta = json.pasta as { nome?: string; link?: string | null } | undefined
  const arquivos = Array.isArray(json.arquivos) ? (json.arquivos as ArquivoSd[]) : []
  return {
    texto: JSON.stringify({
      pasta: { nome: pasta?.nome, abrir: pasta?.link ?? undefined },
      ordem: json.ordem,
      itens: arquivos.map(arquivoParaIa),
      ...(arquivos.length ? {} : { vazia: true }),
      ...(json.mais ? { aviso: 'A pasta tem mais itens além destes.' } : {}),
    }),
    erro: false,
  }
}

type Computador = { nome?: string; aberto_agora?: boolean; usado_ha_pouco?: boolean; visto_em?: string }
const computadoresParaIa = (v: unknown) =>
  (Array.isArray(v) ? (v as Computador[]) : []).map((c) => ({
    nome: c.nome,
    estado: c.aberto_agora ? 'aberto agora' : c.usado_ha_pouco ? 'usado há pouco' : 'fechado',
    visto_em: c.visto_em,
  }))

function versaoParaIa(j: Record<string, unknown>): string {
  const original = arquivoParaIa((j.original ?? {}) as ArquivoSd)
  const versoes = (Array.isArray(j.versoes) ? (j.versoes as ArquivoSd[]) : []).map(arquivoParaIa)
  if (j.o_proprio) return JSON.stringify({ ja_esta_no_formato: true, arquivo: original })
  if (versoes.length) return JSON.stringify({ versao_pronta: versoes, original: { nome: original.nome }, dica: 'Entregue o link de baixar da versão pronta.' })
  const computadores = computadoresParaIa(j.computadores)
  return JSON.stringify({
    versao_pronta: null,
    original,
    computador_converte_este_tipo: j.converte === true,
    computadores,
    dica: !computadores.length
      ? 'Não há computador com o SOBEDESCE nesta conta: diga o formato real e que converter precisa do SOBEDESCE no computador.'
      : j.converte === true
        ? 'Diga o formato real e pergunte se ela quer que você peça ao computador para converter. Só chame pedir_ao_computador depois do sim.'
        : 'O computador não converte este tipo para o formato pedido: diga o formato real.',
  })
}

function pedidoParaIa(j: Record<string, unknown>): string {
  const p = (j.pedido ?? {}) as { status?: string; novo?: boolean }
  const computadores = computadoresParaIa(j.computadores)
  const algumLigado = computadores.some((c) => c.estado !== 'fechado')
  return JSON.stringify({
    pedido_feito: true,
    ja_estava_na_fila: p.novo === false,
    status: p.status,
    formato: j.formato,
    arquivo: (j.original as { nome?: string } | undefined)?.nome,
    computadores,
    quando: algumLigado
      ? 'O computador pega em até um minuto, com o SOBEDESCE aberto.'
      : 'Nenhum computador está aberto agora: o pedido espera até o SOBEDESCE abrir no computador.',
    onde_fica: j.destino,
    acompanhar: j.acompanhar,
  })
}
