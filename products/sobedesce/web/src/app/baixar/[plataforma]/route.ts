import { NextResponse, type NextRequest } from "next/server";
import { ehPlataforma, enderecoDoArquivo, esquecerCache, instalador } from "@/lib/release";
import { CENTRAL_ZRO } from "@/lib/site";

/**
 * /baixar/mac e /baixar/windows: o app de computador se instala só pela central Absolute ZRO (titular, 01/11/2026), então
 * quem chega aqui (o navegador, o link antigo do "Nova versão") vai para https://absolutezro.com/baixar.
 * `?build=N` (o "Atualizar" dos apps já instalados, de antes da central): o instalador exatamente daquele build, do
 * Release de teste do GitHub (src/lib/release.ts), o mesmo do SHA-256 que eles conferem. Build que já saiu do Release →
 * 404 (eles perguntam a versão de novo). Nada passa pela Vercel.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/baixar/[plataforma]">) {
  const { plataforma } = await ctx.params;
  const pedido = new URL(req.url).searchParams.get("build");
  const build = pedido && /^\d{1,9}$/.test(pedido) ? Number(pedido) : null;
  if (build == null) return NextResponse.redirect(CENTRAL_ZRO, 307);
  const voltar = new URL("/?baixar=indisponivel#baixar", req.url);
  if (!ehPlataforma(plataforma)) return NextResponse.redirect(new URL("/#baixar", req.url));
  try {
    // O app e os instaladores de uma linha (?build=N) conferem o SHA-256: nunca recebem a página do site no lugar do
    // arquivo. Recebem 404 e perguntam a versão de novo.
    const sumiu = () => (build != null ? new NextResponse("Instalador deste build não está mais no ar.", { status: 404, headers: { "cache-control": "no-store" } }) : NextResponse.redirect(voltar));
    let asset = await instalador(plataforma, build);
    if (!asset) return sumiu();
    let destino = await enderecoDoArquivo(asset);
    if (!destino) {
      // A lista guardada pode ter o id de um arquivo que o Release já trocou: relê uma vez.
      esquecerCache();
      asset = await instalador(plataforma, build);
      destino = asset ? await enderecoDoArquivo(asset) : null;
    }
    if (!destino) return sumiu();
    const r = NextResponse.redirect(destino);
    r.headers.set("cache-control", "no-store");
    return r;
  } catch (e) {
    console.error("[baixar]", plataforma, e instanceof Error ? e.message : "erro");
    return NextResponse.redirect(voltar);
  }
}
