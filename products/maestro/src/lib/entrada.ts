/**
 * Tela de entrada do Maestro (decisão do titular, 29/10/2026, PRD Maestro v1.1 e Plano de Integração §7–8: a Z é
 * presença discreta, nunca a primeira tela): quem entra sem pedir página (`/app`, a volta do login) abre sempre no
 * Hoje. A Z continua em `/app/z`, num ícone discreto (cápsula, topo do celular e "Mais"), e nunca abre sozinha. Link
 * direto (`/app/quadro?card=…`, `/app/projetos/…`) é respeitado sempre.
 */
export const ENTRADA = "/app/hoje";
