import { notFound, redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarClientes } from "@/lib/crm/clientes";
import { camposProjeto } from "@/lib/crm/formularios";
import { obterProjeto } from "@/lib/crm/projetos";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { CabecaForm, Formulario, Remover } from "@/components/form";
import { removerProjetoAcao, salvarProjeto } from "../../acoes";

export const metadata = { title: "Editar projeto" };

export default async function EditarProjeto({ params }: PageProps<"/app/projetos/[id]/editar">) {
  const { id } = await params;
  const sessao = await exigirAcessoNaPagina(`/app/projetos/${id}/editar`);
  if (!podeEscrever(sessao.papel)) redirect(`/app/projetos/${id}`);
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [p, clientes] = await Promise.all([obterProjeto(ctx, id), listarClientes(ctx)]);
  if (!p) notFound();
  const inicial = { titulo: p.titulo, cliente: p.cliente ?? "", status: p.status, inicio: p.inicio ?? "", prazo: p.prazo ?? "", briefing: p.briefing ?? "" };
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm voltar={`/app/projetos/${id}`} titulo={<strong>{p.titulo}</strong>}>
        <p className="apoio">{p.codigo}</p>
      </CabecaForm>
      <Formulario
        acao={salvarProjeto}
        campos={camposProjeto(clientes.map((c) => ({ id: c.id, nome: c.nome })))}
        inicial={inicial}
        id={id}
        rotulo="Salvar"
        voltar={`/app/projetos/${id}`}
      />
      {podeRemover(sessao.papel) ? (
        <Remover acao={removerProjetoAcao} id={id} rotulo="Remover projeto" pergunta="Remover da lista? Os cards ficam no Quadro." />
      ) : null}
    </div>
  );
}
