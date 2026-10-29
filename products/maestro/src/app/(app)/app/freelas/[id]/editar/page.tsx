import { notFound, redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { hojeBr } from "@/lib/dinheiro";
import { CAMPOS_FREELA } from "@/lib/freelas/formularios";
import { nomeFuncao, nomeUnidadeValor } from "@/lib/freelas/funcoes";
import { obterFreela } from "@/lib/freelas/servidor";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { CabecaForm, Formulario, Remover } from "@/components/form";
import { removerFreelaAcao, salvarFreelaAcao } from "../../acoes";

export const metadata = { title: "Editar freela" };

export default async function EditarFreela({ params }: PageProps<"/app/freelas/[id]/editar">) {
  const { id } = await params;
  const s = await exigirAcessoNaPagina(`/app/freelas/${id}/editar`);
  if (!podeEscrever(s.papel)) redirect(`/app/freelas/${id}`);
  const f = await obterFreela({ sub: s.sub, orgId: s.orgId }, s.papel, id, hojeBr());
  if (!f) notFound();
  return (
    <div className="pagina pagina--estreita">
      <CabecaForm
        voltar={`/app/freelas/${id}`}
        titulo={
          <>
            Editar <strong>{f.nome}.</strong>
          </>
        }
      />
      <Formulario
        acao={salvarFreelaAcao}
        campos={CAMPOS_FREELA}
        id={id}
        inicial={{
          nome: f.nome,
          cidade: f.cidade ?? "",
          funcoes: f.funcoes.map(nomeFuncao).join(", "),
          valores: f.valores
            .map((v) => `${nomeFuncao(v.funcao)}: ${(v.valorCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${nomeUnidadeValor(v.unidade)}`)
            .join("\n"),
          nichos: f.nichos.join(", "),
          whatsapp: f.whatsapp ?? "",
          email: f.email ?? "",
          instagram: f.instagram ?? "",
          whatsappMsg: f.whatsappMsg ?? "",
          notas: f.notas ?? "",
          ativo: f.ativo ? "sim" : "nao",
        }}
        rotulo="Salvar"
        voltar={`/app/freelas/${id}`}
      />
      {podeRemover(s.papel) ? <Remover acao={removerFreelaAcao} id={id} rotulo="Remover do banco" pergunta="Remover o freela e as escalas dele?" /> : null}
    </div>
  );
}
