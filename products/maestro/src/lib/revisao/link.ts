/**
 * O link do cliente (`/a/<token>`, plano v2 §4.4). Quem abre não tem conta: tudo passa pela "porta estreita" do banco
 * (drizzle/0005: `maestro.link_*`, security definer). A transação assume `maestro_app` sem organização na sessão,
 * então o RLS esconde todas as tabelas e só as funções `link_*` respondem, e só sobre o lote do token.
 *
 * - Token: 32 bytes aleatórios em base64url; o banco guarda só o sha256 (e a cópia cifrada para a equipe copiar).
 * - PIN opcional: scrypt no servidor; acertou, o navegador ganha um cookie assinado (link + versão do PIN) por 12 h.
 * - Limites (maestro.rate_limit_attempts): abrir 120/h por link e 300/h por IP; link morto 30/h por IP; PIN 5 a cada
 *   15 min por link e IP; comentar 60/h e enviar 20/h por link. O IP nunca é guardado: só o HMAC com o dia.
 * - Link desconhecido, revogado, vencido ou de lote fechado: a mesma resposta ("morto"), sem dizer de quem é.
 * Sem "server-only": os testes chamam direto.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getBanco, type Tx } from "@/lib/db/client";
import { PAPEL_APP } from "@/lib/db/config";
import { assinar, assinaturaConfere, hashComChave, hashToken } from "@/lib/auth/cripto";
import { dentroDoLimite, registrarTentativa, REGRAS } from "@/lib/auth/limite";
import { streamDoDrive } from "./fontes/player";
import { roteiroDoCliente } from "./roteiro";
import type { ComentarioVisto, DecisaoVista, VersaoVista } from "./tipos";

export const TOKEN_LINK = /^[A-Za-z0-9_-]{43}$/;
export const PIN = /^\d{4,8}$/;
const PROVA_HORAS = 12;

export const ehToken = (t: unknown): t is string => typeof t === "string" && TOKEN_LINK.test(t);

// ───────────── PIN ─────────────

/** scrypt (N=2^14, r=8, p=1) com sal próprio: "s1$<sal>$<hash>". */
export function hashPin(pin: string): string {
  if (!PIN.test(pin)) throw new Error("PIN inválido");
  const sal = randomBytes(16);
  const h = scryptSync(pin, sal, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${sal.toString("base64url")}$${h.toString("base64url")}`;
}

export function pinConfere(pin: string, guardado: string | null | undefined): boolean {
  const [v, sal, h] = String(guardado ?? "").split("$");
  if (v !== "s1" || !sal || !h || !PIN.test(pin)) return false;
  const esperado = Buffer.from(h, "base64url");
  const veio = scryptSync(pin, Buffer.from(sal, "base64url"), esperado.length, { N: 16384, r: 8, p: 1 });
  return veio.length === esperado.length && timingSafeEqual(veio, esperado);
}

/** Cookie do PIN: um por link (pelo começo do hash do token), sem nada que identifique o lote. */
export function nomeCookiePin(token: string): string {
  return `mae_pin_${hashToken(token).slice(0, 16)}`;
}

function prova(linkId: string, versao: number, ate: number): string {
  const corpo = `${linkId}.${versao}.${ate}`;
  return `${corpo}.${assinar(corpo, "link-pin")}`;
}

function provaConfere(valor: string | undefined, linkId: string, versao: number): boolean {
  const partes = String(valor ?? "").split(".");
  if (partes.length !== 4) return false;
  const [id, v, ate, sig] = partes;
  if (id !== linkId || Number(v) !== versao || !(Number(ate) > Date.now())) return false;
  return assinaturaConfere(`${id}.${v}.${ate}`, sig, "link-pin");
}

/** HMAC do IP com o dia: dá para contar abuso, não dá para saber o IP. */
export function ipHashDoDia(ip: string, agora = new Date()): string {
  return hashComChave(`${ip || "desconhecido"}|${agora.toISOString().slice(0, 10)}`, "link:ip");
}

// ───────────── porta estreita ─────────────

/** Transação como `maestro_app` sem organização: só as funções link_* respondem. */
export function comoLink<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getBanco().asSystem("link do cliente (porta estreita)", async (tx) => {
    await tx.execute(sql.raw(`set local role ${PAPEL_APP}`));
    return fn(tx);
  });
}

async function chamar(tx: Tx, consulta: ReturnType<typeof sql>): Promise<unknown> {
  const linhas = (await tx.execute(consulta)) as unknown as { r: unknown }[];
  return linhas[0]?.r ?? null;
}

type PinDoLink = { link: string; pin: string | null; pin_versao: number };

async function pinDoLink(th: string): Promise<PinDoLink | null> {
  return comoLink(async (tx) => (await chamar(tx, sql`select maestro.link_pin(${th}) as r`)) as PinDoLink | null);
}

// ───────────── abrir ─────────────

export type PecaVista = {
  card: string;
  titulo: string;
  volta: number;
  /** A mais nova primeiro; no máximo duas (Agora e Antes). */
  versoes: VersaoVista[];
  decisao: DecisaoVista | null;
};

export type LoteDoCliente = {
  produtora: string;
  cliente: string;
  lote: { titulo: string; objetivo: string | null; periodo: string | null; enviadoEm: string | null };
  expira: string;
  termo: { nome: string; em: string; hash: string } | null;
  pecas: PecaVista[];
};

export type Abertura = { estado: "morto" } | { estado: "limite" } | { estado: "pin" } | { estado: "ok"; dados: LoteDoCliente };

type VersaoBruta = Omit<VersaoVista, "stream" | "comentarios" | "url" | "roteiro"> & {
  url: string | null;
  comentarios: ComentarioVisto[];
  /** Versão de roteiro: o texto congelado como o banco guarda (vira a vista do cliente aqui, nunca vai cru à tela). */
  roteiro?: unknown;
};

/**
 * O que o banco devolve vira o que a tela recebe. Na versão de roteiro, o `conteudo` cru (com nota interna, plano,
 * observação e dicas) troca pela vista do cliente (`roteiroDoCliente`) aqui, no servidor.
 */
function paraTela(bruto: Omit<LoteDoCliente, "pecas"> & { pecas: (Omit<PecaVista, "versoes"> & { versoes: VersaoBruta[] })[] }): LoteDoCliente {
  return {
    ...bruto,
    pecas: bruto.pecas.map((p) => ({
      ...p,
      versoes: p.versoes.map(({ roteiro, ...v }) => ({
        ...v,
        url: v.url ?? "",
        fps: v.fps === null ? null : Number(v.fps),
        stream: v.fonte === "roteiro" ? null : streamDoDrive(v.fonte, v.driveId, v.driveChave),
        comentarios: v.comentarios.map((c) => ({ ...c, bloco: c.bloco ?? null, x: c.x === null ? null : Number(c.x), y: c.y === null ? null : Number(c.y) })),
        ...(v.fonte === "roteiro" ? { roteiro: roteiroDoCliente(roteiro) } : {}),
      })),
    })),
  };
}

async function limitesDeIp(ipHash: string): Promise<boolean> {
  const [ip, mortos] = await Promise.all([dentroDoLimite(`link-ip:${ipHash}`, REGRAS.linkIp), dentroDoLimite(`link-morto:${ipHash}`, REGRAS.linkMortoIp)]);
  return ip && mortos;
}

/** Abre o lote do link. `cookies` = os cookies do pedido (para a prova do PIN). */
export async function abrirLink(token: string, cookies: { get(nome: string): string | undefined }, ip: string): Promise<Abertura> {
  const ipHash = ipHashDoDia(ip);
  if (!(await limitesDeIp(ipHash))) return { estado: "limite" };
  if (!ehToken(token)) {
    await registrarTentativa(`link-ip:${ipHash}`, `link-morto:${ipHash}`);
    return { estado: "morto" };
  }
  const th = hashToken(token);
  if (!(await dentroDoLimite(`link-abrir:${th}`, REGRAS.linkAbrir))) return { estado: "limite" };
  const pin = await pinDoLink(th);
  if (!pin) {
    await registrarTentativa(`link-ip:${ipHash}`, `link-morto:${ipHash}`);
    return { estado: "morto" };
  }
  await registrarTentativa(`link-ip:${ipHash}`, `link-abrir:${th}`);
  const pinOk = !pin.pin || provaConfere(cookies.get(nomeCookiePin(token)), pin.link, pin.pin_versao);
  const r = (await comoLink((tx) => chamar(tx, sql`select maestro.link_abrir(${th}, ${pinOk}) as r`))) as
    ({ estado: "ok" } & Parameters<typeof paraTela>[0]) | { estado: "pin" } | null;
  if (!r) return { estado: "morto" };
  if (r.estado === "pin") return { estado: "pin" };
  const { estado: _e, ...dados } = r;
  void _e;
  return { estado: "ok", dados: paraTela(dados) };
}

// ───────────── PIN ─────────────

export type ResultadoPin =
  { ok: true; cookie: { nome: string; valor: string; maxAge: number } } | { ok: false; erro: "morto" | "limite" | "pin"; mensagem: string };

export async function conferirPin(token: string, pinDigitado: string, ip: string): Promise<ResultadoPin> {
  const ipHash = ipHashDoDia(ip);
  if (!(await limitesDeIp(ipHash))) return { ok: false, erro: "limite", mensagem: "Muitas tentativas. Espere alguns minutos." };
  if (!ehToken(token)) return { ok: false, erro: "morto", mensagem: "Este link não está mais ativo." };
  const th = hashToken(token);
  const pin = await pinDoLink(th);
  if (!pin) {
    await registrarTentativa(`link-ip:${ipHash}`, `link-morto:${ipHash}`);
    return { ok: false, erro: "morto", mensagem: "Este link não está mais ativo." };
  }
  const chaveIp = `link-pin:${th}:${ipHash}`;
  const chaveLink = `link-pin:${th}`;
  const [porIp, porLink] = await Promise.all([dentroDoLimite(chaveIp, REGRAS.linkPinIp), dentroDoLimite(chaveLink, REGRAS.linkPin)]);
  if (!porIp || !porLink) return { ok: false, erro: "limite", mensagem: "Muitas tentativas. Espere 15 minutos." };
  const maxAge = PROVA_HORAS * 3600;
  const valor = prova(pin.link, pin.pin_versao, Date.now() + maxAge * 1000);
  if (!pin.pin) return { ok: true, cookie: { nome: nomeCookiePin(token), valor, maxAge } };
  if (!pinConfere(String(pinDigitado ?? "").trim(), pin.pin)) {
    await registrarTentativa(chaveIp, chaveLink, `link-ip:${ipHash}`);
    return { ok: false, erro: "pin", mensagem: "PIN errado." };
  }
  return { ok: true, cookie: { nome: nomeCookiePin(token), valor, maxAge } };
}

// ───────────── comentar e enviar ─────────────

export type ErroLink = { ok: false; status: number; erro: string; mensagem: string };

const MENSAGENS: Record<string, [number, string]> = {
  link: [404, "Este link não está mais ativo."],
  pin: [401, "Digite o PIN de novo."],
  peca: [400, "Essa peça não está neste link."],
  versao: [400, "Essa versão não está mais aqui."],
  versao_nova: [409, "Chegou uma versão nova desta peça. Veja antes de decidir."],
  texto: [400, "Escreva o comentário (até 2.000 caracteres)."],
  pai: [400, "Esse comentário não está mais aqui."],
  idem: [400, "Pedido inválido."],
  nome: [400, "Escreva seu nome."],
  aceite: [400, "Marque o aceite para enviar."],
  decisoes: [400, "Escolha ao menos uma peça."],
  decisao: [400, "Decisão inválida."],
  nota: [400, "A observação passou de 2.000 caracteres."],
  ajuste_sem_nota: [400, "Diga o que ajustar: comente na peça ou escreva uma observação."],
  bloco: [400, "Esse trecho não está mais no roteiro."],
};

function erroDoBanco(r: { erro: string; card?: string }): ErroLink & { card?: string } {
  const [status, mensagem] = MENSAGENS[r.erro] ?? [400, "Não deu certo."];
  return { ok: false, status, erro: r.erro, mensagem, ...(r.card ? { card: r.card } : {}) };
}

/** O que é preciso antes de mexer: token, limites e a prova do PIN. */
async function preparar(
  token: string,
  cookies: { get(nome: string): string | undefined },
  ip: string,
  regra: keyof typeof REGRAS,
  prefixo: string,
): Promise<{ th: string; pinOk: boolean } | ErroLink> {
  const ipHash = ipHashDoDia(ip);
  if (!(await limitesDeIp(ipHash))) return { ok: false, status: 429, erro: "limite", mensagem: "Muitas tentativas. Espere alguns minutos." };
  if (!ehToken(token)) return { ok: false, status: 404, erro: "link", mensagem: MENSAGENS.link[1] };
  const th = hashToken(token);
  if (!(await dentroDoLimite(`${prefixo}:${th}`, REGRAS[regra])))
    return { ok: false, status: 429, erro: "limite", mensagem: "Muitas tentativas. Espere alguns minutos." };
  const pin = await pinDoLink(th);
  if (!pin) {
    await registrarTentativa(`link-ip:${ipHash}`, `link-morto:${ipHash}`);
    return { ok: false, status: 404, erro: "link", mensagem: MENSAGENS.link[1] };
  }
  await registrarTentativa(`${prefixo}:${th}`, `link-ip:${ipHash}`);
  return { th, pinOk: !pin.pin || provaConfere(cookies.get(nomeCookiePin(token)), pin.link, pin.pin_versao) };
}

export type DadosComentario = {
  card: string;
  versao: string;
  texto: string;
  t?: number | null;
  tFim?: number | null;
  digitado?: boolean;
  x?: number | null;
  y?: number | null;
  nome?: string | null;
  pai?: string | null;
  /** O bloco do roteiro (só em versão de roteiro). */
  bloco?: string | null;
  idem: string;
};

const numeroOuNull = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);

/** Confere e normaliza o corpo do comentário (o banco confere de novo). */
export function lerComentario(c: Record<string, unknown>): DadosComentario | null {
  const s = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
  const card = s(c.card, 64);
  const versao = s(c.versao, 36);
  const texto = s(c.texto, 4000);
  const idem = s(c.idem, 64);
  if (!card || !versao || !texto || !idem) return null;
  // Bloco de roteiro: a forma do id do modelo (src/lib/criacao/roteiro/modelo.ts); outra forma é pedido inválido.
  const bloco = c.bloco === undefined || c.bloco === null ? null : typeof c.bloco === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(c.bloco) ? c.bloco : undefined;
  if (bloco === undefined) return null;
  const t = numeroOuNull(c.t, 0, 86_400_000);
  const tFim = numeroOuNull(c.tFim, 0, 86_400_000);
  const x = numeroOuNull(c.x, 0, 100);
  const y = numeroOuNull(c.y, 0, 100);
  return {
    card,
    versao,
    texto,
    idem,
    t: t === null ? null : Math.round(t),
    tFim: t !== null && tFim !== null && tFim > t ? Math.round(tFim) : null,
    digitado: c.digitado === true,
    x: x !== null && y !== null ? Math.round(x * 100) / 100 : null,
    y: x !== null && y !== null ? Math.round(y * 100) / 100 : null,
    nome: s(c.nome, 200),
    pai: s(c.pai, 36),
    bloco,
  };
}

export async function comentarComoCliente(
  token: string,
  cookies: { get(nome: string): string | undefined },
  ip: string,
  dados: DadosComentario,
): Promise<{ ok: true; comentario: ComentarioVisto } | ErroLink> {
  const p = await preparar(token, cookies, ip, "linkComentar", "link-comentar");
  if ("ok" in p) return p;
  const r = (await comoLink((tx) => chamar(tx, sql`select maestro.link_comentar(${p.th}, ${p.pinOk}, ${JSON.stringify(dados)}::jsonb) as r`))) as
    { ok: true; comentario: ComentarioVisto } | { erro: string };
  if ("erro" in r) return erroDoBanco(r);
  const c = r.comentario;
  return { ok: true, comentario: { ...c, bloco: c.bloco ?? null, x: c.x === null ? null : Number(c.x), y: c.y === null ? null : Number(c.y) } };
}

export type Envio = {
  nome: string;
  aceite: boolean;
  decisoes: { card: string; versao: string | null; decisao: "aprovado" | "ajuste"; nota?: string | null }[];
};

export function lerEnvio(c: Record<string, unknown>): Envio | null {
  if (typeof c.nome !== "string" || c.nome.length > 200 || !Array.isArray(c.decisoes) || c.decisoes.length > 100) return null;
  const decisoes: Envio["decisoes"] = [];
  for (const d of c.decisoes as unknown[]) {
    if (!d || typeof d !== "object") return null;
    const o = d as Record<string, unknown>;
    if (typeof o.card !== "string" || o.card.length > 64) return null;
    if (o.decisao !== "aprovado" && o.decisao !== "ajuste") return null;
    if (o.versao !== null && o.versao !== undefined && (typeof o.versao !== "string" || o.versao.length > 36)) return null;
    if (o.nota !== null && o.nota !== undefined && (typeof o.nota !== "string" || o.nota.length > 4000)) return null;
    decisoes.push({ card: o.card, decisao: o.decisao, versao: (o.versao as string | undefined) ?? null, nota: (o.nota as string | undefined) ?? null });
  }
  return { nome: c.nome, aceite: c.aceite === true, decisoes };
}

export type ResultadoEnvio = {
  ok: true;
  decisoes: { card: string; decisao: "aprovado" | "ajuste"; repetida: boolean }[];
  termo: { nome: string; hash: string | null };
};

export async function enviarDecisoes(
  token: string,
  cookies: { get(nome: string): string | undefined },
  ip: string,
  userAgent: string | null,
  envio: Envio,
): Promise<ResultadoEnvio | (ErroLink & { card?: string })> {
  const p = await preparar(token, cookies, ip, "linkEnviar", "link-enviar");
  if ("ok" in p) return p;
  const corpo = { ...envio, ip: ipHashDoDia(ip), ua: (userAgent ?? "").slice(0, 300) };
  const r = (await comoLink((tx) => chamar(tx, sql`select maestro.link_enviar(${p.th}, ${p.pinOk}, ${JSON.stringify(corpo)}::jsonb) as r`))) as
    ResultadoEnvio | { erro: string; card?: string };
  if ("erro" in r) return erroDoBanco(r);
  return r;
}

// ───────────── marca ─────────────

/** A marca da produtora do link (logo, cor e nome), pela porta estreita (`maestro.link_marca`, drizzle/0011). */
export async function marcaDoLink(token: string): Promise<{ nome: string; logo: string | null; cor: string | null; propria?: boolean } | null> {
  if (!ehToken(token)) return null;
  return comoLink(
    async (tx) =>
      (await chamar(tx, sql`select maestro.link_marca(${hashToken(token)}) as r`)) as {
        nome: string;
        logo: string | null;
        cor: string | null;
        propria?: boolean;
      } | null,
  );
}
