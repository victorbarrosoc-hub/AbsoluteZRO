/**
 * Erro de domínio com código estável e status HTTP. A API devolve { error: code, message } e nunca a pilha.
 * Códigos de autorização seguem a ordem do PRD §5.2.
 */
export type ErrorCode =
  | 'unauthenticated'
  | 'email_not_verified'
  | 'no_active_organization'
  | 'organization_inactive'
  | 'forbidden_role'
  | 'project_not_found'
  | 'project_read_only'
  | 'product_closed'
  | 'product_unavailable'
  | 'entitlement_required'
  | 'feature_not_included'
  | 'quota_not_configured'
  | 'quota_exceeded'
  | 'external_resource_denied'
  | 'platform_role_required'
  | 'invalid_input'
  | 'conflict'
  | 'not_found'
  | 'rate_limited'
  | 'origin_rejected'
  | 'invalid_signature'
  | 'upstream_unavailable'
  | 'action_not_allowed'
  | 'sem_conexao'
  | 'app_desligado'

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  email_not_verified: 403,
  no_active_organization: 409,
  organization_inactive: 403,
  forbidden_role: 403,
  project_not_found: 404,
  project_read_only: 403,
  product_closed: 403,
  product_unavailable: 403,
  entitlement_required: 403,
  feature_not_included: 403,
  quota_not_configured: 403,
  quota_exceeded: 429,
  external_resource_denied: 403,
  platform_role_required: 403,
  invalid_input: 422,
  conflict: 409,
  not_found: 404,
  rate_limited: 429,
  origin_rejected: 403,
  invalid_signature: 400,
  upstream_unavailable: 503,
  action_not_allowed: 403,
  sem_conexao: 409,
  app_desligado: 403,
}

export class DomainError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.status = STATUS[code]
    this.details = details
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError
