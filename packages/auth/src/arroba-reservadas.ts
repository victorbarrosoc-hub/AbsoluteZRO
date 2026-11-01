/**
 * O que do @ e do perfil fica só no servidor (revisão de 01/11/2026): a lista de @ reservados e os selos de cada app
 * citam apps que ainda não lançaram, e `./arroba` vai para o navegador (a tela de criar conta). Exportado por `@zro/auth`
 * (servidor); a tela usa `validarFormaArroba` e `sugerirArrobaCom` e o servidor confere o resto.
 */
import { sugerirArrobaCom, validarFormaArroba } from './arroba'

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

export function arrobaReservada(a: string): boolean {
  return (ARROBAS_RESERVADAS as readonly string[]).includes(a.replace(/[._]/g, ''))
}

/** null = válido (a forma e os reservados). A mensagem é a que a tela mostra. */
export function validarArroba(a: string): string | null {
  const forma = validarFormaArroba(a)
  if (forma) return forma
  if (arrobaReservada(a)) return 'Esse @ é reservado. Escolha outro.'
  return null
}

/** A mesma conta do banco (zro.sugerir_arroba), sem a parte de "já está ocupado", com os reservados. */
export const sugerirArroba = (nome: string, email = ''): string => sugerirArrobaCom(nome, email, arrobaReservada)

/** Selo de cada app no perfil (só aparece quando a pessoa liga E já usa o app). */
export const SELO_TEXTO: Record<string, string> = {
  'carro-do-freela': 'Freela no Carro do Freela',
  sobedesce: 'Usa SOBEDESCE',
  synquei: 'Usa Synquei',
  tpeasy: 'Usa TPeasy',
  'ai-edit': 'Usa AEON',
  nossom: 'Usa Quasar',
  finishing: 'Usa Revela',
  maestro: 'Usa Maestro',
}
export const textoDoSelo = (produto: string, nome?: string) => SELO_TEXTO[produto] ?? `Usa ${nome ?? produto}`
