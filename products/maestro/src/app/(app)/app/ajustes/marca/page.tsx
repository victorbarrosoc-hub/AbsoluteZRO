import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { temMarcaPropria } from "@/lib/auth/acesso";
import { emissor } from "@/lib/zro/config";
import { Icone } from "@/components/icones";
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
      <section className="ficha wl-cartao" aria-label="Maestro com a sua marca" data-ligado={temMarcaPropria(s) || undefined}>
        <span className="wl-cartao__icone" aria-hidden="true">
          <Icone nome={temMarcaPropria(s) ? "check" : "marca"} size={20} />
        </span>
        <div className="wl-cartao__miolo">
          <strong className="ficha__titulo">Maestro com a sua marca</strong>
          <p className="sutil">
            {temMarcaPropria(s)
              ? "Ligado: o app inteiro com o seu logo e a sua cor."
              : "O app inteiro com o seu logo e a sua cor. Disponível no Pro ou como adicional."}
          </p>
        </div>
        {temMarcaPropria(s) ? null : (
          <a className="glass-btn glass-btn--sm" href={`${emissor()}/planos`} target="_blank" rel="noreferrer">
            <Icone nome="externo" size={15} /> Ver planos
          </a>
        )}
      </section>
      <EditorMarca marca={m} nomeOrg={s.orgNome} podeMudar={s.papel === "admin"} />
    </div>
  );
}
