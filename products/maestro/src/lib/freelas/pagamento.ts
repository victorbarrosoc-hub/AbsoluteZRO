/**
 * Dados de pagamento do freela (CPF/CNPJ e PIX): conferidos aqui, cifrados com MAESTRO_KEY (AES-256-GCM, a mesma
 * chave dos tokens, derivada por uso; o contexto amarra a cifra à organização, ao freela e ao campo: a cifra de um
 * não abre em outro) e gravados em maestro.freela_pagamento, que só administração e gestão leem (RLS em todo
 * comando, drizzle/0007). O papel equipe nunca recebe nem a cifra. Trocar a MAESTRO_KEY torna esses dados ilegíveis:
 * a tela mostra "dados ilegíveis, cadastre de novo".
 */
import { abrir, ChaveErrada, selar } from "@/lib/auth/cripto";

export type TipoPix = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
export const TIPOS_PIX: { k: TipoPix; nome: string }[] = [
  { k: "cpf", nome: "CPF" },
  { k: "cnpj", nome: "CNPJ" },
  { k: "email", nome: "E-mail" },
  { k: "telefone", nome: "Telefone" },
  { k: "aleatoria", nome: "Chave aleatória" },
];

const digitos = (s: string) => s.replace(/\D/g, "");

function cpfValido(c: string): boolean {
  if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function cnpjValido(c: string): boolean {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + Number(c[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

/** CPF ou CNPJ só com dígitos e conferido; vazio = null; inválido = undefined. */
export function lerDocumento(v: string | null | undefined): string | null | undefined {
  const d = digitos(v ?? "");
  if (!d) return null;
  return cpfValido(d) || cnpjValido(d) ? d : undefined;
}

/** Chave PIX conferida pelo tipo; vazio = null; inválida = undefined. */
export function lerPix(tipo: string | null | undefined, v: string | null | undefined): { tipo: TipoPix; chave: string } | null | undefined {
  const t = (v ?? "").trim();
  if (!t) return null;
  switch (tipo) {
    case "cpf":
      return cpfValido(digitos(t)) ? { tipo, chave: digitos(t) } : undefined;
    case "cnpj":
      return cnpjValido(digitos(t)) ? { tipo, chave: digitos(t) } : undefined;
    case "email":
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) && t.length <= 254 ? { tipo, chave: t.toLowerCase() } : undefined;
    case "telefone": {
      const d = digitos(t);
      return d.length >= 10 && d.length <= 13 ? { tipo, chave: d } : undefined;
    }
    case "aleatoria":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? { tipo, chave: t.toLowerCase() } : undefined;
    default:
      return undefined;
  }
}

const contexto = (orgId: string, freelaId: string, campo: "documento" | "pix") => `freela_pagamento:${orgId}:${freelaId}:${campo}`;

export const cifrarCampo = (orgId: string, freelaId: string, campo: "documento" | "pix", valor: string) => selar(valor, contexto(orgId, freelaId, campo));

/** Abre o campo; cifra que não abre (chave trocada, linha copiada de outro freela) vira null + `ilegivel`. */
export function abrirCampo(orgId: string, freelaId: string, campo: "documento" | "pix", cifra: string | null): { valor: string | null; ilegivel: boolean } {
  if (!cifra) return { valor: null, ilegivel: false };
  try {
    return { valor: abrir(cifra, contexto(orgId, freelaId, campo)), ilegivel: false };
  } catch (e) {
    if (e instanceof ChaveErrada) return { valor: null, ilegivel: true };
    throw e;
  }
}

/** "12345678909" → "123.456.789-09"; CNPJ idem. */
export function formatarDocumento(d: string): string {
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}

/** Só o fim, para listas: "•••.•••.789-09". */
export const mascarar = (d: string) => (d.length > 4 ? `•••${d.slice(-4)}` : "••••");
