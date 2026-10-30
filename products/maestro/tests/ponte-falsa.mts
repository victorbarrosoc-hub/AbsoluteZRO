/**
 * O HUB e o SOBEDESCE de mentira para a ponte do Drive (src/lib/sobedesce/ponte.ts), nos testes e no e2e:
 * - POST /api/v1/apps/pedidos: Bearer (o access token da sessão) ou Basic (credencial do Maestro + sub, só recolher);
 *   devolve um pedido "assinado" de uso único e a url do SOBEDESCE falso. `negar` = sem o SOBEDESCE no plano (403).
 * - /api/v1/pessoas/* (ADR 0029 do HUB): busca por @ ou nome nos perfis de `pessoas` (só os visíveis, nunca e-mail),
 *   o perfil de um @ e o convite pelo @ (guardado em `convites`; `naEquipe` = 409). Gente de demonstração, fictícia.
 * - /api/v1/apps/entregas* (Criação F8): a caixa de entrada do TPeasy na Absolute ZRO de mentira. POST confere o corpo
 *   contra o contrato publicado (zro.app-entrega.entrada.v1) e guarda uma entrega por destinatário e chave (a mesma
 *   versão de novo = "reenviada", nada duplica); GET ?roteiro= o que foi; /destinatarios você + `equipe`; /recebidas é o
 *   que o TPeasy lê (e marca "Recebido"). `negar` = sem o TPeasy no plano (403). No e2e, /__entregas lê e muda.
 * - POST /api/zro/drive/*: confere o pedido (mesma ação, uso único) e responde com o Drive de mentira
 *   (tests/drive-fixture.mts): listar, miniatura, criar a estrutura do projeto, compartilhar e recolher (as permissões
 *   ficam na memória para o teste conferir) e o token curto. `semDrive` = a pessoa sem Drive conectado (409).
 */
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { DRIVE_FIXO, listarFixo } from "./drive-fixture.mts";
import { conferirEsquema, esquemaPublicado } from "./esquema-json.mts";

const CAMINHOS: Record<string, string> = {
  "drive.listar": "/api/zro/drive/listar",
  "drive.miniatura": "/api/zro/drive/miniatura",
  "drive.pasta.criar": "/api/zro/drive/pasta/criar",
  "drive.compartilhar_revisao": "/api/zro/drive/revisao/compartilhar",
  "drive.recolher_revisao": "/api/zro/drive/revisao/recolher",
  "drive.token": "/api/zro/drive/token",
};

/** Uma entrega guardada na caixa de mentira (a forma do HUB, migração 0040). */
export type EntregaFalsa = {
  id: string;
  chave: string;
  item: string;
  versao: number;
  titulo: string;
  corpo: string;
  link: string | null;
  alvo_seg: number;
  para: string;
  de: string;
  roteiro: string;
  criada_em: string;
  atualizada_em: string;
  recebida_em: string | null;
  vezes: number;
};
const EU_FALSO = "00000000-0000-4000-8000-00000000e0e0";
/** O `sub` de quem chama: o token dos testes é `at-<sub>`; o resto é a mesma pessoa fixa. */
const subDoToken = (autorizacao: string) => /^Bearer at-([0-9a-f-]{36})$/i.exec(autorizacao)?.[1] ?? EU_FALSO;
const novoId = () => {
  const h = randomBytes(16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

export type PedidoVisto = { acao: string; jeito: "pessoa" | "app"; autorizacao: string; sub: string | null };

export async function iniciarPonteFalsa(o: { porta?: number; cliente?: { clientId: string; clientSecret: string } } = {}) {
  /** Perfis da Absolute ZRO falsa (fictícios). `visivel: false` = escondido (a busca e o @ não acham). */
  const pessoas = [
    {
      id: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a01",
      arroba: "carla.drone",
      nome: "Carla Nunes",
      funcoes: [
        { chave: "camera", nome: "Câmera" },
        { chave: "drone", nome: "Drone" },
      ],
      cidade: "Natal",
      selos: [{ produto: "carro-do-freela", texto: "Freela no Carro do Freela" }],
      visivel: true,
    },
    {
      id: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a02",
      arroba: "rafa.edita",
      nome: "Rafael Prado",
      funcoes: [
        { chave: "edicao", nome: "Edição" },
        { chave: "color", nome: "Color" },
      ],
      cidade: "Recife",
      selos: [],
      visivel: true,
    },
    {
      id: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a03",
      arroba: "lu.som",
      nome: "Luana Sá",
      funcoes: [
        { chave: "som", nome: "Som" },
        { chave: "outra", nome: "Microfonista" },
      ],
      cidade: "Natal",
      selos: [],
      visivel: true,
    },
    { id: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a04", arroba: "oculta.pessoa", nome: "Pessoa Escondida", funcoes: [], cidade: null, selos: [], visivel: false },
  ];
  const estado = {
    /** Pessoas (ADR 0029 do HUB): os perfis, os convites feitos pelo @ e quem já está na equipe (convite = 409). */
    pessoasZro: { lista: pessoas, convites: [] as { arroba: string; papel: string }[], naEquipe: new Set<string>() },
    negar: false,
    semDrive: false,
    /** A caixa de entrada do TPeasy (F8): `negar` = sem o TPeasy no plano; `equipe` = quem da organização usa o TPeasy. */
    entregas: {
      negar: false,
      equipe: [] as { id: string; nome: string }[],
      lista: [] as EntregaFalsa[],
      recusados: [] as string[][],
    },
    pedidos: [] as PedidoVisto[],
    chamadas: [] as { acao: string; corpo: Record<string, unknown> }[],
    /** arquivo → permissões "anyone" criadas (id). */
    publicos: new Map<string, string[]>(),
    pastas: new Map<string, { id: string; nome: string; pai: string }>(),
    /**
     * A Agenda das Conexões (/api/v1/agenda/*, ADR 0026 do HUB): conectada, Maestro ligado, ocupado e os eventos que o
     * Maestro gravou (ref → corpo). `falhar` = o HUB fora do ar (503). No e2e, POST /__agenda muda e GET /__agenda lê.
     */
    agenda: {
      conectada: true,
      appLigado: true,
      falhar: false,
      ocupado: [] as { inicio: string; fim: string }[],
      eventos: new Map<string, Record<string, unknown>>(),
      chamadas: [] as { metodo: string; ref: string | null }[],
    },
  };
  const publicoDe = (p: (typeof pessoas)[number]) => ({
    id: p.id,
    arroba: p.arroba,
    nome: p.nome,
    foto: null,
    funcoes: p.funcoes,
    cidade: p.cidade,
    portfolio: null,
    bio: null,
    selos: p.selos,
  });
  const semAcento = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const emitidos = new Map<string, { acao: string; usado: boolean; sub: string | null }>();

  const enviar = (res: http.ServerResponse, status: number, dados: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(dados));
  };
  const ler = async (req: http.IncomingMessage) => {
    let t = "";
    for await (const p of req) t += p;
    try {
      return JSON.parse(t || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const autorizacao = String(req.headers.authorization ?? "");
    const corpo = req.method === "POST" || req.method === "PUT" ? await ler(req) : {};
    const ag = estado.agenda;
    if (url.pathname === "/__agenda") {
      if (req.method === "POST") Object.assign(ag, corpo);
      return enviar(res, 200, { ...ag, eventos: Object.fromEntries(ag.eventos) });
    }
    const en = estado.entregas;
    if (url.pathname === "/__entregas") {
      if (req.method === "POST") Object.assign(en, corpo);
      return enviar(res, 200, en);
    }
    if (url.pathname.startsWith("/api/v1/apps/entregas")) {
      if (!/^Bearer \S+$/.test(autorizacao)) return enviar(res, 401, { error: "unauthenticated" });
      const eu = subDoToken(autorizacao);
      const caminho = url.pathname.slice("/api/v1/apps/entregas".length);
      const estadoDe = (e: EntregaFalsa) => ({
        id: e.id,
        item: e.item,
        versao: e.versao,
        para: { id: e.para, nome: e.para === eu ? "Você" : (en.equipe.find((x) => x.id === e.para)?.nome ?? "Pessoa"), eu: e.para === eu },
        criada_em: e.criada_em,
        atualizada_em: e.atualizada_em,
        recebida_em: e.recebida_em,
      });
      if (caminho === "/recebidas" && req.method === "GET")
        return enviar(res, 200, {
          agora: new Date().toISOString(),
          entregas: en.lista
            .filter((e) => e.para === eu)
            .map((e) => ({
              id: e.id,
              origem: "maestro",
              tipo: "roteiro",
              item: e.item,
              versao: e.versao,
              titulo: e.titulo,
              corpo: e.corpo,
              sha256: createHash("sha256").update(e.corpo).digest("hex"),
              link: e.link,
              alvo_seg: e.alvo_seg,
              de: e.de,
              atualizada_em: e.atualizada_em,
            })),
        });
      if (caminho === "/recebidas" && req.method === "POST") {
        let n = 0;
        for (const e of en.lista)
          if (e.para === eu && Array.isArray(corpo.ids) && corpo.ids.includes(e.id) && !e.recebida_em) {
            e.recebida_em = new Date().toISOString();
            n++;
          }
        return enviar(res, 200, { marcadas: n });
      }
      if (en.negar) return enviar(res, 403, { error: "entitlement_required", message: "Seu plano não inclui o TPeasy." });
      if (caminho === "/destinatarios" && req.method === "GET")
        return enviar(res, 200, {
          destinatarios: [{ id: eu, nome: "Você", foto: null, eu: true }, ...en.equipe.map((x) => ({ ...x, foto: null, eu: false }))],
        });
      if (caminho === "" && req.method === "GET") {
        const roteiro = url.searchParams.get("roteiro") ?? "";
        return enviar(res, 200, {
          entregas: en.lista
            .filter((e) => e.roteiro === roteiro)
            .sort((a, b) => b.atualizada_em.localeCompare(a.atualizada_em))
            .map(estadoDe),
        });
      }
      if (caminho === "" && req.method === "POST") {
        const erros = conferirEsquema(esquemaPublicado("zro.app-entrega.entrada.v1"), corpo);
        if (erros.length) {
          en.recusados.push(erros);
          return enviar(res, 422, { error: "invalid_input", message: "Entrega fora do formato." });
        }
        const r = corpo.roteiro as { id: string; versao: number; pessoa: string | null };
        const para = typeof corpo.para === "string" ? corpo.para : eu;
        if (para !== eu && !en.equipe.some((x) => x.id === para)) return enviar(res, 404, { error: "not_found", message: "Essa pessoa não usa o TPeasy." });
        const chave = `maestro:roteiro:${r.id}:${r.pessoa || "todas"}:v${r.versao}`;
        const agora = new Date().toISOString();
        const ja = en.lista.find((e) => e.para === para && e.chave === chave);
        if (ja) {
          Object.assign(ja, { atualizada_em: agora, recebida_em: null, vezes: ja.vezes + 1, corpo: String(corpo.corpo), titulo: String(corpo.titulo) });
          return enviar(res, 200, { ...estadoDe(ja), situacao: "reenviada" });
        }
        const e: EntregaFalsa = {
          id: novoId(),
          chave,
          item: `maestro-${r.id}-${r.pessoa || "todas"}`.slice(0, 100),
          versao: r.versao,
          titulo: String(corpo.titulo),
          corpo: String(corpo.corpo),
          link: typeof corpo.link === "string" ? corpo.link : null,
          alvo_seg: Number(corpo.alvo_seg) || 0,
          para,
          de: "Rita Roteiro",
          roteiro: r.id,
          criada_em: agora,
          atualizada_em: agora,
          recebida_em: null,
          vezes: 1,
        };
        en.lista.push(e);
        return enviar(res, 201, { ...estadoDe(e), situacao: "nova" });
      }
      return enviar(res, 404, { error: "not_found" });
    }
    if (url.pathname.startsWith("/api/v1/pessoas/")) {
      if (!/^Bearer \S+$/.test(autorizacao)) return enviar(res, 401, { error: "unauthenticated" });
      const est = estado.pessoasZro;
      const caminho = decodeURIComponent(url.pathname.slice("/api/v1/pessoas/".length));
      if (caminho === "busca" && req.method === "GET") {
        const q = semAcento((url.searchParams.get("q") ?? "").trim());
        const a = q.replace(/^@/, "");
        if (a.length < 2) return enviar(res, 200, { pessoas: [] });
        const achou = pessoas.filter((p) => p.visivel && (p.arroba.startsWith(a) || (!q.startsWith("@") && semAcento(p.nome).includes(a))));
        return enviar(res, 200, { pessoas: achou.map(publicoDe) });
      }
      if (caminho === "convites" && req.method === "POST") {
        const a = String(corpo.arroba ?? "").replace(/^@/, "");
        const p = pessoas.find((x) => x.arroba === a && x.visivel);
        if (!p) return enviar(res, 404, { error: "not_found", message: "Não achamos esse @." });
        if (est.naEquipe.has(a) || est.convites.some((c) => c.arroba === a))
          return enviar(res, 409, { error: "conflict", message: `@${a} já tem um convite aberto.` });
        est.convites.push({ arroba: a, papel: String(corpo.papel ?? "") });
        return enviar(res, 201, { convite: { id: `conv-${a}`, arroba: a, papel: corpo.papel, aviso: "central" } });
      }
      const m = /^@([a-z0-9._]{3,30})$/.exec(caminho);
      if (m && req.method === "GET") {
        const p = pessoas.find((x) => x.arroba === m[1] && x.visivel);
        return p ? enviar(res, 200, { pessoa: publicoDe(p), antiga: false }) : enviar(res, 404, { error: "not_found" });
      }
      return enviar(res, 404, { error: "not_found" });
    }
    if (url.pathname.startsWith("/api/v1/agenda/")) {
      if (!/^Bearer \S+$/.test(autorizacao)) return enviar(res, 401, { error: "unauthenticated" });
      const conectar = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/conexoes`;
      const caminho = url.pathname.slice("/api/v1/agenda/".length);
      if (caminho === "conexao" && req.method === "GET")
        return enviar(res, 200, {
          conectada: ag.conectada,
          estado: ag.conectada ? "ativa" : null,
          conta_email: ag.conectada ? "equipe@produtora.test" : null,
          app_ligado: ag.appLigado,
          calendarios: ag.conectada ? 1 : 0,
          conectar,
        });
      if (ag.falhar) return enviar(res, 503, { error: "upstream_unavailable", message: "O Google não respondeu agora." });
      if (!ag.conectada) return enviar(res, 409, { error: "sem_conexao", message: "Conecte o Google Agenda.", details: { motivo: "nenhuma", conectar } });
      if (!ag.appLigado) return enviar(res, 403, { error: "app_desligado", message: "Desligado.", details: { conectar } });
      if (caminho === "livre-ocupado" && req.method === "GET") {
        const de = Date.parse(url.searchParams.get("de") ?? "");
        const ate = Date.parse(url.searchParams.get("ate") ?? "");
        if (Number.isNaN(de) || Number.isNaN(ate)) return enviar(res, 422, { error: "invalid_input" });
        return enviar(res, 200, { ocupado: ag.ocupado.filter((o) => Date.parse(o.fim) > de && Date.parse(o.inicio) < ate), calendarios: 1, incompleta: false });
      }
      const m = /^eventos\/maestro\/([A-Za-z0-9._:-]{1,120})$/.exec(caminho);
      if (m && req.method === "PUT") {
        ag.chamadas.push({ metodo: "PUT", ref: m[1]! });
        const novo = !ag.eventos.has(m[1]!);
        ag.eventos.set(m[1]!, corpo);
        return enviar(res, novo ? 201 : 200, { id: `g-${m[1]}`, criado: novo, link: null });
      }
      if (m && req.method === "DELETE") {
        ag.chamadas.push({ metodo: "DELETE", ref: m[1]! });
        ag.eventos.delete(m[1]!);
        res.writeHead(204);
        return res.end();
      }
      return enviar(res, 404, { error: "not_found" });
    }
    if (url.pathname === "/api/v1/apps/pedidos" && req.method === "POST") {
      const acao = String(corpo.acao ?? "");
      if (!CAMINHOS[acao] || corpo.destino !== "sobedesce") return enviar(res, 403, { error: "action_not_allowed" });
      let jeito: "pessoa" | "app" = "pessoa";
      if (autorizacao.startsWith("Basic ")) {
        const [id, segredo] = Buffer.from(autorizacao.slice(6), "base64").toString().split(":").map(decodeURIComponent);
        if (!o.cliente || id !== o.cliente.clientId || segredo !== o.cliente.clientSecret) return enviar(res, 401, { error: "unauthenticated" });
        if (acao !== "drive.recolher_revisao") return enviar(res, 403, { error: "action_not_allowed" });
        jeito = "app";
      } else if (!/^Bearer \S+$/.test(autorizacao)) return enviar(res, 401, { error: "unauthenticated" });
      else if (estado.negar && acao !== "drive.recolher_revisao") return enviar(res, 403, { error: "entitlement_required" });
      const sub = typeof corpo.sub === "string" ? corpo.sub : null;
      estado.pedidos.push({ acao, jeito, autorizacao, sub });
      const token = `${randomBytes(6).toString("base64url")}.${Buffer.from(acao).toString("base64url")}.${randomBytes(8).toString("base64url")}`;
      emitidos.set(token, { acao, usado: false, sub });
      const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
      return enviar(res, 201, {
        tipo: "zro-pedido+jwt",
        token,
        aud: "sobedesce-web",
        acao,
        expira_em: new Date(Date.now() + 60_000).toISOString(),
        url: base + CAMINHOS[acao],
      });
    }
    const acao = Object.keys(CAMINHOS).find((a) => CAMINHOS[a] === url.pathname);
    if (acao && req.method === "POST") {
      const t = /^Bearer (\S+)$/.exec(autorizacao)?.[1] ?? "";
      const e = emitidos.get(t);
      if (!e || e.usado || e.acao !== acao) return enviar(res, 401, { erro: "nao_autorizado", mensagem: "Pedido inválido." });
      e.usado = true;
      estado.chamadas.push({ acao, corpo });
      if (estado.semDrive && acao !== "drive.recolher_revisao") return enviar(res, 409, { erro: "sem_drive", mensagem: "Nenhum Google Drive conectado." });
      const id = String(corpo.arquivoId ?? "");
      switch (acao) {
        case "drive.token":
          return enviar(res, 200, {
            access_token: `ya29.falso-${randomBytes(6).toString("hex")}`,
            expira_em: new Date(Date.now() + 3600_000).toISOString(),
            conta: { id: "g-equipe", email: "equipe@produtora.test" },
            contas: [{ id: "g-equipe", email: "equipe@produtora.test" }],
          });
        case "drive.listar": {
          const itens = listarFixo(corpo.pasta ? `'${String(corpo.pasta)}' in parents` : "'root' in parents").map((f) => ({
            id: f.id,
            nome: f.name,
            tipo: f.mimeType,
            pasta: f.mimeType.endsWith("folder"),
            modificado: f.modifiedTime,
            tamanho: f.size ? Number(f.size) : null,
            miniatura: f.thumbnailLink ?? null,
            video: null,
            abrir_no_sobedesce: null,
          }));
          return enviar(res, 200, { conta: { id: "g-equipe", email: "equipe@produtora.test" }, pasta: null, itens, proxima: null });
        }
        case "drive.miniatura": {
          const f = DRIVE_FIXO.find((x) => x.id === id);
          return f?.thumbnailLink
            ? enviar(res, 200, { url: "https://lh3.googleusercontent.com/falso=s400", expira_em: new Date(Date.now() + 3600_000).toISOString() })
            : enviar(res, 404, { erro: "nao_achou" });
        }
        case "drive.pasta.criar": {
          let criadas = 0;
          const passo = (pai: string, nome: string) => {
            const k = `${pai}/${nome}`;
            if (!estado.pastas.has(k)) {
              estado.pastas.set(k, { id: `p-${randomBytes(5).toString("hex")}`, nome, pai });
              criadas++;
            }
            return estado.pastas.get(k)!;
          };
          const m = passo(String(corpo.raiz ?? "root"), "Maestro");
          const c = passo(m.id, String(corpo.cliente));
          const p = passo(c.id, String(corpo.projeto));
          const subpastas = ["01 Briefing", "02 Bruto", "03 Edição", "04 Revisão", "05 Entregas"].map((n) => {
            const s = passo(p.id, n);
            return { id: s.id, nome: s.nome };
          });
          return enviar(res, criadas ? 201 : 200, { pasta: { id: p.id, nome: p.nome, abrir_no_sobedesce: null }, subpastas, criadas });
        }
        case "drive.compartilhar_revisao": {
          const l = estado.publicos.get(id) ?? [];
          if (l.length) return enviar(res, 200, { arquivoId: id, permissao_id: null, ja_publico: true, resource_key: null });
          const pid = `perm-${randomBytes(4).toString("hex")}`;
          estado.publicos.set(id, [pid]);
          return enviar(res, 200, { arquivoId: id, permissao_id: pid, ja_publico: false, resource_key: null });
        }
        case "drive.recolher_revisao": {
          const l = estado.publicos.get(id) ?? [];
          const tinha = l.includes(String(corpo.permissaoId));
          estado.publicos.set(
            id,
            l.filter((p) => p !== corpo.permissaoId),
          );
          return enviar(res, 200, { recolhido: true, ja_nao_havia: !tinha });
        }
      }
    }
    enviar(res, 404, { erro: "nao_encontrado" });
  });
  await new Promise<void>((ok) => servidor.listen(o.porta ?? 0, "127.0.0.1", ok));
  return {
    url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`,
    estado,
    fechar: () => new Promise<void>((ok) => servidor.close(() => ok())),
  };
}
