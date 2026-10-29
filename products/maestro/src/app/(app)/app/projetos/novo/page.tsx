import { redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarClientes } from "@/lib/crm/clientes";
import { camposProjeto } from "@/lib/crm/formularios";
import { podeEscrever } from "@/lib/papeis";
import { CabecaForm, Formulario } from "@/components/form";
import { salvarProjeto } from "../acoes";

export const metadata = { title: "Novo projeto" };

export default async function NovoProjeto({ searchParams }: PageProps<"/app/projetos/novo">) {
  const sessao = await exigirAcessoNaPagina("/app/projetos/novo");
  if (!podeEscrever(sessao.papel)) redirect("/app/projetos");
  const sp = await searchParams;
  const clientes = await listarClientes({ sub: sessao.sub, orgId: sessao.orgId });
  const cliente = typeof sp.cliente === "string" && clientes.some((c) => c.id === sp.cliente) ? sp.cliente : "";
  const voltar = cliente ? `/app/clientes/${cliente}` : "/app/projetos";
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar={voltar}
        titulo={
          <>
            Novo <strong>projeto.</strong>
          </>
        }
      >
        <p className="apoio">O código sai sozinho, em sequência no ano.</p>
      </CabecaForm>
      <Formulario
        acao={salvarProjeto}
        campos={camposProjeto(clientes.map((c) => ({ id: c.id, nome: c.nome })))}
        inicial={{ cliente, status: "active" }}
        rotulo="Criar projeto"
        voltar={voltar}
      />
    </div>
  );
}
