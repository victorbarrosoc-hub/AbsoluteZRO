/**
 * Schema `maestro` para o Drizzle (leitura tipada e escritas simples). A fonte da verdade é o SQL em drizzle/*.sql:
 * RLS, funções e gatilhos não cabem aqui. Colunas em camelCase aqui, snake_case no banco (casing do Drizzle).
 * Cards: a escrita é só por função (maestro.card_criar / card_mudar / card_apagar / card_restaurar).
 */
import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, date, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const maestro = pgSchema("maestro");

const quando = () => timestamp({ withTimezone: true, mode: "date" });
const agora = () => quando().notNull().defaultNow();

/** Papel no Maestro, derivado do papel na organização da Absolute ZRO (lib/papeis.ts). */
export type Papel = "admin" | "gestor" | "equipe" | "leitura";

/** Organização = a organização da Absolute ZRO (1:1 pelo claim zro_org.id). */
export const organizations = maestro.table("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  zroOrgId: uuid().notNull().unique(),
  name: text().notNull(),
  /** Última lista de zro_products vista num login (só para mostrar; o acesso é conferido pela sessão). */
  zroProducts: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** Empresa, WhatsApp, condições… (por organização). */
  settings: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: agora(),
  updatedAt: agora(),
});

export const members = maestro.table(
  "members",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** id da pessoa na Absolute ZRO (claim sub = zro.users.id). */
    zroSub: uuid().notNull(),
    displayName: text(),
    email: text(),
    pictureUrl: text(),
    /** Papel na organização da Absolute ZRO, copiado a cada login (owner, admin, manager, editor, viewer, guest). */
    hubRole: text(),
    role: text().$type<Papel>().notNull().default("leitura"),
    revisor: boolean().notNull().default(false),
    funcao: text(),
    status: text().notNull().default("active"),
    createdAt: agora(),
    lastLoginAt: quando(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.zroSub] })],
);

/** Sessões próprias do Maestro (cookie mae_sessao): só o sha256 do token; tokens da Absolute ZRO cifrados. */
export const sessions = maestro.table(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    zroSub: uuid().notNull(),
    tokenHash: text().notNull().unique(),
    /** zro_products do login (a lista que temAcesso() confere). */
    produtos: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Claim zro_release do login ou da última releitura (gate de lançamento; temAcesso() confere). */
    zroRelease: jsonb().$type<Record<string, string>>(),
    /** { at, atExp, rt } da Absolute ZRO, cifrados (lib/auth/cripto.ts), para o userinfo e o repasse da Z. */
    zroTokensEnc: text(),
    userAgent: text(),
    createdAt: agora(),
    lastUsedAt: agora(),
    expiresAt: quando().notNull(),
    revokedAt: quando(),
    /** Última releitura do perfil na Absolute ZRO (no máximo uma por minuto). */
    perfilLidoEm: quando(),
  },
  (t) => [index("sessions_org_sub_idx").on(t.orgId, t.zroSub)],
);

export const clients = maestro.table(
  "clients",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    segment: text(),
    city: text(),
    document: text(),
    contactName: text(),
    email: text(),
    phone: text(),
    instagram: text(),
    notes: text(),
    /** Quem aprova pelo cliente: { nome, email, whatsapp }. */
    approver: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    recurring: jsonb().$type<Record<string, unknown>>(),
    createdBy: uuid(),
    createdAt: agora(),
    updatedAt: agora(),
    deletedAt: quando(),
  },
  (t) => [index("clients_org_idx").on(t.orgId)],
);

export type LinkStatus = "unlinked" | "pending" | "linked" | "failed";

export const projects = maestro.table(
  "projects",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid().references(() => clients.id, { onDelete: "set null" }),
    /** MAE-AAAA-NNN, único por organização. */
    code: text().notNull(),
    title: text().notNull(),
    category: text(),
    stage: text(),
    status: text().notNull().default("active"),
    startDate: date({ mode: "string" }),
    dueDate: date({ mode: "string" }),
    valueCents: bigint({ mode: "number" }),
    briefing: text(),
    /** Pasta do projeto no Google Drive da organização (via SOBEDESCE, etapa 2). */
    driveFolderId: text(),
    /** Projeto canônico no HUB (zro.projects.id). Vínculo automático ao criar, idempotente. */
    zroProjectId: uuid().unique(),
    linkStatus: text().$type<LinkStatus>().notNull().default("pending"),
    linkAttempts: integer().notNull().default(0),
    linkLastError: text(),
    linkUpdatedAt: quando(),
    createdBy: uuid(),
    createdAt: agora(),
    updatedAt: agora(),
    deletedAt: quando(),
  },
  (t) => [uniqueIndex("projects_org_code_idx").on(t.orgId, t.code), index("projects_org_client_idx").on(t.orgId, t.clientId)],
);

/** O card do Quadro: um documento jsonb por card, versão por campo (`versoes`), colunas geradas só para índice. */
export const cards = maestro.table(
  "cards",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    id: text().notNull(),
    dados: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    versao: integer().notNull().default(1),
    versoes: jsonb().$type<Record<string, number>>().notNull().default({}),
    coluna: text().generatedAlwaysAs(sql`(dados ->> 'coluna')`),
    cliente: text().generatedAlwaysAs(sql`(dados ->> 'cliente')`),
    projeto: text().generatedAlwaysAs(sql`(dados ->> 'projeto')`),
    resp: text().generatedAlwaysAs(sql`(dados ->> 'resp')`),
    prazo: text().generatedAlwaysAs(sql`(dados ->> 'prazo')`),
    data: text().generatedAlwaysAs(sql`(dados ->> 'data')`),
    apagadoEm: text().generatedAlwaysAs(sql`(dados ->> 'apagadoEm')`),
    createdAt: agora(),
    updatedAt: agora(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("cards_org_coluna_idx").on(t.orgId, t.coluna), index("cards_org_prazo_idx").on(t.orgId, t.prazo)],
);

export const cardHistory = maestro.table(
  "card_history",
  {
    n: bigserial({ mode: "number" }).primaryKey(),
    orgId: uuid().notNull(),
    cardId: text().notNull(),
    quando: agora(),
    quem: uuid(),
    operacao: text().notNull(),
    /** { campo: [antes, depois] } */
    campos: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("card_history_card_idx").on(t.orgId, t.cardId, t.n)],
);

/** Peças e referências do card: ficam no Google Drive da organização (via SOBEDESCE); aqui só o id e a prévia. */
export const cardMedia = maestro.table(
  "card_media",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid().notNull(),
    cardId: text().notNull(),
    tipo: text().$type<"peca" | "ref">().notNull().default("peca"),
    nome: text().notNull(),
    mime: text(),
    bytes: bigint({ mode: "number" }),
    driveFileId: text().notNull(),
    driveFolderId: text(),
    /** Referência da miniatura (pedida ao SOBEDESCE na hora, nunca a URL do Google guardada). */
    thumbRef: text(),
    width: integer(),
    height: integer(),
    durationS: integer(),
    posicao: integer().notNull().default(0),
    criadoPor: uuid(),
    criadoEm: agora(),
    apagadoEm: quando(),
  },
  (t) => [index("card_media_card_idx").on(t.orgId, t.cardId, t.posicao)],
);

export const lotes = maestro.table(
  "lotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id),
    projectId: uuid().references(() => projects.id, { onDelete: "set null" }),
    title: text().notNull(),
    objective: text(),
    period: text(),
    status: text().$type<"rascunho" | "enviado" | "fechado">().notNull().default("rascunho"),
    sentAt: quando(),
    closedAt: quando(),
    term: jsonb().$type<Record<string, unknown>>(),
    createdBy: uuid(),
    createdAt: agora(),
    updatedAt: agora(),
    deletedAt: quando(),
  },
  (t) => [index("lotes_org_client_idx").on(t.orgId, t.clientId)],
);

export const loteCards = maestro.table(
  "lote_cards",
  {
    loteId: uuid()
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    orgId: uuid().notNull(),
    cardId: text().notNull(),
    posicao: integer().notNull().default(0),
    volta: integer().notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.loteId, t.cardId] })],
);

/** Link do cliente: token só como hash, validade (30 dias por padrão), PIN opcional, revogação; um ativo por lote. */
export const approvalLinks = maestro.table(
  "approval_links",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id),
    kind: text().$type<"lote" | "area" | "ver">().notNull(),
    loteId: uuid().references(() => lotes.id, { onDelete: "cascade" }),
    cardId: text(),
    tokenHash: text().notNull().unique(),
    tokenEnc: text(),
    label: text(),
    approverName: text(),
    /** 30 dias depois de criado, por padrão (decisão do proprietário). */
    expiresAt: quando()
      .notNull()
      .default(sql`now() + interval '30 days'`),
    revokedAt: quando(),
    revokedBy: uuid(),
    pinHash: text(),
    pinVersion: integer().notNull().default(0),
    createdBy: uuid(),
    createdAt: agora(),
    lastUsedAt: quando(),
    uses: integer().notNull().default(0),
  },
  (t) => [index("approval_links_org_idx").on(t.orgId, t.clientId)],
);

/** Decisão do cliente: imutável, com a versão exata do card e chave de idempotência. */
export const approvals = maestro.table(
  "approvals",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid().notNull(),
    cardId: text().notNull(),
    cardVersion: integer().notNull(),
    loteId: uuid(),
    linkId: uuid(),
    decision: text().$type<"aprovado" | "ajuste">().notNull(),
    note: text(),
    pins: jsonb().$type<unknown[]>().notNull().default([]),
    beforeMedia: jsonb().$type<unknown[]>().notNull().default([]),
    approverName: text(),
    ipHash: text(),
    userAgent: text(),
    consentAt: quando(),
    idempotencyKey: text().notNull().unique(),
    createdAt: agora(),
  },
  (t) => [index("approvals_card_idx").on(t.orgId, t.cardId)],
);

export const clientRequests = maestro.table(
  "client_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid().notNull(),
    clientId: uuid().notNull(),
    linkId: uuid(),
    title: text().notNull(),
    format: text(),
    wantedFor: text(),
    description: text(),
    status: text().$type<"novo" | "aceito" | "recusado" | "feito">().notNull().default("novo"),
    cardId: text(),
    createdAt: agora(),
    updatedAt: agora(),
  },
  (t) => [index("client_requests_org_idx").on(t.orgId, t.status)],
);

/** Espelho das etapas do projeto vinculado no HUB (zro.project_steps): só indicador, nunca move coluna. */
export const integrationState = maestro.table(
  "integration_state",
  {
    orgId: uuid().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    productId: text().notNull(),
    state: text().notNull(),
    detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    syncedAt: quando(),
    hubUpdatedAt: quando(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.projectId, t.productId] })],
);

export const auditLog = maestro.table(
  "audit_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    orgId: uuid().notNull(),
    actorSub: uuid(),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: agora(),
  },
  (t) => [index("audit_log_org_idx").on(t.orgId, t.createdAt)],
);

/** Limite de tentativas (só o sistema lê e escreve). */
export const rateLimitAttempts = maestro.table("rate_limit_attempts", {
  key: text().notNull(),
  at: agora(),
});
