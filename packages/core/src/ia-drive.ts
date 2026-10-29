/**
 * A Z no Google Drive da pessoa, pelo SOBEDESCE (que guarda a conexão do Drive). O HUB chama o SOBEDESCE servidor a
 * servidor com um JWT curto (`assinarPedidoDeApp`, 60 s, uso único) em nome da pessoa: buscar arquivos e listar uma
 * pasta. Só leitura e só metadados; nada é guardado aqui. Contrato: docs/integration-contracts/sobedesce-drive.md.
 *
 * O resultado volta como texto para o modelo (dados, não instruções). Falhas viram frases que a Z explica à pessoa,
 * com o link de onde resolver; nenhuma falha vira arquivo inventado.
 *
 * Também lê as transferências da pessoa (`transferencias.ler`, Fase 1 da Z: só leitura, com fonte e hora do relato) e
 * faz o único pedido que muda algo (`pedirAoComputadorAuditado`): só depois do "sim" à ação exata, sempre auditado.
 */
import { assinarPedidoDeApp } from '@zro/auth'
import type { Database } from '@zro/db'
import { audit } from '@zro/observability'
import type { Actor } from './authz'

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
/** O nome curto de cada formato, como o SOBEDESCE salva ("<nome> (MP4 720p).mp4"; web/src/lib/zro/computador-da-z.ts). */
export const DRIVE_FORMATO_NOME: Record<DriveFormato, string> = {
  mp4: 'MP4',
  'mp4-1080': 'MP4 1080p',
  'mp4-720': 'MP4 720p',
  'mp3-320': 'MP3 320',
  wav: 'WAV',
  m4a: 'M4A',
  jpg: 'JPG',
}

export type DrivePedido =
  | { tipo: 'buscar'; termo: string }
  | { tipo: 'pasta'; pasta: string; ordem: DriveOrdem }
  | { tipo: 'versao'; arquivoId: string; formato: DriveFormato }
  | { tipo: 'computador'; arquivoId: string; formato: DriveFormato }
  | { tipo: 'transferencias' }

const ROTAS: Record<DrivePedido['tipo'], { acao: string; caminho: string }> = {
  buscar: { acao: 'drive.buscar', caminho: '/api/zro/drive/buscar' },
  pasta: { acao: 'drive.pasta', caminho: '/api/zro/drive/pasta' },
  versao: { acao: 'drive.versao', caminho: '/api/zro/drive/versao' },
  computador: { acao: 'drive.computador', caminho: '/api/zro/drive/computador' },
  transferencias: { acao: 'transferencias.ler', caminho: '/api/zro/transferencias' },
}

const SIM =
  /^(sim|s|pode|pode sim|pode pedir|pode mandar|quero|quero sim|claro|ok|okay|beleza|blz|manda|isso|confirmo|confirmado|bora|fechado|faz|faz isso|pede|por favor|perfeito|vai|uhum|aham|yes)\b/
const NAO = /\b(nao|nunca|espera|cancela|cancelar|melhor nao|pare)\b/

/**
 * A última mensagem da pessoa é um "sim" claro à oferta da Z de pedir ao computador? Exige: a mensagem anterior é da
 * Z e fala do computador; a da pessoa começa com uma confirmação, é curta e não traz negação. Na dúvida, não.
 */
export function confirmacaoClara(historico: { papel: 'user' | 'assistant'; texto: string }[], formato?: DriveFormato): boolean {
  const pessoa = historico.at(-1)
  const oferta = historico.at(-2)
  if (pessoa?.papel !== 'user' || oferta?.papel !== 'assistant' || !/computador/i.test(oferta.texto)) return false
  // A ação exata aparece antes do "sim": a oferta da Z nomeia o formato que vai ser pedido.
  if (formato && !oferta.texto.toLowerCase().includes(DRIVE_FORMATO_NOME[formato].toLowerCase())) return false
  const t = pessoa.texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > 0 && t.length <= 160 && SIM.test(t) && !NAO.test(t)
}
/** `codigo`/`pedido` só servem à auditoria (nunca vão ao modelo além do texto). */
export type DriveResposta = { texto: string; erro: boolean; codigo?: string | null; pedido?: { id?: string; novo?: boolean } }

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
  abrir_no_sobedesce?: string | null
  baixar_pelo_sobedesce?: string | null
}

/** Os links do app do SOBEDESCE (products/sobedesce/web/public/app/lib/drive-link.js). */
const ROTA_SD = { pasta: 'drive', abrir: 'arquivo', baixar: 'baixar' } as const
export type LinkSobedesce = keyof typeof ROTA_SD

/**
 * Link do app do SOBEDESCE: `<base>/app/#drive/<pasta>` (pasta), `#arquivo/<id>` (Abrir de um arquivo) ou
 * `#baixar/<id>` (Baixar). Só passa exatamente esse formato, na origem do SOBEDESCE configurada (ou na oficial) e,
 * com `id`, com o id do próprio item; qualquer outra coisa some (a Z não repassa link estranho nem do Google).
 */
export function linkDoSobedesce(v: unknown, base: string, tipo: LinkSobedesce, id?: string): string | undefined {
  if (typeof v !== 'string') return undefined
  try {
    const u = new URL(v)
    const origemOk = u.origin === new URL(base).origin || u.origin === SOBEDESCE_URL_PADRAO
    const m = /^#([a-z]+)\/([A-Za-z0-9_-]{1,200})$/.exec(u.hash)
    if (!origemOk || u.pathname !== '/app/' || u.search || !m || m[1] !== ROTA_SD[tipo]) return undefined
    if (id !== undefined && m[2] !== id) return undefined
    return u.href
  } catch {
    return undefined
  }
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

/**
 * O que a Z lê de cada arquivo: só o necessário para responder e os links do SOBEDESCE (nunca os do Google).
 * Arquivo: `abrir_no_sobedesce` (#arquivo) e `baixar_pelo_sobedesce` (#baixar). Pasta: só `abrir_no_sobedesce` (#drive).
 */
export function arquivoParaIa(a: ArquivoSd, base: string = SOBEDESCE_URL_PADRAO) {
  const v = a.video
  const pasta = a.pasta === true || a.tipo === 'application/vnd.google-apps.folder'
  const id = typeof a.id === 'string' ? a.id : ''
  const abrir = linkDoSobedesce(a.abrir_no_sobedesce, base, pasta ? 'pasta' : 'abrir', id)
  const baixar = pasta ? undefined : linkDoSobedesce(a.baixar_pelo_sobedesce, base, 'baixar', id)
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
    ...(abrir ? { abrir_no_sobedesce: abrir } : {}),
    ...(baixar ? { baixar_pelo_sobedesce: baixar } : {}),
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
        : pedido.tipo === 'transferencias'
          ? {}
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
    return { texto: falhaParaIa(0, null, cfg.base), erro: true, codigo: 'fora_do_ar' }
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !json) {
    const codigo = typeof json?.erro === 'string' ? json.erro : null
    return { texto: falhaParaIa(res.status, codigo, cfg.base), erro: true, codigo: codigo ?? `http_${res.status}` }
  }
  if (pedido.tipo === 'transferencias') return { texto: transferenciasParaIa(json), erro: false }

  if (pedido.tipo === 'buscar') {
    const arquivos = Array.isArray(json.arquivos) ? (json.arquivos as ArquivoSd[]) : []
    if (!arquivos.length) return { texto: `Nada no Drive com "${pedido.termo}" no nome ou no conteúdo.`, erro: false }
    return {
      texto: JSON.stringify({
        busca: pedido.termo,
        arquivos: arquivos.map((a) => arquivoParaIa(a, cfg.base)),
        ...(json.incompleta ? { aviso: 'Um dos Drives não respondeu.' } : {}),
      }),
      erro: false,
    }
  }
  if (pedido.tipo === 'versao') return { texto: versaoParaIa(json, cfg.base, pedido.formato), erro: false }
  if (pedido.tipo === 'computador') {
    const p = (json.pedido ?? {}) as { id?: unknown; novo?: unknown }
    return {
      texto: pedidoParaIa(json, cfg.base),
      erro: false,
      pedido: { id: typeof p.id === 'string' ? p.id : undefined, novo: p.novo === true },
    }
  }
  if (json.nao_achou)
    return { texto: `Nenhuma pasta com "${pedido.pasta}" no nome. Tente buscar_no_drive com outra palavra ou pergunte o nome certo.`, erro: false }
  if (Array.isArray(json.escolher)) {
    const pastas = (json.escolher as { id: string; nome: string; modificado?: string | null; abrir_no_sobedesce?: string | null }[]).map((p) => ({
      id: p.id,
      nome: p.nome,
      modificado: p.modificado ?? undefined,
      abrir_no_sobedesce: linkDoSobedesce(p.abrir_no_sobedesce, cfg.base, 'pasta', p.id),
    }))
    return { texto: JSON.stringify({ varias_pastas: pastas, dica: 'Pergunte qual delas e chame de novo com o id.' }), erro: false }
  }
  const pasta = json.pasta as { id?: string; nome?: string; abrir_no_sobedesce?: string | null } | undefined
  const arquivos = Array.isArray(json.arquivos) ? (json.arquivos as ArquivoSd[]) : []
  return {
    texto: JSON.stringify({
      pasta: { nome: pasta?.nome, abrir_no_sobedesce: linkDoSobedesce(pasta?.abrir_no_sobedesce, cfg.base, 'pasta', pasta?.id) },
      ordem: json.ordem,
      itens: arquivos.map((a) => arquivoParaIa(a, cfg.base)),
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

function versaoParaIa(j: Record<string, unknown>, base: string, formato: DriveFormato): string {
  const original = arquivoParaIa((j.original ?? {}) as ArquivoSd, base)
  const versoes = (Array.isArray(j.versoes) ? (j.versoes as ArquivoSd[]) : []).map((a) => arquivoParaIa(a, base))
  if (j.o_proprio) return JSON.stringify({ ja_esta_no_formato: true, arquivo: original })
  if (versoes.length)
    return JSON.stringify({ versao_pronta: versoes, original: { nome: original.nome }, dica: 'Entregue o Abrir e o Baixar da versão pronta.' })
  const computadores = computadoresParaIa(j.computadores)
  return JSON.stringify({
    versao_pronta: null,
    original,
    ...(j.converte === true && computadores.length && typeof original.nome === 'string' ? { acao_exata: acaoExata(original.nome, formato) } : {}),
    computador_converte_este_tipo: j.converte === true,
    computadores,
    dica: !computadores.length
      ? 'Não há computador com o SOBEDESCE nesta conta: diga o formato real e que converter precisa do SOBEDESCE no computador.'
      : j.converte === true
        ? 'Diga o formato real, mostre a acao_exata como está e pergunte se ela quer que você peça ao computador. Só chame pedir_ao_computador depois do sim.'
        : 'O computador não converte este tipo para o formato pedido: diga o formato real.',
  })
}

const semExtensao = (nome: string) =>
  nome
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .trim()
    .slice(0, 100)

/** A ação exata que a Z mostra antes do "sim" (o que o SOBEDESCE faz, onde salva e que nada é apagado). */
export function acaoExata(nome: string, formato: DriveFormato): string {
  const curto = DRIVE_FORMATO_NOME[formato]
  return `Pedir ao SOBEDESCE do seu computador para converter "${nome}" em ${curto} e salvar na mesma pasta do original no Drive, como "${semExtensao(nome)} (${curto})". O original fica como está.`
}

function pedidoParaIa(j: Record<string, unknown>, base: string = SOBEDESCE_URL_PADRAO): string {
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
    cancelar: `Enquanto o computador não terminar, a pessoa cancela removendo o pedido em ${base}/app/#referencias.`,
  })
}

// ───── transferências (Fase 1 da Z: só leitura) ─────

/** Retrato mais velho que isso: a Z avisa que pode ter mudado. */
export const RELATO_VELHO_MIN = 10
const FUSO = 'America/Sao_Paulo'
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: FUSO })
const dia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO })

/** "14:02" (hoje) ou "27/10 às 14:02" (outro dia), no horário de Brasília. Data inválida: null. */
export function horaDoRelato(isoTexto: unknown, agora = Date.now()): string | null {
  const t = typeof isoTexto === 'string' ? Date.parse(isoTexto) : NaN
  if (!Number.isFinite(t)) return null
  const h = hora.format(t)
  return dia.format(t) === dia.format(agora) ? h : `${dia.format(t)} às ${h}`
}

type CompTransf = Record<string, unknown> & {
  nome?: string
  ligado?: boolean
  fechado?: boolean
  relatado_em?: string
  estado?: string
  estimativa?: { velocidade_bps?: number | null; faltam_s?: number | null }
}

const ESTADO_LEGIVEL: Record<string, string> = {
  enviando: 'enviando',
  baixando: 'baixando',
  pausado: 'pausado',
  parado: 'parado',
  concluido: 'concluído',
  erro: 'parou com erro',
}

/**
 * O retrato do SOBEDESCE → texto para a Z. Cada computador vai com a `fonte` e a hora do relato prontas para citar,
 * os fatos separados da estimativa (velocidade e tempo restante) e um aviso quando o relato é velho. Sem computador:
 * diz que não há dado (nunca um estado inventado).
 */
export function transferenciasParaIa(j: Record<string, unknown>, agora = Date.now()): string {
  const lista = (Array.isArray(j.computadores) ? (j.computadores as CompTransf[]) : []).filter((c) => c && typeof c === 'object')
  if (!lista.length)
    return JSON.stringify({
      sem_dados: true,
      fonte: 'SOBEDESCE',
      dica: 'O SOBEDESCE não tem relato de transferências desta conta nos últimos 7 dias (nenhum computador com o SOBEDESCE aberto e "Acompanhar pelo celular" ligado). Diga que não sabe como estão as transferências e que dá para conferir no app do SOBEDESCE no computador. Não invente estado, arquivo nem prazo.',
    })
  return JSON.stringify({
    fonte: 'SOBEDESCE',
    computadores: lista.map((c) => {
      const t = typeof c.relatado_em === 'string' ? Date.parse(c.relatado_em) : NaN
      const idadeMin = Number.isFinite(t) ? Math.max(0, Math.round((agora - t) / 60_000)) : null
      const asHoras = horaDoRelato(c.relatado_em, agora)
      const { estimativa, nome, ligado, fechado, relatado_em, estado, ...fatos } = c
      const velho = idadeMin === null || idadeMin > RELATO_VELHO_MIN || ligado !== true
      return {
        fonte: `SOBEDESCE · ${nome ?? 'computador'}`,
        citar_como: asHoras ? `segundo o SOBEDESCE, às ${asHoras}` : 'segundo o SOBEDESCE (sem hora do relato)',
        relatado_em,
        relato_ha_min: idadeMin,
        computador_ligado: ligado === true && fechado !== true,
        ...(velho ? { aviso: 'Relato antigo ou computador fechado: pode ter mudado depois. Diga a hora do relato e não afirme que ainda está assim.' } : {}),
        fatos: { estado: estado ? (ESTADO_LEGIVEL[estado] ?? estado) : null, ...fatos },
        estimativa: {
          ...(typeof estimativa?.velocidade_bps === 'number' ? { velocidade_bps: estimativa.velocidade_bps } : {}),
          ...(typeof estimativa?.faltam_s === 'number' ? { faltam_s: estimativa.faltam_s } : {}),
          nota: 'Calculada pelo app no momento do relato; é estimativa, não promessa. Sem número aqui, não dê prazo.',
        },
      }
    }),
  })
}

// ───── o pedido ao computador (piloto da Fase 3), sempre auditado ─────

export const IA_ACAO_COMPUTADOR = 'ia.computador.pedido'

/**
 * `pedir_ao_computador`: confere o "sim" à ação exata (a oferta anterior da Z nomeia o computador e o formato), pede ao
 * SOBEDESCE e registra em `zro.audit_logs` quem pediu, o formato, o resultado e o erro. Nada do conteúdo privado (nome
 * do arquivo, id do Drive, texto da conversa) vai para a auditoria. Recusa por falta de confirmação também fica.
 */
export async function pedirAoComputadorAuditado(
  db: Database,
  turno: { actor: Pick<Actor, 'userId' | 'orgId'>; historico: { papel: 'user' | 'assistant'; texto: string }[] },
  entrada: { arquivoId: string; formato: DriveFormato; confirmado: boolean },
  cfg: DriveConfig = driveConfigDoAmbiente(),
  signal?: AbortSignal,
): Promise<DriveResposta> {
  const { actor } = turno
  const registrar = (resultado: string, extra: { erro?: string | null; pedidoId?: string } = {}) =>
    db
      .asUser({ userId: actor.userId, orgId: actor.orgId }, (tx) =>
        audit(tx, {
          orgId: actor.orgId,
          actorUserId: actor.userId,
          action: IA_ACAO_COMPUTADOR,
          targetType: 'sobedesce_pedido',
          targetId: extra.pedidoId ?? null,
          metadata: { produto: 'sobedesce', formato: entrada.formato, resultado, erro: extra.erro ?? null },
        }),
      )
      .catch(() => {}) // auditoria que falha não desfaz nem inventa o resultado do pedido

  if (!entrada.confirmado || !confirmacaoClara(turno.historico, entrada.formato)) {
    await registrar('recusado', { erro: 'sem_confirmacao' })
    return {
      texto: `Nada foi pedido. Mostre antes a ação exata (${DRIVE_FORMATO_NOME[entrada.formato]}, onde salva) e pergunte se a pessoa quer que você peça ao computador; espere um "sim" claro dela na próxima mensagem.`,
      erro: true,
      codigo: 'sem_confirmacao',
    }
  }
  const r = await driveParaIa(db, actor.userId, { tipo: 'computador', arquivoId: entrada.arquivoId, formato: entrada.formato }, cfg, signal)
  if (r.erro) await registrar('falhou', { erro: r.codigo ?? 'desconhecido' })
  else await registrar(r.pedido?.novo === false ? 'ja_estava_na_fila' : 'pedido', { pedidoId: r.pedido?.id })
  return r
}
