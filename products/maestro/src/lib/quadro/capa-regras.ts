/**
 * Os números da capa do card que a tela também conhece (sem sharp: roda no navegador). A cota bate com
 * `maestro.card_capas_cota()` em drizzle/0035_capas_do_quadro.sql (o teste confere): mudou lá, mude aqui.
 */
export const CAPA_ENTRADA_MAX = 12 * 1024 * 1024;
/** Bytes de capa por produtora (uma capa por card, até 160 KB cada). */
export const COTA_CAPAS = 100 * 1024 * 1024;
/** O que o seletor de arquivo aceita: imagem vai como está; vídeo vira um quadro no navegador. */
export const ACEITA_CAPA = "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm";
