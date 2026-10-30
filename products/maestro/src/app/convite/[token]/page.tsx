import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ipDe } from "@/lib/http";
import { abrirConvite } from "@/lib/freelas/convite-servidor";
import { caminhoDoConvite } from "@/lib/freelas/convite";
import { identidadeDosCookies } from "@/lib/zro/identidade";
import { emissor } from "@/lib/zro/config";
import { ROTAS } from "@/lib/site";
import { CabecaMarca, estiloDaMarca, NeutroPublico, RodapeMaestro } from "@/components/publico/comum";
import { ConviteDoFreela } from "@/components/publico/convite";
import "../../revisao.css";
import "../../convite.css";

export const metadata: Metadata = {
  title: { absolute: "Convite" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "strict-origin",
};

/**
 * O convite da produtora para o freela entrar no banco de freelas com a conta Absolute ZRO (drizzle/0036). Sem sessão
 * no Maestro: quem chega cria a conta (ou entra) no login único e volta aqui só com a identidade. Link desconhecido,
 * revogado ou vencido = a mesma tela neutra; aceito por outra conta também.
 */
export default async function PaginaConvite({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const r = await abrirConvite(token, ipDe(await headers())).catch(() => ({ estado: "morto" as const }));
  if (r.estado !== "ok") return <NeutroPublico limite={r.estado === "limite"} />;
  const jar = await cookies();
  const quem = await identidadeDosCookies((nome) => jar.get(nome)?.value).catch(() => null);
  const c = r.convite;
  if (c.estado === "aceito" && quem?.sub !== c.aceitoSub) return <NeutroPublico />;
  const volta = caminhoDoConvite(token);
  const entrar = (modo?: "criar") => `/api/zro/entrar?${new URLSearchParams({ ...(modo ? { modo } : {}), volta })}`;
  return (
    <main className="cl cl--neutro cv-pagina" id="conteudo" style={estiloDaMarca(c.marca.cor)}>
      <ConviteDoFreela
        token={token}
        nome={c.nome}
        produtora={c.marca.nome}
        marca={<CabecaMarca marca={c.marca} />}
        quem={quem ? { arroba: quem.arroba, nome: quem.nome, foto: quem.foto } : null}
        aceito={c.estado === "aceito"}
        criarConta={entrar("criar")}
        entrar={entrar()}
        perfil={`${emissor()}/perfil/profissional`}
        trabalhos={`/api/zro/entrar?${new URLSearchParams({ volta: ROTAS.trabalhos })}`}
      />
      <RodapeMaestro propria={!!c.marca.propria} />
    </main>
  );
}
