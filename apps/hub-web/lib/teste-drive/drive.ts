// Teste do Drive (/admin/teste-drive): as chamadas à API REST v3 do Drive com o token do navegador. Recebe o `fetch`
// (o do navegador na tela, um falso nos testes) e nunca guarda o token. Só apaga o que ele mesmo criou, por id.
import { falhaDeConfiguracao, PASTA_MIME, type Checagem, type CheckId } from './veredito'

export type Chamar = (url: string, init?: RequestInit) => Promise<Response>
export type Item = { id: string; name: string; mimeType: string }
export type Criados = { arquivo?: string; pasta?: string; arquivoNaSubpasta?: string }

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const TODOS_OS_DRIVES = 'supportsAllDrives=true'
export const NOME_ARQUIVO = 'teste-absolutezro.txt'
export const NOME_PASTA = 'teste-absolutezro'
const ID = /^[\w-]{5,200}$/
const PAGINAS = 5

type Resposta = { status: number; motivo?: string; json?: Record<string, unknown>; texto?: string; bytes?: number }

async function chamar(f: Chamar, token: string, url: string, init: RequestInit = {}, corpo: 'json' | 'bytes' | 'nada' = 'json'): Promise<Resposta> {
  try {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const r = await f(url, { ...init, headers })
    if (!r.ok) {
      const texto = await r.text().catch(() => '')
      return { status: r.status, motivo: motivoDoErro(texto) }
    }
    if (corpo === 'nada') return { status: r.status }
    if (corpo === 'bytes') {
      const b = new Uint8Array(await r.arrayBuffer())
      return { status: r.status, bytes: b.byteLength, texto: new TextDecoder().decode(b) }
    }
    return { status: r.status, json: (await r.json()) as Record<string, unknown> }
  } catch {
    return { status: 0, motivo: 'sem resposta (rede ou CSP)' }
  }
}

/** Os motivos que o Google põe no corpo do erro (errors[].reason, status, details[].reason), juntos. */
export function motivoDoErro(texto: string): string | undefined {
  try {
    const e = (JSON.parse(texto) as { error?: { status?: string; message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } }).error
    if (!e) return undefined
    const partes = [...(e.errors ?? []).map((x) => x.reason), e.status, ...(e.details ?? []).map((x) => x.reason)].filter(Boolean)
    return [...new Set(partes)].join(', ') || e.message?.slice(0, 120)
  } catch {
    return undefined
  }
}

const c = (id: CheckId, estado: Checagem['estado'], detalhe: string, r?: Resposta): Checagem => ({
  id,
  estado,
  detalhe: r?.motivo && estado === 'falhou' ? `${detalhe} (${r.motivo})` : detalhe,
  ...(r ? { status: r.status } : {}),
  ...(r && estado === 'falhou' && falhaDeConfiguracao(r.status, r.motivo) ? { configuracao: true } : {}),
})

const ehGoogleApps = (mime: string) => mime.startsWith('application/vnd.google-apps.')

async function listar(f: Chamar, token: string, pasta: string): Promise<{ r: Resposta; itens: Item[] }> {
  const itens: Item[] = []
  let pagina = ''
  let r: Resposta = { status: 0 }
  for (let i = 0; i < PAGINAS; i++) {
    const q = encodeURIComponent(`'${pasta}' in parents and trashed = false`)
    const url = `${API}?q=${q}&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType)')}&pageSize=200&${TODOS_OS_DRIVES}&includeItemsFromAllDrives=true${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`
    r = await chamar(f, token, url)
    if (r.status !== 200) return { r, itens }
    itens.push(...((r.json?.files as Item[] | undefined) ?? []))
    pagina = typeof r.json?.nextPageToken === 'string' ? r.json.nextPageToken : ''
    if (!pagina) break
  }
  return { r, itens }
}

const lerComeco = (f: Chamar, token: string, id: string) =>
  chamar(f, token, `${API}/${id}?alt=media&${TODOS_OS_DRIVES}`, { headers: { Range: 'bytes=0-1023' } }, 'bytes')

function multipart(metadados: Record<string, unknown>, texto: string) {
  const fronteira = `zro${Math.random().toString(36).slice(2)}`
  const corpo =
    `--${fronteira}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadados)}\r\n` +
    `--${fronteira}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${texto}\r\n--${fronteira}--`
  return { body: corpo, headers: { 'Content-Type': `multipart/related; boundary=${fronteira}` } }
}

const enviar = (f: Chamar, token: string, pai: string, texto: string) =>
  chamar(f, token, `${UPLOAD}?uploadType=multipart&${TODOS_OS_DRIVES}&fields=id,name,parents`, {
    method: 'POST',
    ...multipart({ name: NOME_ARQUIVO, mimeType: 'text/plain', parents: [pai] }, texto),
  })

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * Checagens 1 a 7 numa pasta escolhida no Picker. `esperados`: quantos itens a pessoa diz que existem no primeiro nível.
 * `aoAvancar` recebe cada checagem assim que ela termina (a tela mostra uma a uma).
 */
export async function checarPasta(
  f: Chamar,
  token: string,
  pastaId: string,
  opcoes: { esperados?: number; agora?: Date; aoAvancar?: (c: Checagem) => void } = {},
): Promise<{ checagens: Checagem[]; criados: Criados }> {
  const checagens: Checagem[] = []
  const criados: Criados = {}
  const anota = (x: Checagem) => {
    checagens.push(x)
    opcoes.aoAvancar?.(x)
  }
  if (!ID.test(pastaId)) {
    anota(c('ler_pasta', 'falhou', 'O Picker devolveu um id que não parece do Drive.'))
    return { checagens, criados }
  }

  // 1. Ler a pasta
  const r1 = await chamar(
    f,
    token,
    `${API}/${pastaId}?fields=${encodeURIComponent('id,name,mimeType,capabilities(canListChildren,canAddChildren)')}&${TODOS_OS_DRIVES}`,
  )
  if (r1.status === 200) {
    const cap = (r1.json?.capabilities ?? {}) as { canListChildren?: boolean; canAddChildren?: boolean }
    const sim = (b?: boolean) => (b === undefined ? '?' : b ? 'sim' : 'não')
    anota(
      r1.json?.mimeType === PASTA_MIME
        ? c('ler_pasta', 'passou', `A pasta respondeu. canListChildren: ${sim(cap.canListChildren)}, canAddChildren: ${sim(cap.canAddChildren)}.`, r1)
        : c('ler_pasta', 'falhou', 'O item escolhido não é uma pasta.', r1),
    )
  } else anota(c('ler_pasta', 'falhou', 'O Drive não deixou ler a pasta escolhida.', r1))

  // 2. Listar o que já existe dentro dela
  const { r: r2, itens } = await listar(f, token, pastaId)
  const esperados = opcoes.esperados && opcoes.esperados > 0 ? opcoes.esperados : undefined
  if (r2.status !== 200) anota(c('listar_filhos', 'falhou', 'A listagem da pasta falhou.', r2))
  else if (itens.length === 0)
    anota(
      c(
        'listar_filhos',
        'falhou',
        `Voltou 0 itens, embora a pasta tenha ${esperados ? plural(esperados, 'item', 'itens') : 'arquivos'}: o drive.file não enxerga o que o app não criou.`,
        r2,
      ),
    )
  else if (esperados && itens.length < esperados)
    anota(c('listar_filhos', 'falhou', `Voltou ${itens.length} de ${esperados} itens: parte do que existe não aparece.`, r2))
  else {
    const pastas = itens.filter((i) => i.mimeType === PASTA_MIME).length
    anota(
      c(
        'listar_filhos',
        'passou',
        `Voltou ${plural(itens.length, 'item', 'itens')} (${plural(itens.length - pastas, 'arquivo', 'arquivos')}, ${plural(pastas, 'subpasta', 'subpastas')})${esperados ? `, de ${esperados} esperados` : ''}.`,
        r2,
      ),
    )
  }

  // 3. Ler um arquivo que já existia
  const arquivo = itens.find((i) => i.mimeType !== PASTA_MIME && !ehGoogleApps(i.mimeType) && ID.test(i.id))
  if (!arquivo)
    anota(
      c(
        'ler_arquivo_existente',
        'nao_testado',
        itens.some((i) => i.mimeType !== PASTA_MIME)
          ? 'Só vieram documentos do Google (não baixáveis). Ponha um .txt ou vídeo na pasta.'
          : 'A listagem não trouxe um arquivo para ler.',
      ),
    )
  else {
    const r3 = await lerComeco(f, token, arquivo.id)
    anota(
      r3.status === 200 || r3.status === 206
        ? c('ler_arquivo_existente', 'passou', `Baixou ${plural(r3.bytes ?? 0, 'byte', 'bytes')} do começo de um arquivo que já existia.`, r3)
        : c('ler_arquivo_existente', 'falhou', 'O arquivo apareceu na lista, mas não deu para baixar.', r3),
    )
  }

  // 4. Entrar numa subpasta que já existia
  const sub = itens.find((i) => i.mimeType === PASTA_MIME && ID.test(i.id))
  if (!sub) anota(c('listar_subpasta', 'nao_testado', 'A listagem não trouxe uma subpasta.'))
  else {
    const { r: r4, itens: netos } = await listar(f, token, sub.id)
    anota(
      r4.status !== 200
        ? c('listar_subpasta', 'falhou', 'A listagem da subpasta falhou.', r4)
        : netos.length === 0
          ? c('listar_subpasta', 'falhou', 'Voltou 0 itens dentro da subpasta (ela deve ter um arquivo).', r4)
          : c('listar_subpasta', 'passou', `A subpasta mostrou ${plural(netos.length, 'item', 'itens')}.`, r4),
    )
  }

  // 5. Enviar um arquivo novo
  const texto = `Arquivo de teste da Absolute ZRO (drive.file). Pode apagar. ${(opcoes.agora ?? new Date()).toISOString()}`
  const r5 = await enviar(f, token, pastaId, texto)
  const idArquivo = typeof r5.json?.id === 'string' ? r5.json.id : ''
  if (r5.status === 200 && idArquivo) {
    criados.arquivo = idArquivo
    anota(c('enviar_arquivo', 'passou', `${NOME_ARQUIVO} entrou na pasta.`, r5))
  } else anota(c('enviar_arquivo', 'falhou', 'O Drive recusou o envio para a pasta escolhida.', r5))

  // 6. Criar uma subpasta (e enviar um arquivo dentro dela, como o "Para o Drive" faz)
  const r6 = await chamar(f, token, `${API}?${TODOS_OS_DRIVES}&fields=id,name,parents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: NOME_PASTA, mimeType: PASTA_MIME, parents: [pastaId] }),
  })
  const idPasta = typeof r6.json?.id === 'string' ? r6.json.id : ''
  if (r6.status === 200 && idPasta) {
    criados.pasta = idPasta
    const r6b = await enviar(f, token, idPasta, texto)
    if (r6b.status === 200 && typeof r6b.json?.id === 'string') {
      criados.arquivoNaSubpasta = r6b.json.id
      anota(c('criar_subpasta', 'passou', `${NOME_PASTA}/ criada, com um arquivo dentro.`, r6))
    } else anota(c('criar_subpasta', 'falhou', 'A subpasta foi criada, mas o envio para dentro dela falhou.', r6b))
  } else anota(c('criar_subpasta', 'falhou', 'O Drive recusou criar a subpasta.', r6))

  // 7. Ler de volta o que o app criou
  if (!idArquivo && !idPasta) anota(c('ler_criados', 'nao_testado', 'O app não conseguiu criar nada para ler.'))
  else {
    const r7a = idArquivo ? await chamar(f, token, `${API}/${idArquivo}?alt=media&${TODOS_OS_DRIVES}`, {}, 'bytes') : undefined
    const r7b = idPasta ? await chamar(f, token, `${API}/${idPasta}?fields=id,name&${TODOS_OS_DRIVES}`) : undefined
    const okA = !r7a || (r7a.status === 200 && r7a.texto === texto)
    const okB = !r7b || r7b.status === 200
    const { itens: depois } = await listar(f, token, pastaId)
    const vistos = depois.filter((i) => i.id === idArquivo || i.id === idPasta).length
    const falha = [r7a, r7b].find((r) => r && r.status !== 200)
    anota(
      okA && okB && idArquivo && idPasta
        ? c(
            'ler_criados',
            'passou',
            `Leu o arquivo e a subpasta criados. A pasta agora lista ${plural(depois.length, 'item', 'itens')} (antes: ${itens.length}); ${vistos} de 2 são do app.`,
            r7a ?? r7b,
          )
        : c(
            'ler_criados',
            'falhou',
            !okA
              ? 'O arquivo criado não voltou igual.'
              : !okB
                ? 'Não deu para ler a subpasta criada.'
                : 'Leu o que foi criado, mas o resto não chegou a ser criado.',
            falha ?? r7a ?? r7b,
          ),
    )
  }
  return { checagens, criados }
}

/** Checagem 8: cada arquivo escolhido no Picker (multisseleção): metadados e o começo do conteúdo. */
export async function checarEscolhidos(f: Chamar, token: string, ids: string[]): Promise<Checagem> {
  const validos = ids.filter((id) => ID.test(id))
  if (!validos.length) return c('ler_escolhidos', 'nao_testado', 'Nenhum arquivo escolhido.')
  let lidos = 0
  let ultima: Resposta | undefined
  let falha: Resposta | undefined
  for (const id of validos) {
    const m = await chamar(f, token, `${API}/${id}?fields=id,name,mimeType,size&${TODOS_OS_DRIVES}`)
    ultima = m
    if (m.status !== 200) {
      falha ??= m
      continue
    }
    const mime = typeof m.json?.mimeType === 'string' ? m.json.mimeType : ''
    if (mime === PASTA_MIME || ehGoogleApps(mime)) {
      lidos++
      continue
    }
    const b = await lerComeco(f, token, id)
    ultima = b
    if (b.status === 200 || b.status === 206) lidos++
    else falha ??= b
  }
  const n = validos.length
  return lidos === n
    ? c('ler_escolhidos', 'passou', `${lidos} de ${n} lidos (metadados e começo do conteúdo).`, ultima)
    : c('ler_escolhidos', 'falhou', `${lidos} de ${n} lidos: o drive.file não abriu um arquivo escolhido.`, falha ?? ultima)
}

/** "Limpar o que o teste criou": apaga só os ids que este teste criou (o arquivo de dentro, a subpasta e o arquivo). */
export async function limpar(f: Chamar, token: string, criados: Criados): Promise<{ apagados: number; falhas: number }> {
  let apagados = 0
  let falhas = 0
  for (const id of [criados.arquivoNaSubpasta, criados.pasta, criados.arquivo]) {
    if (!id || !ID.test(id)) continue
    const r = await chamar(f, token, `${API}/${id}?${TODOS_OS_DRIVES}`, { method: 'DELETE' }, 'nada')
    // 404: já tinha saído (a subpasta leva o arquivo de dentro junto).
    if (r.status === 204 || r.status === 200 || r.status === 404) apagados++
    else falhas++
  }
  return { apagados, falhas }
}
