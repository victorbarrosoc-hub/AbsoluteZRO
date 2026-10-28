import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { PainelDaZ } from "@/components/z-painel";

export const metadata = { title: "Z" };

/** A Z, a IA do ecossistema, na primeira aba (como nas outras plataformas). */
export default async function Z() {
  const sessao = await exigirAcessoNaPagina("/app/z");
  return (
    <div className="pagina">
      <PainelDaZ nome={sessao.nome ? sessao.nome.split(" ")[0] : null} />
    </div>
  );
}
