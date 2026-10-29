/**
 * Regras do @ e do perfil profissional (migração 0029, ADR 0029). Puro, sem dependência de servidor: a tela de criar
 * conta e o editor do perfil usam o mesmo arquivo (`@zro/auth/arroba`). As listas são iguais às do banco
 * (`zro.arroba_reservada`, check de `zro.perfis.funcoes`); tests/integration/perfis.test.ts confere.
 */

export const ARROBA_MIN = 3
export const ARROBA_MAX = 30
export const BIO_MAX = 280
export const CIDADE_MAX = 80
export const FUNCAO_OUTRA_MAX = 40
export const PORTFOLIO_MAX = 300
/** Trocas de @ feitas pela pessoa numa janela de 30 dias (a saída da sugestão automática não conta). */
export const TROCAS_POR_MES = 2
/** Por quanto tempo um @ antigo ainda leva ao perfil (e fica guardado para a pessoa). */
export const DIAS_ARROBA_ANTIGA = 90

/** Comparadas sem ponto e sem sublinhado ("absolute.zro" = "absolutezro"). */
export const ARROBAS_RESERVADAS = [
  'absolutezro',
  'absolute',
  'zro',
  'admin',
  'administrador',
  'administracao',
  'adm',
  'root',
  'sistema',
  'system',
  'suporte',
  'support',
  'ajuda',
  'help',
  'contato',
  'oficial',
  'official',
  'staff',
  'equipe',
  'team',
  'moderacao',
  'seguranca',
  'security',
  'privacidade',
  'termos',
  'financeiro',
  'billing',
  'cobranca',
  'noreply',
  'postmaster',
  'abuse',
  'api',
  'hub',
  'app',
  'apps',
  'www',
  'mail',
  'email',
  'perfil',
  'conta',
  'contas',
  'login',
  'entrar',
  'sair',
  'cadastro',
  'convite',
  'convites',
  'busca',
  'pessoas',
  'null',
  'undefined',
  'anonimo',
  'ia',
  'maestro',
  'sobedesce',
  'synquei',
  'nossom',
  'tpeasy',
  'revela',
  'aeon',
  'carrodofreela',
  'carro',
  'freela',
  'freelas',
] as const

/** Funções do audiovisual (lista fixa, decisão do titular) + "Outra" com texto livre. */
export const FUNCOES_PERFIL = [
  { chave: 'direcao', nome: 'Direção' },
  { chave: 'producao', nome: 'Produção' },
  { chave: 'camera', nome: 'Câmera' },
  { chave: 'edicao', nome: 'Edição' },
  { chave: 'color', nome: 'Color' },
  { chave: 'som', nome: 'Som' },
  { chave: 'drone', nome: 'Drone' },
  { chave: 'fotografia', nome: 'Fotografia' },
  { chave: 'motion', nome: 'Motion' },
  { chave: 'roteiro', nome: 'Roteiro' },
  { chave: 'outra', nome: 'Outra' },
] as const
export type FuncaoPerfil = (typeof FUNCOES_PERFIL)[number]['chave']
export const ehFuncaoPerfil = (v: unknown): v is FuncaoPerfil => typeof v === 'string' && FUNCOES_PERFIL.some((f) => f.chave === v)
export const nomeDaFuncao = (k: string) => FUNCOES_PERFIL.find((f) => f.chave === k)?.nome ?? k

/** Selo de cada app no perfil (só aparece quando a pessoa liga E já usa o app). */
export const SELO_TEXTO: Record<string, string> = {
  'carro-do-freela': 'Freela no Carro do Freela',
  sobedesce: 'Usa SOBEDESCE',
  synquei: 'Usa Synquei',
  tpeasy: 'Usa TPeasy',
  'ai-edit': 'Usa AEON',
  nossom: 'Usa NOSSOM',
  finishing: 'Usa Revela',
  maestro: 'Usa Maestro',
}
export const textoDoSelo = (produto: string, nome?: string) => SELO_TEXTO[produto] ?? `Usa ${nome ?? produto}`

/** O que a pessoa digitou → como o @ é guardado: sem o "@", sem espaço nas pontas, minúsculas. */
export function normalizarArroba(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/^@+/, '').trim().toLowerCase()
}

export function arrobaReservada(a: string): boolean {
  return (ARROBAS_RESERVADAS as readonly string[]).includes(a.replace(/[._]/g, ''))
}

/** null = válido. A mensagem é a que a tela mostra. */
export function validarArroba(a: string): string | null {
  if (a.length < ARROBA_MIN) return `Use pelo menos ${ARROBA_MIN} caracteres.`
  if (a.length > ARROBA_MAX) return `Use no máximo ${ARROBA_MAX} caracteres.`
  if (!/^[a-z0-9._]+$/.test(a)) return 'Use só letras sem acento, números, ponto e sublinhado.'
  if (/^\.|\.$|\.\./.test(a)) return 'O ponto não pode ficar no começo, no fim nem dobrado.'
  if (!/[a-z]/.test(a)) return 'Use pelo menos uma letra.'
  if (arrobaReservada(a)) return 'Esse @ é reservado. Escolha outro.'
  return null
}

const SEM_ACENTO = { de: 'áàâãäåéèêëíìîïóòôõöúùûüçñý', para: 'aaaaaaeeeeiiiiooooouuuucny' }
const tirarAcento = (t: string) =>
  [...t.toLowerCase()]
    .map((c) => {
      const i = SEM_ACENTO.de.indexOf(c)
      return i < 0 ? c : SEM_ACENTO.para[i]
    })
    .join('')

/** A mesma conta do banco (zro.sugerir_arroba), sem a parte de "já está ocupado": "João da Silva" → joao.da.silva. */
export function sugerirArroba(nome: string, email = ''): string {
  for (const fonte of [nome, email.split('@')[0] ?? '', 'pessoa']) {
    let b = tirarAcento(fonte)
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 24)
      .replace(/\.+$/, '')
    if (arrobaReservada(b)) b = `${b.slice(0, 20)}.pro`
    if (!validarArroba(b)) return b
  }
  return 'pessoa'
}

/** Link de portfólio: só https (o perfil nunca leva a http ou a esquema estranho). */
export function validarPortfolio(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (v.length > PORTFOLIO_MAX) return 'Link longo demais.'
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return 'Use um link https:// completo.'
  } catch {
    return 'Use um link https:// completo.'
  }
  if (/\s/.test(v)) return 'Use um link https:// completo.'
  return null
}
