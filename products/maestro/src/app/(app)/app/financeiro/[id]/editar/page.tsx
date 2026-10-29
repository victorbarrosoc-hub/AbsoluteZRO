import { notFound, redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { centavosParaCampo } from "@/lib/dinheiro";
import { camposLancamento } from "@/lib/financeiro/formularios";
import { obterLancamento, opcoesFinanceiro } from "@/lib/financeiro/servidor";
import { podeVerDinheiro } from "@/lib/papeis";
import { CabecaForm, Formulario } from "@/components/form";
import { salvarLancamentoAcao } from "../../acoes";

export const metadata = { title: "Editar lançamento" };

export default async function EditarLancamento({ params }: PageProps<"/app/financeiro/[id]/editar">) {
  const { id } = await params;
  const s = await exigirAcessoNaPagina(`/app/financeiro/${id}/editar`);
  if (!podeVerDinheiro(s.papel)) redirect("/app/financeiro");
  const ctx = { sub: s.sub, orgId: s.orgId };
  const [l, o] = await Promise.all([obterLancamento(ctx, id), opcoesFinanceiro(ctx)]);
  if (!l) notFound();
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar={`/app/financeiro/${id}`}
        titulo={
          <>
            Editar <strong>lançamento.</strong>
          </>
        }
      />
      <Formulario
        acao={salvarLancamentoAcao}
        campos={camposLancamento(o)}
        id={id}
        inicial={{
          descricao: l.descricao,
          tipo: l.tipo,
          categoria: l.categoria,
          valor: centavosParaCampo(l.valorCents),
          vencimento: l.vencimento,
          projeto: l.projetoId ?? "",
          cliente: l.clienteId ?? "",
          freela: l.freelaId ?? "",
          parcela: l.parcela ?? "",
          notas: l.notas ?? "",
        }}
        rotulo="Salvar"
        voltar={`/app/financeiro/${id}`}
      />
    </div>
  );
}
