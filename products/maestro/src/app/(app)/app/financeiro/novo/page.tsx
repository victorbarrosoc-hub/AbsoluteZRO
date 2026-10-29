import { redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { hojeBr } from "@/lib/dinheiro";
import { camposLancamento } from "@/lib/financeiro/formularios";
import { opcoesFinanceiro } from "@/lib/financeiro/servidor";
import { podeVerDinheiro } from "@/lib/papeis";
import { CabecaForm, Formulario } from "@/components/form";
import { salvarLancamentoAcao } from "../acoes";

export const metadata = { title: "Novo lançamento" };

export default async function NovoLancamento({ searchParams }: PageProps<"/app/financeiro/novo">) {
  const s = await exigirAcessoNaPagina("/app/financeiro/novo");
  if (!podeVerDinheiro(s.papel)) redirect("/app/financeiro");
  const sp = await searchParams;
  const o = await opcoesFinanceiro({ sub: s.sub, orgId: s.orgId });
  const tipo = sp.tipo === "entrada" ? "entrada" : "saida";
  const projeto = typeof sp.projeto === "string" && o.projetos.some((p) => p.id === sp.projeto) ? sp.projeto : "";
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar="/app/financeiro"
        titulo={
          <>
            Novo <strong>lançamento.</strong>
          </>
        }
      />
      <Formulario
        acao={salvarLancamentoAcao}
        campos={camposLancamento(o)}
        inicial={{ tipo, categoria: tipo === "entrada" ? "cliente" : "outra-despesa", vencimento: hojeBr(), projeto }}
        rotulo="Lançar"
        voltar="/app/financeiro"
      />
    </div>
  );
}
