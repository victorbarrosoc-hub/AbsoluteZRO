/**
 * O Google Drive v3 de mentira no navegador do e2e: o contexto intercepta https://www.googleapis.com/drive/v3/** (da
 * página e do service worker /drive-sw.js) e responde com tests/drive-fixture.mts. O vídeo é o sintético da
 * demonstração (public/demo/demo-corte-1.mp4), com Range → 206, como o Google. Só aceita o token falso da ponte.
 */
import { readFileSync } from "node:fs";
import type { BrowserContext } from "@playwright/test";
import { DRIVE_FIXO, DRIVES_FIXOS, listarFixo } from "../../tests/drive-fixture.mts";

const VIDEO = readFileSync(new URL("../../public/demo/demo-corte-1.mp4", import.meta.url));
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, range, content-type",
  "access-control-expose-headers": "content-range, content-length, accept-ranges",
};

export async function googleDeMentira(context: BrowserContext): Promise<{ midia: string[] }> {
  const midia: string[] = [];
  await context.route("https://www.googleapis.com/drive/v3/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-methods": "GET" } });
    if (!/^Bearer ya29\.falso-/.test(req.headers()["authorization"] ?? ""))
      return route.fulfill({ status: 401, headers: CORS, json: { error: { code: 401 } } });
    const u = new URL(req.url());
    const caminho = u.pathname.replace(/^\/drive\/v3/, "");
    if (caminho === "/files") return route.fulfill({ headers: CORS, json: { files: listarFixo(u.searchParams.get("q") ?? "") } });
    if (caminho === "/drives") return route.fulfill({ headers: CORS, json: { drives: DRIVES_FIXOS } });
    const id = decodeURIComponent(caminho.replace(/^\/files\//, ""));
    const f = DRIVE_FIXO.find((x) => x.id === id);
    if (!f) return route.fulfill({ status: 404, headers: CORS, json: { error: { code: 404 } } });
    if (u.searchParams.get("alt") !== "media") return route.fulfill({ headers: CORS, json: { ...f, size: String(VIDEO.length) } });
    midia.push(id);
    const r = /^bytes=(\d+)-(\d*)$/.exec(req.headers()["range"] ?? "");
    if (!r) return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "video/mp4", "accept-ranges": "bytes" }, body: VIDEO });
    const ini = Number(r[1]);
    const fim = r[2] ? Math.min(Number(r[2]), VIDEO.length - 1) : VIDEO.length - 1;
    return route.fulfill({
      status: 206,
      headers: { ...CORS, "content-type": "video/mp4", "accept-ranges": "bytes", "content-range": `bytes ${ini}-${fim}/${VIDEO.length}` },
      body: VIDEO.subarray(ini, fim + 1),
    });
  });
  return { midia };
}
