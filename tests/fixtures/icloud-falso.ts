/**
 * iCloud Mail de mentira para o Correio do console (ADR 0034), nos testes de integração e nas capturas: um IMAP e um
 * SMTP locais, em memória, sem TLS e sem rede. O IMAP cobre só o que o HUB usa pelo imapflow (CAPABILITY, LOGIN,
 * NAMESPACE, LIST/LSUB, SELECT/EXAMINE, UID SEARCH, FETCH e UID FETCH com cabeçalhos e corpo, UID STORE, APPEND,
 * LOGOUT). O SMTP aceita AUTH PLAIN, MAIL, RCPT e DATA e guarda o que chegou.
 */
import net, { type AddressInfo } from 'node:net'

export type MensagemFalsa = { uid: number; flags: Set<string>; raw: Buffer; data: Date }
export type IcloudFalso = Awaited<ReturnType<typeof iniciarIcloudFalso>>

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')
const internalDate = (d: Date) =>
  `"${pad(d.getUTCDate())}-${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000"`

/** Cabeçalhos da mensagem: nome minúsculo → linhas originais (com as continuações). */
function cabecalhos(raw: Buffer): { nome: string; linhas: string }[] {
  const texto = raw.toString('latin1')
  const fim = texto.search(/\r?\n\r?\n/)
  const bloco = fim >= 0 ? texto.slice(0, fim) : texto
  const out: { nome: string; linhas: string }[] = []
  for (const l of bloco.split(/\r?\n/)) {
    if (/^[ \t]/.test(l) && out.length) out[out.length - 1]!.linhas += `\r\n${l}`
    else {
      const i = l.indexOf(':')
      if (i > 0) out.push({ nome: l.slice(0, i).trim().toLowerCase(), linhas: l })
    }
  }
  return out
}

const valorDe = (raw: Buffer, nome: string) =>
  cabecalhos(raw)
    .filter((h) => h.nome === nome)
    .map((h) => h.linhas.slice(h.linhas.indexOf(':') + 1).replace(/\r\n[ \t]+/g, ' '))
    .join(' ')

// ───────────── leitura de comandos IMAP ─────────────

type Token = string | Token[]

/** Tokeniza argumentos IMAP (átomos, "strings", literais já lidos, listas entre parênteses). */
function tokens(s: string, literais: Buffer[]): Token[] {
  let i = 0
  const lista = (): Token[] => {
    const out: Token[] = []
    while (i < s.length) {
      const c = s[i]!
      if (c === ' ') i++
      else if (c === ')') {
        i++
        return out
      } else if (c === '(') {
        i++
        out.push(lista())
      } else if (c === '"') {
        let v = ''
        i++
        while (i < s.length && s[i] !== '"') {
          if (s[i] === '\\') i++
          v += s[i]
          i++
        }
        i++
        out.push(v)
      } else if (c === '\u0000') {
        i++
        out.push(literais.shift()!.toString('utf8'))
      } else {
        let v = ''
        let fundo = 0
        while (i < s.length && (fundo > 0 || (s[i] !== ' ' && s[i] !== ')' && s[i] !== '('))) {
          if (s[i] === '[') fundo++
          if (s[i] === ']') fundo--
          v += s[i]
          i++
        }
        out.push(v)
      }
    }
    return out
  }
  return lista()
}

/** Faixa de números (1:*, 3, 2,5:7) contra o maior número existente. */
function naFaixa(faixa: string, n: number, maior: number): boolean {
  return faixa.split(',').some((parte) => {
    const [a, b] = parte.split(':')
    const ini = a === '*' ? maior : Number(a)
    const fim = b === undefined ? ini : b === '*' ? maior : Number(b)
    return n >= Math.min(ini, fim) && n <= Math.max(ini, fim)
  })
}

/** Avalia o critério do SEARCH (OR, NOT, TO, CC, FROM, SUBJECT, HEADER, ALL, SEEN, UNSEEN, UID e grupos). */
function avaliar(crit: Token[], m: MensagemFalsa, maiorUid: number): boolean {
  let i = 0
  const um = (): boolean => {
    const t = crit[i++]
    if (Array.isArray(t)) return avaliar(t, m, maiorUid)
    const k = String(t).toUpperCase()
    const tem = (campo: string, v: Token | undefined) => valorDe(m.raw, campo).toLowerCase().includes(String(v).toLowerCase())
    switch (k) {
      case 'ALL':
        return true
      case 'OR': {
        const a = um()
        const b = um()
        return a || b
      }
      case 'NOT':
        return !um()
      case 'TO':
      case 'CC':
      case 'FROM':
      case 'SUBJECT':
        return tem(k.toLowerCase(), crit[i++])
      case 'HEADER': {
        const nome = String(crit[i++]).toLowerCase()
        return tem(nome, crit[i++])
      }
      case 'SEEN':
        return m.flags.has('\\Seen')
      case 'UNSEEN':
        return !m.flags.has('\\Seen')
      case 'UID':
        return naFaixa(String(crit[i++]), m.uid, maiorUid)
      case 'CHARSET':
        i++
        return true
      default:
        return true
    }
  }
  let ok = true
  while (i < crit.length) ok = um() && ok
  return ok
}

export async function iniciarIcloudFalso(o: { usuario?: string; senha?: string; remetentes?: string[] } = {}) {
  const usuario = o.usuario ?? 'titular@icloud.test'
  const senha = o.senha ?? 'abcd-efgh-ijkl-mnop'
  const estado = {
    pastas: new Map<string, MensagemFalsa[]>([
      ['INBOX', []],
      ['Sent Messages', []],
    ]),
    proximoUid: new Map<string, number>([
      ['INBOX', 1],
      ['Sent Messages', 1],
    ]),
    /** O que chegou pelo SMTP. */
    enviados: [] as { de: string; para: string[]; raw: Buffer }[],
    /** Comandos IMAP recebidos (para conferir que nada escreve no INBOX sem querer). */
    comandos: [] as string[],
    /** Remetentes que o SMTP aceita (o iCloud só deixa sair pelos endereços da conta). */
    remetentes: new Set((o.remetentes ?? ['victor@absolutezro.com', 'contato@absolutezro.com', 'financeiro@absolutezro.com']).map((r) => r.toLowerCase())),
  }

  function guardar(pasta: string, raw: Buffer, flags: string[] = [], data = new Date()): MensagemFalsa {
    const uid = estado.proximoUid.get(pasta) ?? 1
    estado.proximoUid.set(pasta, uid + 1)
    const m = { uid, flags: new Set(flags), raw, data }
    estado.pastas.get(pasta)!.push(m)
    return m
  }

  // ───────────── IMAP ─────────────
  const imap = net.createServer((sock) => {
    let buf = Buffer.alloc(0)
    let aberta: string | null = null
    let soLeitura = false
    let logado = false
    const linhas: string[] = []
    const literais: Buffer[] = []
    let faltaLiteral = 0
    const escrever = (s: string | Buffer) => sock.write(s)
    escrever('* OK [CAPABILITY IMAP4rev1 LITERAL+ UIDPLUS NAMESPACE] iCloud falso pronto\r\n')

    const capacidades = 'IMAP4rev1 LITERAL+ UIDPLUS NAMESPACE'

    function fetchItens(m: MensagemFalsa, seq: number, pedido: string): Buffer[] {
      const partes: Buffer[] = []
      const txt: string[] = []
      if (/\bUID\b/i.test(pedido)) txt.push(`UID ${m.uid}`)
      if (/\bFLAGS\b/i.test(pedido)) txt.push(`FLAGS (${[...m.flags].join(' ')})`)
      if (/RFC822\.SIZE/i.test(pedido)) txt.push(`RFC822.SIZE ${m.raw.length}`)
      if (/INTERNALDATE/i.test(pedido)) txt.push(`INTERNALDATE ${internalDate(m.data)}`)
      partes.push(Buffer.from(`* ${seq} FETCH (${txt.join(' ')}`))
      const campos = /BODY\.PEEK\[HEADER\.FIELDS \(([^)]*)\)\]/i.exec(pedido)
      if (campos) {
        const nomes = campos[1]!
          .split(/\s+/)
          .filter(Boolean)
          .map((n) => n.replace(/"/g, '').toLowerCase())
        const corpo = Buffer.from(
          cabecalhos(m.raw)
            .filter((h) => nomes.includes(h.nome))
            .map((h) => `${h.linhas}\r\n`)
            .join('') + '\r\n',
          'latin1',
        )
        partes.push(Buffer.from(` BODY[HEADER.FIELDS (${campos[1]!.toUpperCase()})] {${corpo.length}}\r\n`), corpo)
      }
      if (/BODY(\.PEEK)?\[\]/i.test(pedido)) {
        partes.push(Buffer.from(` BODY[] {${m.raw.length}}\r\n`), m.raw)
        if (!/BODY\.PEEK\[\]/i.test(pedido)) m.flags.add('\\Seen')
      }
      partes.push(Buffer.from(')\r\n'))
      return partes
    }

    function comando(linha: string, lits: Buffer[]) {
      const sp = linha.indexOf(' ')
      const tag = linha.slice(0, sp)
      let resto = linha.slice(sp + 1)
      let nome = resto.split(' ')[0]!.toUpperCase()
      resto = resto.slice(nome.length).trim()
      let porUid = false
      if (nome === 'UID') {
        porUid = true
        nome = resto.split(' ')[0]!.toUpperCase()
        resto = resto.slice(nome.length).trim()
      }
      estado.comandos.push(`${porUid ? 'UID ' : ''}${nome}`)
      const ok = (t = `${nome} completed`) => escrever(`${tag} OK ${t}\r\n`)
      const literaisDoComando = [...lits]
      const args = tokens(resto, lits)
      const caixa = aberta ? estado.pastas.get(aberta)! : []
      const maiorUid = caixa.reduce((n, m) => Math.max(n, m.uid), 0)

      if (nome === 'CAPABILITY') {
        escrever(`* CAPABILITY ${capacidades}\r\n`)
        return ok()
      }
      if (nome === 'NOOP' || nome === 'CHECK') return ok()
      if (nome === 'LOGOUT') {
        escrever('* BYE até logo\r\n')
        ok()
        return sock.end()
      }
      if (nome === 'LOGIN') {
        if (args[0] === usuario && args[1] === senha) {
          logado = true
          return ok(`[CAPABILITY ${capacidades}] LOGIN completed`)
        }
        return escrever(`${tag} NO [AUTHENTICATIONFAILED] Authentication failed.\r\n`)
      }
      if (!logado) return escrever(`${tag} BAD Log in first\r\n`)
      if (nome === 'NAMESPACE') {
        escrever('* NAMESPACE (("" "/")) NIL NIL\r\n')
        return ok()
      }
      if (nome === 'LIST' || nome === 'LSUB') {
        escrever(`* ${nome} (\\HasNoChildren) "/" INBOX\r\n`)
        escrever(`* ${nome} (\\HasNoChildren \\Sent) "/" "Sent Messages"\r\n`)
        return ok()
      }
      if (nome === 'SELECT' || nome === 'EXAMINE') {
        const pasta = String(args[0])
        const lista = estado.pastas.get(pasta === 'inbox' ? 'INBOX' : pasta)
        if (!lista) return escrever(`${tag} NO [NONEXISTENT] Mailbox does not exist\r\n`)
        aberta = pasta.toUpperCase() === 'INBOX' ? 'INBOX' : pasta
        soLeitura = nome === 'EXAMINE'
        escrever('* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n')
        escrever('* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft \\*)] Flags permitted\r\n')
        escrever(`* ${lista.length} EXISTS\r\n* 0 RECENT\r\n`)
        escrever(`* OK [UIDVALIDITY 1] UIDs valid\r\n* OK [UIDNEXT ${estado.proximoUid.get(aberta)}] Predicted next UID\r\n`)
        return ok(`[${soLeitura ? 'READ-ONLY' : 'READ-WRITE'}] ${nome} completed`)
      }
      if (nome === 'CLOSE' || nome === 'UNSELECT') {
        aberta = null
        return ok()
      }
      if (nome === 'SEARCH') {
        if (!aberta) return escrever(`${tag} BAD No mailbox selected\r\n`)
        const achou = caixa.map((m, i) => ({ m, seq: i + 1 })).filter(({ m }) => avaliar(args, m, maiorUid))
        escrever(`* SEARCH${achou.map(({ m, seq }) => ` ${porUid ? m.uid : seq}`).join('')}\r\n`)
        return ok()
      }
      if (nome === 'FETCH') {
        if (!aberta) return escrever(`${tag} BAD No mailbox selected\r\n`)
        const faixa = String(args[0])
        const pedido = resto.slice(faixa.length)
        caixa.forEach((m, i) => {
          const alvo = porUid ? m.uid : i + 1
          if (!naFaixa(faixa, alvo, porUid ? maiorUid : caixa.length)) return
          for (const p of fetchItens(m, i + 1, pedido)) escrever(p)
        })
        return ok()
      }
      if (nome === 'STORE') {
        if (!aberta || soLeitura) return escrever(`${tag} NO Read-only mailbox\r\n`)
        const faixa = String(args[0])
        const modo = String(args[1]).toUpperCase()
        const flags = (Array.isArray(args[2]) ? args[2] : [args[2]]).map(String)
        caixa.forEach((m, i) => {
          if (!naFaixa(faixa, porUid ? m.uid : i + 1, porUid ? maiorUid : caixa.length)) return
          if (modo.startsWith('+')) flags.forEach((f) => m.flags.add(f))
          else if (modo.startsWith('-')) flags.forEach((f) => m.flags.delete(f))
          else m.flags = new Set(flags)
          if (!modo.endsWith('.SILENT')) escrever(`* ${i + 1} FETCH (UID ${m.uid} FLAGS (${[...m.flags].join(' ')}))\r\n`)
        })
        return ok()
      }
      if (nome === 'APPEND') {
        const pasta = String(args[0])
        if (!estado.pastas.has(pasta)) return escrever(`${tag} NO [TRYCREATE] Mailbox does not exist\r\n`)
        const flags = Array.isArray(args[1]) ? args[1].map(String) : []
        const raw = literaisDoComando[literaisDoComando.length - 1] ?? Buffer.alloc(0)
        const m = guardar(pasta, raw, flags)
        return ok(`[APPENDUID 1 ${m.uid}] APPEND completed`)
      }
      return escrever(`${tag} BAD Unknown command\r\n`)
    }

    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      for (;;) {
        if (faltaLiteral > 0) {
          if (buf.length < faltaLiteral) return
          literais.push(buf.subarray(0, faltaLiteral))
          buf = buf.subarray(faltaLiteral)
          faltaLiteral = 0
          linhas.push('\u0000')
          continue
        }
        const fim = buf.indexOf('\r\n')
        if (fim < 0) return
        const linha = buf.subarray(0, fim).toString('utf8')
        buf = buf.subarray(fim + 2)
        const lit = /\{(\d+)(\+?)\}$/.exec(linha)
        if (lit) {
          linhas.push(linha.slice(0, lit.index))
          faltaLiteral = Number(lit[1])
          if (!lit[2]) escrever('+ Ready for literal data\r\n')
          continue
        }
        linhas.push(linha)
        const completa = linhas.join('')
        const lits = literais.splice(0)
        linhas.length = 0
        try {
          comando(completa, lits)
        } catch {
          escrever(`${completa.split(' ')[0]} BAD Erro no servidor falso\r\n`)
        }
      }
    })
    sock.on('error', () => {})
  })

  // ───────────── SMTP ─────────────
  const smtp = net.createServer((sock) => {
    let buf = ''
    let lendoDados = false
    let dados: string[] = []
    let de = ''
    let para: string[] = []
    let logado = false
    const w = (s: string) => sock.write(`${s}\r\n`)
    w('220 smtp.falso ESMTP')
    sock.setEncoding('latin1')
    sock.on('data', (chunk: string) => {
      buf += chunk
      let fim: number
      while ((fim = buf.indexOf('\r\n')) >= 0) {
        const linha = buf.slice(0, fim)
        buf = buf.slice(fim + 2)
        if (lendoDados) {
          if (linha === '.') {
            lendoDados = false
            estado.enviados.push({ de, para, raw: Buffer.from(dados.join('\r\n') + '\r\n', 'latin1') })
            dados = []
            w('250 2.0.0 Ok: queued')
          } else dados.push(linha.startsWith('..') ? linha.slice(1) : linha)
          continue
        }
        const cmd = linha.slice(0, 4).toUpperCase()
        if (cmd === 'EHLO' || cmd === 'HELO') {
          sock.write('250-smtp.falso\r\n250-AUTH PLAIN\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n')
        } else if (cmd === 'AUTH') {
          const partes = linha.split(' ')
          const credencial = Buffer.from(partes[2] ?? '', 'base64').toString('utf8').split('\u0000')
          if (credencial[1] === usuario && credencial[2] === senha) {
            logado = true
            w('235 2.7.0 Authentication successful')
          } else w('535 5.7.8 Authentication credentials invalid')
        } else if (cmd === 'MAIL') {
          if (!logado) w('530 5.7.0 Authentication required')
          else {
            de = (/<([^>]*)>/.exec(linha)?.[1] ?? '').toLowerCase()
            para = []
            if (estado.remetentes.has(de)) w('250 2.1.0 Ok')
            else w('550 5.7.1 Sender address rejected: not owned by user')
          }
        } else if (cmd === 'RCPT') {
          para.push((/<([^>]*)>/.exec(linha)?.[1] ?? '').toLowerCase())
          w('250 2.1.5 Ok')
        } else if (cmd === 'DATA') {
          lendoDados = true
          w('354 End data with <CR><LF>.<CR><LF>')
        } else if (cmd === 'RSET') {
          de = ''
          para = []
          w('250 2.0.0 Ok')
        } else if (cmd === 'NOOP') w('250 2.0.0 Ok')
        else if (cmd === 'QUIT') {
          w('221 2.0.0 Bye')
          sock.end()
        } else w('502 5.5.2 Command not recognized')
      }
    })
    sock.on('error', () => {})
  })

  const ouvir = (s: net.Server) => new Promise<number>((ok) => s.listen(0, '127.0.0.1', () => ok((s.address() as AddressInfo).port)))
  const portaImap = await ouvir(imap)
  const portaSmtp = await ouvir(smtp)

  return {
    estado,
    usuario,
    senha,
    portaImap,
    portaSmtp,
    /** Variáveis de ambiente que apontam o Correio para cá. */
    env: {
      ICLOUD_MAIL_USER: usuario,
      ICLOUD_MAIL_APP_PASSWORD: senha,
      ZRO_CORREIO_TESTE_IMAP: `127.0.0.1:${portaImap}`,
      ZRO_CORREIO_TESTE_SMTP: `127.0.0.1:${portaSmtp}`,
    },
    /** Uma mensagem nova no INBOX. */
    receber: (raw: string | Buffer, opts: { lida?: boolean; data?: Date } = {}) =>
      guardar('INBOX', Buffer.isBuffer(raw) ? raw : Buffer.from(raw.replace(/\r?\n/g, '\r\n'), 'utf8'), opts.lida ? ['\\Seen'] : [], opts.data),
    fechar: () => Promise.all([new Promise((ok) => imap.close(ok)), new Promise((ok) => smtp.close(ok))]),
  }
}
