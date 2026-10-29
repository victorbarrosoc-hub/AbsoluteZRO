import { notFound, redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { obterCliente } from "@/lib/crm/clientes";
import { CAMPOS_CLIENTE } from "@/lib/crm/formularios";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { CabecaForm, Formulario, Remover } from "@/components/form";
import { removerClienteAcao, salvarCliente } from "../../acoes";

export const metadata = { title: "Editar cliente" };

export default async function EditarCliente({ params }: PageProps<"/app/clientes/[id]/editar">) {
  const { id } = await params;
  const sessao = await exigirAcessoNaPagina(`/app/clientes/${id}/editar`);
  if (!podeEscrever(sessao.papel)) redirect(`/app/clientes/${id}`);
  const c = await obterCliente({ sub: sessao.sub, orgId: sessao.orgId }, id);
  if (!c) notFound();
  const inicial = {
    nome: c.nome,
    status: c.status,
    empresa: c.empresa ?? "",
    contato: c.contato ?? "",
    whatsapp: c.whatsapp ? `+${c.whatsapp}` : "",
    email: c.email ?? "",
    observacoes: c.observacoes ?? "",
  };
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm voltar={`/app/clientes/${id}`} titulo={<strong>{c.nome}</strong>} />
      <Formulario acao={salvarCliente} campos={CAMPOS_CLIENTE} inicial={inicial} id={id} rotulo="Salvar" voltar={`/app/clientes/${id}`} />
      {podeRemover(sessao.papel) ? (
        <Remover acao={removerClienteAcao} id={id} rotulo="Remover cliente" pergunta="Remover da lista? Os cards ficam no Quadro." />
      ) : null}
    </div>
  );
}
