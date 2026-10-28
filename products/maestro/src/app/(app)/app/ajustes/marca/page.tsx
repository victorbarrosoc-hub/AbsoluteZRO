import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { lerMarca } from "@/lib/marca/servidor";
import { CabecaForm } from "@/components/form";
import { EditorMarca } from "@/components/marca-editor";

export const metadata = { title: "Marca" };

/**
 * Ajustes → Marca (plano v2 §8): logo, cor de destaque, nome, CNPJ, contato, endereço e assinatura. Sai no timbrado e nas
 * páginas que o cliente abre (aprovação, pedido e orçamento), em todos os planos. Só a administração muda.
 */
export default async function PaginaMarca() {
  const s = await exigirAcessoNaPagina("/app/ajustes/marca");
  const m = await lerMarca({ sub: s.sub, orgId: s.orgId });
  return (
    <div className="pagina">
      <CabecaForm
        voltar="/app/ajustes"
        titulo={
          <>
            Sua <strong>marca.</strong>
          </>
        }
      >
        <p className="apoio">{s.papel === "admin" ? "No timbrado e em tudo o que o cliente abre." : "Só a administração muda a marca."}</p>
      </CabecaForm>
      <EditorMarca marca={m} nomeOrg={s.orgNome} podeMudar={s.papel === "admin"} />
    </div>
  );
}
