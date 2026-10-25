/** Regras de conta, iguais no servidor e na interface. */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 200

export function normalizeEmail(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase()
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

export function validateEmail(email: string): string | null {
  return EMAIL.test(email) ? null : 'Informe um e-mail válido.'
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`
  if (password.length > PASSWORD_MAX) return `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`
  return null
}

export function validateDisplayName(name: string): string | null {
  const n = name.trim()
  if (!n) return 'Informe seu nome.'
  if (n.length > 120) return 'Nome muito longo.'
  return null
}
