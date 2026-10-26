/**
 * "Converter com a Revela" pedido pelo celular (docs/CONTAS.md §11): os destinos que o app do computador sabe gerar.
 * São os do conversor da Revela (products/finishing/src/conversao/plano.js, DESTINOS_CONVERSAO); o teste do app do
 * computador (test/revela.test.js) confere que esta lista bate com aquela.
 */
export const DESTINOS_REVELA = ["youtube", "vimeo", "reels", "tiktok"] as const;
export type DestinoRevela = (typeof DESTINOS_REVELA)[number];
export const ehDestinoRevela = (v: unknown): v is DestinoRevela => typeof v === "string" && (DESTINOS_REVELA as readonly string[]).includes(v);
