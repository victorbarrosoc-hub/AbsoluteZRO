import { redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { CAMPOS_CLIENTE } from "@/lib/crm/formularios";
import { podeEscrever } from "@/lib/papeis";
import { CabecaForm, Formulario } from "@/components/form";
import { salvarCliente } from "../acoes";

export const metadata = { title: "Novo cliente" };

export default async function NovoCliente() {
  const sessao = await exigirAcessoNaPagina("/app/clientes/novo");
  if (!podeEscrever(sessao.papel)) redirect("/app/clientes");
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar="/app/clientes"
        titulo={
          <>
            Novo <strong>cliente.</strong>
          </>
        }
      />
      <Formulario acao={salvarCliente} campos={CAMPOS_CLIENTE} inicial={{ status: "ativo" }} rotulo="Salvar cliente" voltar="/app/clientes" />
    </div>
  );
}
