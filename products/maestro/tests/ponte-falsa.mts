/**
 * O HUB e o SOBEDESCE de mentira para a ponte do Drive (src/lib/sobedesce/ponte.ts), nos testes e no e2e:
 * - POST /api/v1/apps/pedidos: Bearer (o access token da sessão) ou Basic (credencial do Maestro + sub, só recolher);
 *   devolve um pedido "assinado" de uso único e a url do SOBEDESCE falso. `negar` = sem o SOBEDESCE no plano (403).
 * - /api/v1/pessoas/* (ADR 0029 do HUB): busca por @ ou nome nos perfis de `pessoas` (só os visíveis, nunca e-mail),
 *   o perfil de um @ e o convite pelo @ (guardado em `convites`; `naEquipe` = 409). Gente de demonstração, fictícia.
 * - POST /api/zro/drive/*: confere o pedido (mesma ação, uso único) e responde com o Drive de mentira
 *   (tests/drive-fixture.mts): listar, miniatura, criar a estrutura do projeto, compartilhar e recolher (as permissões
 *   ficam na memória para o teste conferir) e o token curto. `semDrive` = a pessoa sem Drive conectado (409).
 * - POST /api/zro/relay/{converter,pedido,cancelar} (contrato "Maestro → Relay" em docs/integration-contracts/relay.md):
 *   a fila de mentira do SOBEDESCE, idempotente por `ref:preset`. Nada converte sozinho: com `relay.avancar`, cada
 *   leitura de `relay.pedido` anda um passo (pendente → convertendo 50% → pronto com resultado e MD5). `relay.negar` =
 *   o HUB sem o Relay no plano (403 com `details.product = relay`); `relay.semPonte` = o HUB ainda sem as ações
 *   `relay.*` na PONTES (403 `action_not_allowed`). `relay.converterFalha`: "rede" = guarda os pedidos e derruba a
 *   conexão sem responder (o despacho ambíguo), "recusa" = 400 sem guardar nada, "parcial" = guarda todos e responde
 *   só o primeiro. `relay.pedidoFalha` = "rede" derruba o `relay.pedido`; `relay.cancelarFalha` = "rede" cancela e
 *   derruba. Apagar de `relay.pedidos` = o SOBEDESCE não acha mais o pedido. `relay.computador.relay` = false: nenhum
 *   computador converte (`relay.converter` 409 `sem_computador_relay`, como o site); com `desatualizado`, só app antigo. No e2e, POST /__relay muda (com
 *   `pronto: true`, todos os andando ficam prontos de uma vez) e GET /__relay lê.
 */
import { randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { DRIVE_FIXO, listarFixo } from "./drive-fixture.mts";
import { nomeSaida } from "../src/lib/relay/plano.js";
import { preset as acharPreset } from "../src/lib/relay/presets.js";

const CAMINHOS: Record<string, string> = {
  "drive.listar": "/api/zro/drive/listar",
  "drive.miniatura": "/api/zro/drive/miniatura",
  "drive.pasta.criar": "/api/zro/drive/pasta/criar",
  "drive.compartilhar_revisao": "/api/zro/drive/revisao/compartilhar",
  "drive.recolher_revisao": "/api/zro/drive/revisao/recolher",
  "drive.token": "/api/zro/drive/token",
  "relay.converter": "/api/zro/relay/converter",
  "relay.pedido": "/api/zro/relay/pedido",
  "relay.cancelar": "/api/zro/relay/cancelar",
};

export type PedidoRelayFalso = {
  id: string;
  preset: string;
  ref: string;
  status: "pendente" | "convertendo" | "pronto" | "erro" | "cancelado";
  frac?: number;
  resultado?: { arquivoId: string; nome: string; tamanho: number; md5: string; pastaId: string };
  erro?: string;
  arquivoId: string;
  pastaId: string | null;
  conta: string | null;
  criado_em: string;
  atualizado_em: string;
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
    pedidos: [] as PedidoVisto[],
    chamadas: [] as { acao: string; corpo: Record<string, unknown> }[],
    /** arquivo → permissões "anyone" criadas (id). */
    publicos: new Map<string, string[]>(),
    /** A fila do Relay no SOBEDESCE de mentira (ver o topo). */
    relay: {
      pedidos: new Map<string, PedidoRelayFalso>(),
      /** `relay`: algum computador da conta converte (app 0.2.0+); `desatualizado`: só app antigo. */
      computador: { aberto_agora: false, usado_ha_pouco: false, relay: true, desatualizado: false },
      avancar: false,
      /** O próximo passo de quem converte: erro em vez de pronto. */
      falhar: false,
      negar: false,
      semPonte: false,
      converterFalha: null as null | "rede" | "recusa" | "parcial",
      pedidoFalha: null as null | "rede",
      cancelarFalha: null as null | "rede",
    },
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

  /** Quem converte terminou: o arquivo novo no Drive, com o MD5 (conferido do lado do SOBEDESCE de verdade). */
  const ficarPronto = (p: PedidoRelayFalso) => {
    const original = DRIVE_FIXO.find((f) => f.id === p.arquivoId)?.name ?? "video.mp4";
    Object.assign(p, {
      status: "pronto",
      frac: 1,
      atualizado_em: new Date().toISOString(),
      resultado: {
        arquivoId: `out-${p.id.slice(3)}`,
        nome: nomeSaida(original, p.preset),
        tamanho: 12_345_678,
        md5: randomBytes(16).toString("hex"),
        pastaId: p.pastaId ?? "f-aurora",
      },
    });
  };
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
    if (url.pathname === "/__relay") {
      const rl = estado.relay;
      if (req.method === "POST") {
        for (const k of ["avancar", "falhar", "negar", "semPonte"] as const) if (typeof corpo[k] === "boolean") rl[k] = corpo[k] as boolean;
        for (const k of ["converterFalha", "pedidoFalha", "cancelarFalha"] as const)
          if (k in corpo) (rl as Record<string, unknown>)[k] = corpo[k] === null ? null : String(corpo[k]);
        if (corpo.computador && typeof corpo.computador === "object") Object.assign(rl.computador, corpo.computador);
        if (corpo.pronto === true) for (const p of rl.pedidos.values()) if (p.status === "pendente" || p.status === "convertendo") ficarPronto(p);
      }
      return enviar(res, 200, { ...rl, pedidos: [...rl.pedidos.values()] });
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
      else if (acao.startsWith("relay.") && estado.relay.semPonte)
        return enviar(res, 403, { error: "action_not_allowed", message: "Esta ação não está liberada para este app." });
      else if (acao.startsWith("relay.") && estado.relay.negar)
        return enviar(res, 403, { error: "entitlement_required", message: "Fora do plano.", details: { product: "relay", upgrade: true } });
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
      const rl = estado.relay;
      const agora = () => new Date().toISOString();
      switch (acao) {
        case "relay.converter": {
          const presets = Array.isArray(corpo.presets) ? corpo.presets.map(String) : [];
          const ref = String(corpo.ref ?? "");
          if (!id || !ref || ref.length > 120 || presets.length < 1 || presets.length > 8 || presets.some((p) => !acharPreset(p)))
            return enviar(res, 400, { erro: "entrada", mensagem: "Pedido inválido." });
          if (rl.converterFalha === "recusa") return enviar(res, 400, { erro: "arquivo", mensagem: "O SOBEDESCE não acha este arquivo no Drive." });
          // como o site: nenhum computador que converta, nada entra na fila
          if (!rl.computador.relay)
            return enviar(res, 409, { erro: "sem_computador_relay", mensagem: "Atualize o SOBEDESCE no computador para gerar versões." });
          const pedidos = presets.map((preset) => {
            const ja = [...rl.pedidos.values()].find((p) => p.ref === ref && p.preset === preset && p.status !== "erro" && p.status !== "cancelado");
            if (ja) return ja;
            const novo: PedidoRelayFalso = {
              id: `rl-${randomBytes(5).toString("hex")}`,
              preset,
              ref,
              status: "pendente",
              arquivoId: id,
              pastaId: typeof corpo.pastaId === "string" ? corpo.pastaId : null,
              conta: typeof corpo.conta === "string" ? corpo.conta : null,
              criado_em: agora(),
              atualizado_em: agora(),
            };
            rl.pedidos.set(novo.id, novo);
            return novo;
          });
          // guardou e a resposta não volta: o despacho ambíguo
          if (rl.converterFalha === "rede") return void res.socket?.destroy();
          const devolvidos = rl.converterFalha === "parcial" ? pedidos.slice(0, 1) : pedidos;
          return enviar(res, 202, { pedidos: devolvidos.map((p) => ({ id: p.id, preset: p.preset, ref: p.ref, status: p.status })) });
        }
        case "relay.pedido": {
          const ids = Array.isArray(corpo.ids) ? corpo.ids.map(String) : [];
          if (ids.length > 50) return enviar(res, 400, { erro: "entrada", mensagem: "No máximo 50." });
          if (rl.pedidoFalha === "rede") return void res.socket?.destroy();
          const lista = ids.map((i) => rl.pedidos.get(i)).filter((p): p is PedidoRelayFalso => !!p);
          if (rl.avancar)
            for (const p of lista) {
              if (p.status === "pendente") Object.assign(p, { status: "convertendo", frac: 0.5, atualizado_em: agora() });
              else if (p.status === "convertendo" && rl.falhar)
                Object.assign(p, { status: "erro", erro: "O ffmpeg parou no meio.", frac: undefined, atualizado_em: agora() });
              else if (p.status === "convertendo") ficarPronto(p);
            }
          return enviar(res, 200, {
            pedidos: lista.map(({ arquivoId: _a, pastaId: _p, conta: _c, ...p }) => (void _a, void _p, void _c, p)),
            computador: rl.computador,
          });
        }
        case "relay.cancelar": {
          const p = rl.pedidos.get(String(corpo.id ?? ""));
          if (!p) return enviar(res, 404, { erro: "nao_achou", mensagem: "Pedido não encontrado." });
          if (p.status === "pronto" || p.status === "erro" || p.status === "cancelado") return enviar(res, 200, { cancelado: false, ja_terminado: true });
          Object.assign(p, { status: "cancelado", atualizado_em: agora() });
          if (rl.cancelarFalha === "rede") return void res.socket?.destroy();
          return enviar(res, 200, { cancelado: true, ja_terminado: false });
        }
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
          // as pastas que a estrutura do projeto criou (drive.pasta.criar) também aparecem
          for (const pp of estado.pastas.values())
            if (corpo.pasta && pp.pai === corpo.pasta)
              itens.push({
                id: pp.id,
                nome: pp.nome,
                tipo: "application/vnd.google-apps.folder",
                pasta: true,
                modificado: new Date().toISOString(),
                tamanho: null,
                miniatura: null,
                video: null,
                abrir_no_sobedesce: null,
              });
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
