import { redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarFreelas } from "@/lib/freelas/servidor";
import { camposEquipamento } from "@/lib/inventario/formularios";
import { podeEscrever } from "@/lib/papeis";
import { CabecaForm, Formulario } from "@/components/form";
import { salvarEquipamentoAcao } from "../acoes";

export const metadata = { title: "Novo item" };

export default async function NovoEquipamento() {
  const s = await exigirAcessoNaPagina("/app/inventario/novo");
  if (!podeEscrever(s.papel)) redirect("/app/inventario");
  const freelas = await listarFreelas({ sub: s.sub, orgId: s.orgId });
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar="/app/inventario"
        titulo={
          <>
            Novo <strong>item.</strong>
          </>
        }
      >
        <p className="apoio">A categoria sai do nome: &quot;Sony FX3&quot; vira câmera.</p>
      </CabecaForm>
      <Formulario
        acao={salvarEquipamentoAcao}
        campos={camposEquipamento(freelas)}
        inicial={{ categoria: "auto", estado: "disponivel", dono: "produtora", local: "Estúdio" }}
        rotulo="Adicionar"
        voltar="/app/inventario"
      />
    </div>
  );
}
