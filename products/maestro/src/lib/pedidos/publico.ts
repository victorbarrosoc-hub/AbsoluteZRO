/**
 * O pedido público (`/p/<token>` e POST /api/publico/pedido, plano v2 §6.2 e §4.4). Quem pede não tem conta: tudo passa
 * pela porta estreita (`maestro.pedido_form` e `maestro.pedido_enviar`, drizzle/0012).
 *
 * Defesas, nesta ordem: teto por IP (o mesmo dos links), token no formato, armadilha (campo escondido: finge que deu
 * certo e não grava), tempo mínimo de preenchimento (selo assinado que a página entrega, de 3 s a 24 h), limites (5/h
 * por IP e 30 a cada 10 min por link), validação contra o formulário daquele link e o banco conferindo de novo. Link
 * desconhecido ou revogado = a mesma tela neutra. O IP nunca é guardado: só o HMAC do dia.
 * Sem "server-only": os testes chamam direto.
 */
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { assinar, assinaturaConfere, hashToken } from "@/lib/auth/cripto";
import { dentroDoLimite, registrarTentativa, REGRAS } from "@/lib/auth/limite";
import { ehToken } from "@/lib/revisao/link";
import { chamarPorta, ipDentroDoLimite, ipHashDoDia, marcarMorto, whatsappDaProdutora } from "@/lib/publico/porta";
import { lerConfig, validarEnvio, type FormPedido, type MarcaPublica, type ModeloPublico, type VariavelPublica } from "./formulario";

export const TEMPO_MINIMO_MS = 3_000;
const TEMPO_MAXIMO_MS = 24 * 3600_000;

/** O selo de tempo do formulário: quando a página abriu, assinado e preso ao link. */
export function seloDoFormulario(token: string, agora = Date.now()): string {
  const t = String(agora);
  return `${t}.${assinar(`${hashToken(token).slice(0, 16)}.${t}`, "pedido-tempo")}`;
}

/** "ok", "rapido" (gente leva mais que 3 s) ou "invalido" (sem selo, adulterado ou de ontem). */
export function conferirSelo(token: string, selo: unknown, agora = Date.now()): "ok" | "rapido" | "invalido" {
  const [t, sig] = String(selo ?? "").split(".");
  if (!t || !sig || !/^\d{10,16}$/.test(t)) return "invalido";
  if (!assinaturaConfere(`${hashToken(token).slice(0, 16)}.${t}`, sig, "pedido-tempo")) return "invalido";
  const passou = agora - Number(t);
  if (passou < 0 || passou > TEMPO_MAXIMO_MS) return "invalido";
  return passou < TEMPO_MINIMO_MS ? "rapido" : "ok";
}

type FormBruto = { marca: MarcaPublica; config: unknown; modelos: ModeloPublico[]; variaveis: VariavelPublica[] };
const deBruto = (b: FormBruto): FormPedido => ({ marca: b.marca, config: lerConfig(b.config), modelos: b.modelos ?? [], variaveis: b.variaveis ?? [] });

async function formDoHash(th: string): Promise<FormPedido | null> {
  const r = (await chamarPorta("pedido público", sql`select maestro.pedido_form(${th}) as r`)) as FormBruto | null;
  return r ? deBruto(r) : null;
}

export type AberturaPedido = { estado: "morto" } | { estado: "limite" } | { estado: "ok"; form: FormPedido; selo: string };

export async function abrirFormulario(token: string, ip: string): Promise<AberturaPedido> {
  const ipHash = ipHashDoDia(ip);
  if (!(await ipDentroDoLimite(ipHash))) return { estado: "limite" };
  if (!ehToken(token)) {
    await marcarMorto(ipHash);
    return { estado: "morto" };
  }
  const th = hashToken(token);
  if (!(await dentroDoLimite(`pedido-abrir:${th}`, REGRAS.orcamentoAbrir))) return { estado: "limite" };
  const form = await formDoHash(th);
  if (!form) {
    await marcarMorto(ipHash);
    return { estado: "morto" };
  }
  await registrarTentativa(`link-ip:${ipHash}`, `pedido-abrir:${th}`);
  return { estado: "ok", form, selo: seloDoFormulario(token) };
}

export type ResultadoPedido =
  | { ok: true; protocolo: string; whatsapp: string | null; produtora: string }
  | { ok: false; status: number; erro: string; mensagem: string; erros?: Record<string, string> };

const LIMITE = { ok: false as const, status: 429, erro: "limite", mensagem: "Muitos pedidos seguidos. Espere um pouco e tente de novo." };
const MORTO = { ok: false as const, status: 404, erro: "link", mensagem: "Este link não está mais ativo." };

/** Protocolo de mentira para a armadilha (o robô acha que deu certo). */
const protocoloFalso = () => randomBytes(4).toString("hex").toUpperCase();

export async function enviarPedido(token: string, corpo: Record<string, unknown>, ip: string): Promise<ResultadoPedido> {
  const ipHash = ipHashDoDia(ip);
  if (!(await ipDentroDoLimite(ipHash))) return LIMITE;
  if (!ehToken(token)) {
    await marcarMorto(ipHash);
    return MORTO;
  }
  // Armadilha: gente não vê o campo; quem preenche recebe "deu certo" e nada é gravado.
  if (typeof corpo.site === "string" && corpo.site.trim()) return { ok: true, protocolo: protocoloFalso(), whatsapp: null, produtora: "" };
  const selo = conferirSelo(token, corpo.selo);
  if (selo === "rapido") return { ok: false, status: 400, erro: "rapido", mensagem: "Confira as respostas e envie de novo." };
  if (selo === "invalido") return { ok: false, status: 400, erro: "selo", mensagem: "Recarregue a página e envie de novo." };

  const th = hashToken(token);
  const [porIp, porLink] = await Promise.all([dentroDoLimite(`pedido-ip:${ipHash}`, REGRAS.pedidoIp), dentroDoLimite(`pedido-link:${th}`, REGRAS.pedidoLink)]);
  if (!porIp || !porLink) return LIMITE;
  const form = await formDoHash(th);
  if (!form) {
    await marcarMorto(ipHash);
    return MORTO;
  }
  const v = validarEnvio(corpo, form);
  if (!v.ok) return { ok: false, status: 400, erro: "formato", mensagem: Object.values(v.erros)[0] ?? "Confira as respostas.", erros: v.erros };
  await registrarTentativa(`pedido-ip:${ipHash}`, `pedido-link:${th}`, `link-ip:${ipHash}`);

  const r = (await chamarPorta("pedido público", sql`select maestro.pedido_enviar(${th}, ${JSON.stringify({ ...v.envio, ip: ipHash })}::jsonb) as r`)) as
    { ok: true; protocolo: string; repetido: boolean } | { erro: string } | null;
  if (!r || "erro" in r) {
    if (r?.erro === "link") return MORTO;
    return { ok: false, status: 400, erro: r?.erro ?? "erro", mensagem: "Confira as respostas e envie de novo." };
  }
  return {
    ok: true,
    protocolo: r.protocolo,
    produtora: form.marca.nome,
    whatsapp: whatsappDaProdutora(form.marca.telefone, `Olá! Acabei de pedir um orçamento pelo link (protocolo ${r.protocolo}).`),
  };
}
