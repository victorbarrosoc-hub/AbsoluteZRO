/**
 * O SOBEDESCE embutido na aba Arquivos (titular, 30/10/2026: "não precisa de botão, tem que abrir como a aba Drive do
 * Sobedesce funciona"). É o próprio app do SOBEDESCE num quadro (`/app/?no=maestro`), não uma cópia: Transferências e
 * Drive, o arquivo vai direto entre o aparelho e o Google, nada passa pelo Maestro. Contrato do lado de lá:
 * `products/sobedesce/web/public/app/lib/embutido.js`.
 *
 * - Endereço: `/app/?no=maestro&tema=escuro|claro`; `#drive/<id>` abre a pasta (só o `#` muda: o quadro não recarrega).
 * - Recados do quadro (postMessage, só para a origem do Maestro): `pronto`, `envios` (quantos andando) e `pasta` (a
 *   pasta aberta no Drive, para ligar a um projeto). Nunca token.
 * - Recado para o quadro: `{ tipo: 'tema', tema }`, com a origem do SOBEDESCE como destino.
 * - O cookie do SOBEDESCE é SameSite=Lax e o SOBEDESCE só se deixa embutir em `https://maestro.absolutezro.com`
 *   (`frame-ancestors`): fora desse endereço o quadro não abre e a aba mostra o aviso com o link.
 *
 * Puro (sem "server-only"): a tela e os testes usam. A CSP (`next.config.ts`) abre o `frame-src` só para esta origem.
 */

/** A origem do app do SOBEDESCE (o quadro). Fixa: a CSP do Maestro e o `frame-ancestors` do SOBEDESCE dependem dela. */
export const SOBEDESCE_ORIGEM = "https://sobedesce.absolutezro.com";
/** O app do SOBEDESCE (a mesma casca do celular), no modo embutido do Maestro. */
export const SOBEDESCE_APP = `${SOBEDESCE_ORIGEM}/app/`;

export type TemaMaestro = "light" | "dark";
export type PastaAberta = { id: string; nome: string };
export type Recado = { tipo: "pronto" } | { tipo: "envios"; andando: number } | { tipo: "pasta"; pasta: PastaAberta | null };

/** O mesmo formato de id do Drive que o vínculo projeto → pasta aceita (src/lib/sobedesce/arquivos.ts). */
const ID_DRIVE = /^[A-Za-z0-9_-]{1,200}$/;

/** O tema do Maestro na língua do SOBEDESCE (`?tema=` e o recado). */
export const temaDoQuadro = (tema: TemaMaestro): "escuro" | "claro" => (tema === "dark" ? "escuro" : "claro");

/** O endereço do quadro: o app embutido no tema do Maestro e, se houver, já dentro de uma pasta (`#drive/<id>`). */
export function enderecoDoQuadro(tema: TemaMaestro, pasta?: string | null): string {
  const base = `${SOBEDESCE_APP}?no=maestro&tema=${temaDoQuadro(tema)}`;
  return pasta && ID_DRIVE.test(pasta) ? `${base}#drive/${pasta}` : base;
}

/** O mesmo endereço com outra pasta: só o `#` muda (o quadro navega sem recarregar). */
export function comPasta(endereco: string, pasta: string): string | null {
  if (!ID_DRIVE.test(pasta)) return null;
  return `${endereco.split("#")[0]}#drive/${pasta}`;
}

/**
 * Lê um recado do quadro. Só vale com a origem exata do SOBEDESCE, `fonte: 'sobedesce'` e um dos três tipos com os
 * campos certos; qualquer outra coisa é null (quem chama ainda confere se veio da janela do quadro).
 */
export function lerRecado(origem: string, dados: unknown): Recado | null {
  if (origem !== SOBEDESCE_ORIGEM) return null;
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  if (d.fonte !== "sobedesce") return null;
  if (d.tipo === "pronto") return { tipo: "pronto" };
  if (d.tipo === "envios") {
    const n = d.andando;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    return { tipo: "envios", andando: Math.min(Math.floor(n), 9999) };
  }
  if (d.tipo === "pasta") {
    if (d.id === null || d.id === undefined) return { tipo: "pasta", pasta: null };
    if (typeof d.id !== "string" || !ID_DRIVE.test(d.id) || typeof d.nome !== "string") return null;
    const nome = d.nome.replace(/\s+/g, " ").trim().slice(0, 200);
    return nome ? { tipo: "pasta", pasta: { id: d.id, nome } } : null;
  }
  return null;
}
