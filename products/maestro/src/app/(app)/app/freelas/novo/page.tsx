import { redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { CAMPOS_FREELA } from "@/lib/freelas/formularios";
import { podeEscrever } from "@/lib/papeis";
import { pode as podeArea } from "@/lib/acessos";
import { CabecaForm, Formulario } from "@/components/form";
import { salvarFreelaAcao } from "../acoes";

export const metadata = { title: "Novo freela" };

export default async function NovoFreela() {
  const s = await exigirAcessoNaPagina("/app/freelas/novo");
  if (!podeEscrever(s.papel)) redirect("/app/freelas");
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar="/app/freelas"
        titulo={
          <>
            Novo <strong>freela.</strong>
          </>
        }
      >
        <p className="apoio">CPF e PIX entram depois, na ficha.</p>
      </CabecaForm>
      <Formulario
        acao={salvarFreelaAcao}
        campos={CAMPOS_FREELA.filter((c) => c.nome !== "valores" || podeArea(s, "diarias"))}
        inicial={{ ativo: "sim" }}
        rotulo="Cadastrar"
        voltar="/app/freelas"
      />
    </div>
  );
}
