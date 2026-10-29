/**
 * O HUB e o SOBEDESCE de mentira para a ponte do Drive (src/lib/sobedesce/ponte.ts), nos testes e no e2e:
 * - POST /api/v1/apps/pedidos: Bearer (o access token da sessão) ou Basic (credencial do Maestro + sub, só recolher);
 *   devolve um pedido "assinado" de uso único e a url do SOBEDESCE falso. `negar` = sem o SOBEDESCE no plano (403).
 * - POST /api/zro/drive/*: confere o pedido (mesma ação, uso único) e responde com o Drive de mentira
 *   (tests/drive-fixture.mts): listar, miniatura, criar a estrutura do projeto, compartilhar e recolher (as permissões
 *   ficam na memória para o teste conferir) e o token curto. `semDrive` = a pessoa sem Drive conectado (409).
 */
import { randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { DRIVE_FIXO, listarFixo } from "./drive-fixture.mts";

const CAMINHOS: Record<string, string> = {
  "drive.listar": "/api/zro/drive/listar",
  "drive.miniatura": "/api/zro/drive/miniatura",
  "drive.pasta.criar": "/api/zro/drive/pasta/criar",
  "drive.compartilhar_revisao": "/api/zro/drive/revisao/compartilhar",
  "drive.recolher_revisao": "/api/zro/drive/revisao/recolher",
  "drive.token": "/api/zro/drive/token",
};

export type PedidoVisto = { acao: string; jeito: "pessoa" | "app"; autorizacao: string; sub: string | null };

export async function iniciarPonteFalsa(o: { porta?: number; cliente?: { clientId: string; clientSecret: string } } = {}) {
  const estado = {
    negar: false,
    semDrive: false,
    pedidos: [] as PedidoVisto[],
    chamadas: [] as { acao: string; corpo: Record<string, unknown> }[],
    /** arquivo → permissões "anyone" criadas (id). */
    publicos: new Map<string, string[]>(),
    pastas: new Map<string, { id: string; nome: string; pai: string }>(),
  };
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
    const corpo = req.method === "POST" ? await ler(req) : {};
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
