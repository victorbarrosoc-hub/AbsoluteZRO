import { redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { camposEvento } from "@/lib/agenda/formularios";
import { listarProjetos } from "@/lib/crm/projetos";
import { ehData, hojeBr } from "@/lib/dinheiro";
import { podeEscrever } from "@/lib/papeis";
import { CabecaForm, Formulario } from "@/components/form";
import { salvarEventoAcao } from "../acoes";

export const metadata = { title: "Novo na agenda" };

export default async function NovoEvento({ searchParams }: PageProps<"/app/agenda/novo">) {
  const s = await exigirAcessoNaPagina("/app/agenda/novo");
  if (!podeEscrever(s.papel)) redirect("/app/agenda");
  const sp = await searchParams;
  const projetos = await listarProjetos({ sub: s.sub, orgId: s.orgId });
  const projeto = typeof sp.projeto === "string" && projetos.some((p) => p.id === sp.projeto) ? sp.projeto : "";
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar="/app/agenda"
        titulo={
          <>
            Na <strong>agenda.</strong>
          </>
        }
      >
        <p className="apoio">Depois de salvar, escale a equipe e reserve o equipamento.</p>
      </CabecaForm>
      <Formulario
        acao={salvarEventoAcao}
        campos={camposEvento(projetos)}
        inicial={{ tipo: "diaria", data: ehData(sp.data) ? sp.data : hojeBr(), projeto }}
        rotulo="Salvar"
        voltar="/app/agenda"
      />
    </div>
  );
}
