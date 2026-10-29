import { redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarClientes } from "@/lib/crm/clientes";
import { listarProjetos } from "@/lib/crm/projetos";
import { carregarTabela } from "@/lib/orcamento/precos";
import { podeEscrever } from "@/lib/papeis";
import { CabecaForm, Formulario, type DefCampo } from "@/components/form";
import { criarOrcamentoAcao } from "../acoes";

export const metadata = { title: "Novo orçamento" };

/** Novo orçamento: título, cliente e, se quiser, um modelo da tabela de preços com as respostas (nicho, diárias…). */
export default async function NovoOrcamento({ searchParams }: PageProps<"/app/orcamentos/novo">) {
  const sessao = await exigirAcessoNaPagina("/app/orcamentos/novo");
  if (!podeEscrever(sessao.papel)) redirect("/app/orcamentos");
  const sp = await searchParams;
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [clientes, projetos, tabela] = await Promise.all([listarClientes(ctx), listarProjetos(ctx), carregarTabela(ctx)]);
  const modelos = tabela.modelos.filter((m) => m.ativo);
  const campos: DefCampo[] = [
    { nome: "titulo", rotulo: "Título", obrigatorio: true, autoFocus: true, max: 200, largo: true, placeholder: "Ex.: Filme institucional 2027" },
    {
      nome: "cliente",
      rotulo: "Cliente",
      tipo: "select",
      opcoes: [{ valor: "", nome: "Escolha depois" }, ...clientes.map((c) => ({ valor: c.id, nome: c.nome }))],
    },
    {
      nome: "projeto",
      rotulo: "Projeto",
      tipo: "select",
      opcoes: [{ valor: "", nome: "Novo projeto ao aprovar" }, ...projetos.map((p) => ({ valor: p.id, nome: `${p.codigo} · ${p.titulo}` }))],
    },
    {
      nome: "modelo",
      rotulo: "Começar de um modelo",
      tipo: "select",
      largo: true,
      opcoes: [{ valor: "", nome: "Em branco" }, ...modelos.map((m) => ({ valor: m.id, nome: m.nome }))],
      dica: modelos.length
        ? "As linhas saem da tabela de preços com as respostas abaixo. Você revisa tudo depois."
        : "Crie modelos em Ajustes → Tabela de preços.",
    },
    ...(modelos.length
      ? tabela.variaveis.map((v): DefCampo =>
          v.tipo === "escolha"
            ? {
                nome: `r_${v.chave}`,
                rotulo: v.rotulo,
                tipo: "select",
                opcoes: [{ valor: "", nome: "—" }, ...v.opcoes.map((o) => ({ valor: o.valor, nome: o.rotulo }))],
              }
            : { nome: `r_${v.chave}`, rotulo: v.rotulo, tipo: "numero", max: 6, placeholder: "0" },
        )
      : []),
  ];
  const cliente = typeof sp.cliente === "string" && clientes.some((c) => c.id === sp.cliente) ? sp.cliente : "";
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar="/app/orcamentos"
        titulo={
          <>
            Novo <strong>orçamento.</strong>
          </>
        }
      >
        <p className="apoio">O número sai sozinho, em sequência no ano.</p>
      </CabecaForm>
      <Formulario acao={criarOrcamentoAcao} campos={campos} inicial={{ cliente }} rotulo="Criar orçamento" voltar="/app/orcamentos" />
    </div>
  );
}
