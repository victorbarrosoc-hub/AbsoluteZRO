/**
 * O convite do freela para o Absolute ZRO (drizzle/0036), a parte sem banco: o endereço, o estado da ficha e a mensagem
 * do WhatsApp (a mesma do cadastro, com o link no fim). E-mail em espera (decisão do titular): o convite sai só por
 * "Copiar link" e "Mandar no WhatsApp". A tela no navegador importa daqui, nunca de `convite-servidor.ts`.
 */
import { textoWhatsapp } from "./funcoes";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const ehTokenConvite = (t: unknown): t is string => typeof t === "string" && TOKEN.test(t);
export const caminhoDoConvite = (token: string) => `/convite/${token}`;
export const enderecoDoConvite = (origem: string, token: string) => `${origem.replace(/\/+$/, "")}${caminhoDoConvite(token)}`;
export const ehCaminhoDeConvite = (caminho: string) => /^\/convite\/[A-Za-z0-9_-]{43}$/.test(caminho);

/** A conta do freela como a ficha mostra: "Conectado @fulano", "Convite enviado" ou "Sem conta". */
export type ContaDoFreela =
  { estado: "conectado"; arroba: string | null } | { estado: "convidado"; expira: string; url: string | null } | { estado: "sem_conta" };

export const NOME_DO_ESTADO: Record<ContaDoFreela["estado"], string> = {
  conectado: "Conectado",
  convidado: "Convite enviado",
  sem_conta: "Sem conta",
};

/** A mensagem do cadastro ("Oi, {nome}! …") + o convite com o link. */
export function textoDoConvite(modelo: string | null | undefined, nome: string, produtora: string, url: string): string {
  return `${textoWhatsapp(modelo, nome, produtora)}\n\nEntre no nosso banco de freelas com a sua conta Absolute ZRO: ${url}`;
}

/** wa.me com o texto pronto (sem API). Sem número, null. */
export function linkDoWhatsapp(numero: string | null | undefined, texto: string): string | null {
  const n = String(numero ?? "").replace(/\D/g, "");
  return n.length >= 8 ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}
