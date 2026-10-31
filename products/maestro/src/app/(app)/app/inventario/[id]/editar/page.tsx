import { notFound, redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { centavosParaCampo, hojeBr } from "@/lib/dinheiro";
import { listarFreelas } from "@/lib/freelas/servidor";
import { camposEquipamento } from "@/lib/inventario/formularios";
import { obterEquipamento } from "@/lib/inventario/servidor";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { CabecaForm, Formulario, Remover } from "@/components/form";
import { removerEquipamentoAcao, salvarEquipamentoAcao } from "../../acoes";

export const metadata = { title: "Editar item" };

export default async function EditarEquipamento({ params }: PageProps<"/app/inventario/[id]/editar">) {
  const { id } = await params;
  const s = await exigirAcessoNaPagina(`/app/inventario/${id}/editar`);
  if (!podeEscrever(s.papel)) redirect(`/app/inventario/${id}`);
  const ctx = { sub: s.sub, orgId: s.orgId };
  const [e, freelas] = await Promise.all([obterEquipamento(ctx, id, hojeBr()), listarFreelas(ctx, { inativos: true })]);
  if (!e) notFound();
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar={`/app/inventario/${id}`}
        titulo={
          <>
            Editar <strong>{e.nome}.</strong>
          </>
        }
      />
      <Formulario
        acao={salvarEquipamentoAcao}
        campos={camposEquipamento(freelas, e.veValor)}
        id={id}
        inicial={{
          nome: e.nome,
          categoria: e.categoria,
          estado: e.estado,
          marca: e.marca ?? "",
          modelo: e.modelo ?? "",
          serie: e.serie ?? "",
          patrimonio: e.patrimonio ?? "",
          compraEm: e.compraEm ?? "",
          valor: centavosParaCampo(e.valorCents),
          dono: e.dono,
          freela: e.freelaId ?? "",
          local: e.local ?? "",
          kmL: e.kmL != null ? String(e.kmL).replace(".", ",") : "",
          notas: e.notas ?? "",
        }}
        rotulo="Salvar"
        voltar={`/app/inventario/${id}`}
      />
      {podeRemover(s.papel) ? (
        <Remover acao={removerEquipamentoAcao} id={id} rotulo="Remover do inventário" pergunta="Remover o item e as reservas dele?" />
      ) : null}
    </div>
  );
}
