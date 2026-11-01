/**
 * Regras do @ e do perfil profissional (migração 0029, ADR 0029). Puro, sem dependência de servidor: a tela de criar
 * conta e o editor do perfil usam este arquivo (`@zro/auth/arroba`), que vai para o navegador. Por isso a lista de @
 * reservados e os selos dos apps (com nomes de apps que ainda não lançaram) moram em `./arroba-reservadas`, só no
 * servidor (`@zro/auth`). As listas são iguais às do banco (`zro.arroba_reservada`, check de `zro.perfis.funcoes`);
 * tests/integration/perfis.test.ts confere.
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

/** O que a pessoa digitou → como o @ é guardado: sem o "@", sem espaço nas pontas, minúsculas. */
export function normalizarArroba(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/^@+/, '').trim().toLowerCase()
}

/**
 * A forma do @ (null = válido; a mensagem é a que a tela mostra). Sem a lista de reservados: ela fica no servidor
 * (`./arroba-reservadas`, revisão de 01/11/2026: a tela de criar conta não leva nomes de apps que não lançaram). O
 * servidor confere tudo com `validarArroba`.
 */
export function validarFormaArroba(a: string): string | null {
  if (a.length < ARROBA_MIN) return `Use pelo menos ${ARROBA_MIN} caracteres.`
  if (a.length > ARROBA_MAX) return `Use no máximo ${ARROBA_MAX} caracteres.`
  if (!/^[a-z0-9._]+$/.test(a)) return 'Use só letras sem acento, números, ponto e sublinhado.'
  if (/^\.|\.$|\.\./.test(a)) return 'O ponto não pode ficar no começo, no fim nem dobrado.'
  if (!/[a-z]/.test(a)) return 'Use pelo menos uma letra.'
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

/**
 * A mesma conta do banco (zro.sugerir_arroba), sem a parte de "já está ocupado": "João da Silva" → joao.da.silva.
 * `reservada`: a regra dos reservados (o servidor passa a dele, `./arroba-reservadas`); a tela não conhece a lista, e o
 * servidor recusa o reservado com a mensagem de sempre.
 */
export function sugerirArrobaCom(nome: string, email = '', reservada: (a: string) => boolean = () => false): string {
  for (const fonte of [nome, email.split('@')[0] ?? '', 'pessoa']) {
    let b = tirarAcento(fonte)
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 24)
      .replace(/\.+$/, '')
    if (reservada(b)) b = `${b.slice(0, 20)}.pro`
    if (!validarFormaArroba(b) && !reservada(b)) return b
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
