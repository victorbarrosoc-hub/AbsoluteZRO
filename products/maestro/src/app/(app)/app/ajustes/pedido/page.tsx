import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { pode as podeArea } from "@/lib/acessos";
import { podeRemover } from "@/lib/papeis";
import { lerLinkDePedido } from "@/lib/pedidos/equipe";
import { lerConfig } from "@/lib/pedidos/formulario";
import { siteUrl } from "@/lib/site";
import { CabecaForm } from "@/components/form";
import { LinkDePedido } from "@/components/link-publico";

export const metadata = { title: "Link de pedido" };

/**
 * Ajustes → Link de pedido (plano v2 §6.2): o formulário público que a produtora compartilha. Um link ativo por
 * organização; trocar e revogar matam o anterior na hora. Só administração e gestão.
 */
export default async function PaginaLinkDePedido() {
  const s = await exigirAcessoNaPagina("/app/ajustes/pedido");
  const pode = podeArea(s, "orcamentos") && podeRemover(s.papel);
  const l = pode ? await lerLinkDePedido({ sub: s.sub, orgId: s.orgId }) : null;
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar="/app/ajustes"
        titulo={
          <>
            Link de <strong>pedido.</strong>
          </>
        }
      >
        <p className="apoio">{pode ? "O cliente pede o orçamento sozinho, com a sua marca." : "Só a gestão mexe no link."}</p>
      </CabecaForm>
      {pode ? <LinkDePedido url={l?.token ? `${siteUrl()}/p/${l.token}` : null} config={l?.config ?? lerConfig({})} usos={l?.usos ?? 0} /> : null}
    </div>
  );
}
