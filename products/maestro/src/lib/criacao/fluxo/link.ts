/**
 * O link de exportação do Fluxo (`/f/<token>`, plano da Criação §6.2, fase F6; drizzle/0032_fluxo_links.sql).
 *
 * Equipe (como a pessoa, `asUser` e RLS): criar, listar e revogar. Só administração e gestão (`podeEnviarCriacao` na
 * rota; o banco confere de novo pela política e pelo gatilho). O token tem 32 bytes aleatórios; o banco guarda o
 * sha256 (busca, que já tira a comparação do token em claro) e a cópia cifrada com a chave do Maestro para copiar de
 * novo; nunca o token em claro.
 *
 * Quem abre de fora (sem conta): só pela porta estreita (`maestro.fluxo_link_*`, transação como `maestro_app` sem
 * organização, `comoLink`). PIN opcional: scrypt no servidor (`pinConfere`, comparação em tempo constante); acertou, o
 * navegador ganha um cookie assinado preso ao hash do token (até 12 h, nunca além da validade). Limites por link e por
 * IP (`REGRAS.fluxo*`), o IP só como HMAC do dia. Desconhecido, revogado, vencido ou fluxo na lixeira: "morto", sem
 * dizer de quem é. Referência a roteiro ou card: só o título, e só do que quem criou alcançava (`refs_*` da 0032).
 * Sem "server-only": os testes chamam direto.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { abrir, assinar, assinaturaConfere, hashToken, novoToken, selar } from "@/lib/auth/cripto";
import { dentroDoLimite, registrarTentativa, REGRAS } from "@/lib/auth/limite";
import { codigoPg, getBanco, mensagemPg, PG, type Contexto, type Tx } from "@/lib/db/client";
import { ehUuid, falha, traduzirPg, type Falha, type Res } from "@/lib/crm/comum";
import { comoLink, hashPin, ipHashDoDia, pinConfere } from "@/lib/revisao/link";
import { siteUrl } from "@/lib/site";
import { caminhoImagemPeloLink, diasDoLink, ehTokenFluxo, enderecoDoLink, LINKS_POR_FLUXO, pinDoLink, type LinkDoFluxo } from "./compartilhar";
import { lerDados, type DadosNo, type ImagemNo, type LigacaoFluxo, type NoFluxo, type RefResolvida, type TipoNo } from "./modelo";

const contextoToken = (id: string) => `fluxo_links.token:${id}`;
const PROVA_HORAS = 12;
type Cookies = { get(nome: string): string | undefined };

// ───────────── equipe ─────────────

type LinhaLink = { id: string; token_enc: string; expira: string; temPin: boolean; visitas: number; vistoEm: string | null; criadoEm: string };
const ISO = (c: string) => sql.raw(`to_char(${c} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
const COLUNAS = sql`id, token_enc, ${ISO("expira_em")} as expira, tem_pin as "temPin", visitas, ${ISO("visto_em")} as "vistoEm", ${ISO("criado_em")} as "criadoEm"`;

function paraLink(l: LinhaLink, origem: string): LinkDoFluxo {
  let token: string | null = null;
  try {
    token = abrir(l.token_enc, contextoToken(l.id));
  } catch {
    token = null;
  }
  return {
    id: l.id,
    token,
    url: token ? enderecoDoLink(origem, token) : null,
    expira: l.expira,
    temPin: l.temPin,
    visitas: Number(l.visitas),
    vistoEm: l.vistoEm,
    criadoEm: l.criadoEm,
  };
}

function traduzir(e: unknown): Falha {
  const m = mensagemPg(e);
  if (m === "fluxo:nao_existe") return falha("nao_existe", "Esse fluxo não existe mais.");
  if (m === "fluxo_link:limite") return falha("limite", `Este fluxo já tem ${LINKS_POR_FLUXO} links ativos. Revogue um antes.`);
  if (m === "fluxo_link:validade") return falha("formato", "A validade vai de 1 a 30 dias.");
  if (m === "fluxo_link:revogado") return falha("revogado", "Esse link já foi revogado.");
  if (codigoPg(e) === PG.semPrivilegio) return falha("sem_permissao", "Só administração e gestão criam e revogam links.");
  return traduzirPg(e);
}

/** Cria um link (validade em dias, 1 a 30, padrão 7; PIN opcional de 4 a 8 dígitos). Devolve o link com o token. */
export async function criarLinkFluxo(ctx: Contexto, fluxoId: string, o: { dias?: unknown; pin?: unknown } = {}): Promise<Res<{ link: LinkDoFluxo }>> {
  if (!ehUuid(fluxoId)) return falha("nao_existe", "Esse fluxo não existe mais.");
  const dias = diasDoLink(o.dias);
  if (dias === null) return falha("formato", "A validade vai de 1 a 30 dias.");
  const pin = pinDoLink(o.pin);
  if (pin === undefined) return falha("pin", "O PIN tem de 4 a 8 números.");
  const id = randomUUID();
  const token = novoToken();
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [l] = (await tx.execute(sql`
        insert into maestro.fluxo_links (id, org_id, fluxo_id, token_hash, token_enc, pin_hash, expira_em)
        values (${id}, ${ctx.orgId}, ${fluxoId}, ${hashToken(token)}, ${selar(token, contextoToken(id))}, ${pin ? hashPin(pin) : null},
                now() + make_interval(days => ${dias}))
        returning ${COLUNAS}`)) as unknown as LinhaLink[];
      return { ok: true as const, link: paraLink(l, siteUrl()) };
    });
  } catch (e) {
    return traduzir(e);
  }
}

/** Os links vivos do fluxo (não revogados e dentro da validade), do mais novo para o mais antigo. */
export async function listarLinksFluxo(ctx: Contexto, fluxoId: string): Promise<LinkDoFluxo[]> {
  if (!ehUuid(fluxoId)) return [];
  return getBanco().asUser(ctx, async (tx) => {
    const r = (await tx.execute(sql`
      select ${COLUNAS} from maestro.fluxo_links
       where fluxo_id = ${fluxoId} and revogado_em is null and expira_em > now()
       order by criado_em desc, id limit ${LINKS_POR_FLUXO * 2}`)) as unknown as LinhaLink[];
    return r.map((l) => paraLink(l, siteUrl()));
  });
}

/** Revoga para sempre (quem abrir depois vê a tela neutra; as imagens param na hora). */
export async function revogarLinkFluxo(ctx: Contexto, linkId: string): Promise<Res> {
  if (!ehUuid(linkId)) return falha("nao_existe", "Esse link não existe mais.");
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const r = await tx.execute(sql`update maestro.fluxo_links set revogado_em = now() where id = ${linkId} and revogado_em is null returning id`);
      if (r.length) return { ok: true as const };
      const [ja] = (await tx.execute(sql`select revogado_em is not null as revogado from maestro.fluxo_links where id = ${linkId}`)) as unknown as {
        revogado: boolean;
      }[];
      return ja?.revogado ? { ok: true as const } : falha("nao_existe", "Esse link não existe mais.");
    });
  } catch (e) {
    return traduzir(e);
  }
}

// ───────────── quem abre de fora ─────────────

/** Cookie da prova do PIN: um por link (pelo começo do hash do token), sem nada que diga de quem é. */
export const nomeCookiePinFluxo = (token: string) => `mae_fpin_${hashToken(token).slice(0, 16)}`;

function prova(th: string, ate: number): string {
  return `${ate}.${assinar(`${th}.${ate}`, "fluxo-pin")}`;
}

export function provaConfere(valor: string | undefined, th: string, agora = Date.now()): boolean {
  const [ate, sig] = String(valor ?? "").split(".");
  if (!ate || !sig || !/^\d{10,16}$/.test(ate) || !(Number(ate) > agora)) return false;
  return assinaturaConfere(`${th}.${ate}`, sig, "fluxo-pin");
}

export type MarcaDoLink = { nome: string; cor: string | null; logo: string | null; propria: boolean };
export type FluxoPublico = {
  titulo: string;
  expira: string;
  marca: MarcaDoLink;
  nos: NoFluxo[];
  ligacoes: LigacaoFluxo[];
  /** Referências só com o título (ou "sem acesso"), pelo id do nó. */
  refs: Record<string, RefResolvida>;
};
export type AberturaFluxo = { estado: "morto" } | { estado: "limite" } | { estado: "pin" } | { estado: "ok"; dados: FluxoPublico };

type NoBruto = {
  id: string;
  tipo: TipoNo;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  secaoId: string | null;
  dados: unknown;
  imagem: Omit<ImagemNo, "url" | "miniUrl"> | null;
  ref: string | null;
};
type Bruto = {
  estado: "ok";
  titulo: string;
  expira: string;
  marca: MarcaDoLink;
  nos: NoBruto[];
  ligacoes: { id: string; de: string; para: string; rotulo: string | null }[];
};

function paraPublico(token: string, b: Bruto): FluxoPublico {
  const refs: Record<string, RefResolvida> = {};
  const nos = b.nos.map((n): NoFluxo => {
    if (n.tipo === "roteiro" || n.tipo === "card")
      refs[n.id] = n.ref !== null ? { tipo: n.tipo, estado: "titulo", titulo: n.ref } : { tipo: n.tipo, estado: "sem_acesso" };
    const imagem: ImagemNo | null = n.imagem
      ? { ...n.imagem, url: caminhoImagemPeloLink(token, n.imagem), miniUrl: caminhoImagemPeloLink(token, n.imagem, true) }
      : null;
    return {
      id: n.id,
      tipo: n.tipo,
      x: Number(n.x),
      y: Number(n.y),
      w: Number(n.w),
      h: Number(n.h),
      z: Number(n.z),
      secaoId: n.secaoId,
      dados: lerDados(n.tipo, n.dados) ?? (lerDados(n.tipo, {}) as DadosNo) ?? ({} as DadosNo),
      imagemId: imagem?.id ?? null,
      // o id do roteiro/card não sai do banco pelo link
      roteiroId: null,
      cardId: null,
      imagem,
      rev: 1,
      apagado: false,
      atualizado: "",
      atualizadoPor: null,
    };
  });
  const ligacoes = b.ligacoes.map((l): LigacaoFluxo => ({ ...l, rev: 1, apagado: false, atualizado: "" }));
  return { titulo: b.titulo, expira: b.expira, marca: b.marca, nos, ligacoes, refs };
}

async function chamar<T>(consulta: ReturnType<typeof sql>): Promise<T | null> {
  return comoLink(async (tx: Tx) => {
    const linhas = (await tx.execute(consulta)) as unknown as { r: T | null }[];
    return linhas[0]?.r ?? null;
  });
}

async function limitesDeIp(ipHash: string): Promise<boolean> {
  const [ip, mortos] = await Promise.all([dentroDoLimite(`fluxo-ip:${ipHash}`, REGRAS.fluxoIp), dentroDoLimite(`fluxo-morto:${ipHash}`, REGRAS.fluxoMortoIp)]);
  return ip && mortos;
}

/**
 * Abre o fluxo do link (a página, o .md e o .json). `contar` = soma uma visita (e o audit a cada 10 min).
 * `cookies` = os do pedido (a prova do PIN).
 */
export async function abrirFluxoPublico(token: string, cookies: Cookies, ip: string, o: { contar?: boolean } = {}): Promise<AberturaFluxo> {
  const ipHash = ipHashDoDia(ip);
  if (!(await limitesDeIp(ipHash))) return { estado: "limite" };
  if (!ehTokenFluxo(token)) {
    await registrarTentativa(`fluxo-ip:${ipHash}`, `fluxo-morto:${ipHash}`);
    return { estado: "morto" };
  }
  const th = hashToken(token);
  if (!(await dentroDoLimite(`fluxo-abrir:${th}`, REGRAS.fluxoAbrir))) return { estado: "limite" };
  const pinOk = provaConfere(cookies.get(nomeCookiePinFluxo(token)), th);
  const r = await chamar<Bruto | { estado: "pin" }>(sql`select maestro.fluxo_link_abrir(${th}, ${pinOk}, ${o.contar ?? false}) as r`);
  if (!r) {
    await registrarTentativa(`fluxo-ip:${ipHash}`, `fluxo-morto:${ipHash}`);
    return { estado: "morto" };
  }
  await registrarTentativa(`fluxo-ip:${ipHash}`, `fluxo-abrir:${th}`);
  if (r.estado === "pin") return { estado: "pin" };
  return { estado: "ok", dados: paraPublico(token, r) };
}

export type ResultadoPinFluxo =
  { ok: true; cookie: { nome: string; valor: string; maxAge: number } } | { ok: false; erro: "morto" | "limite" | "pin"; mensagem: string };

/** Confere o PIN digitado (5 tentativas a cada 15 min por link e IP; 20 por link) e devolve o cookie da prova. */
export async function conferirPinFluxo(token: string, pinDigitado: unknown, ip: string, agora = Date.now()): Promise<ResultadoPinFluxo> {
  const ipHash = ipHashDoDia(ip);
  const morto = { ok: false as const, erro: "morto" as const, mensagem: "Este link não está mais ativo." };
  if (!(await limitesDeIp(ipHash))) return { ok: false, erro: "limite", mensagem: "Muitas tentativas. Espere alguns minutos." };
  if (!ehTokenFluxo(token)) {
    await registrarTentativa(`fluxo-ip:${ipHash}`, `fluxo-morto:${ipHash}`);
    return morto;
  }
  const th = hashToken(token);
  const p = await chamar<{ link: string; pin: string | null; expira: string }>(sql`select maestro.fluxo_link_pin(${th}) as r`);
  if (!p) {
    await registrarTentativa(`fluxo-ip:${ipHash}`, `fluxo-morto:${ipHash}`);
    return morto;
  }
  const chaveIp = `fluxo-pin:${th}:${ipHash}`;
  const chaveLink = `fluxo-pin:${th}`;
  const [porIp, porLink] = await Promise.all([dentroDoLimite(chaveIp, REGRAS.fluxoPinIp), dentroDoLimite(chaveLink, REGRAS.fluxoPin)]);
  if (!porIp || !porLink) return { ok: false, erro: "limite", mensagem: "Muitas tentativas. Espere 15 minutos." };
  if (p.pin && !pinConfere(String(pinDigitado ?? "").trim(), p.pin)) {
    await registrarTentativa(chaveIp, chaveLink, `fluxo-ip:${ipHash}`);
    return { ok: false, erro: "pin", mensagem: "PIN errado." };
  }
  const ate = Math.min(agora + PROVA_HORAS * 3600_000, new Date(p.expira).getTime());
  return { ok: true, cookie: { nome: nomeCookiePinFluxo(token), valor: prova(th, ate), maxAge: Math.max(1, Math.floor((ate - agora) / 1000)) } };
}

/** Os bytes de uma imagem pelo link (null = não existe, fora do fluxo ou link morto; "limite" = muitas). */
export async function imagemPeloLink(token: string, cookies: Cookies, ip: string, id: string, sha: string, mini = false): Promise<Buffer | "limite" | null> {
  const ipHash = ipHashDoDia(ip);
  const [porIp, mortos] = await Promise.all([
    dentroDoLimite(`fluxo-img:${ipHash}`, REGRAS.fluxoImagemIp),
    dentroDoLimite(`fluxo-morto:${ipHash}`, REGRAS.fluxoMortoIp),
  ]);
  if (!porIp || !mortos) return "limite";
  if (!ehTokenFluxo(token) || !ehUuid(id) || !/^[0-9a-f]{64}$/.test(sha)) {
    await registrarTentativa(`fluxo-morto:${ipHash}`);
    return null;
  }
  const th = hashToken(token);
  const pinOk = provaConfere(cookies.get(nomeCookiePinFluxo(token)), th);
  const b = await comoLink(async (tx) => {
    const [l] = (await tx.execute(sql`select maestro.fluxo_link_imagem(${th}, ${pinOk}, ${id}::uuid, ${sha}, ${mini}) as r`)) as unknown as {
      r: Buffer | null;
    }[];
    return l?.r ?? null;
  });
  await registrarTentativa(b ? `fluxo-img:${ipHash}` : `fluxo-morto:${ipHash}`);
  return b ? Buffer.from(b) : null;
}
