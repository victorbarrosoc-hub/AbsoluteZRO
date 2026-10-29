import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { obterDocumento } from "@/lib/documentos/servidor";
import { lerEmpresa } from "@/lib/organizacao";
import { podeEscrever } from "@/lib/papeis";
import { BotaoAcao } from "@/components/acao";
import { EditorDocumento } from "@/components/documentos/editor";
import { Icone } from "@/components/icones";
import { removerDocumentoAcao } from "../acoes";
import { abrirNoEditorNovoAcao } from "@/app/(app)/app/criacao/acoes";
import { podeEditarCriacao } from "@/lib/criacao/permissoes";

export const metadata = { title: "Documento" };

/** Um documento do projeto: ordem do dia, checklist, roteiro ou decupagem, com impressão em A4. */
export default async function PaginaDocumento({ params }: PageProps<"/app/projetos/[id]/documentos/[docId]">) {
  const { id, docId } = await params;
  const s = await exigirAcessoNaPagina(`/app/projetos/${id}/documentos/${docId}`);
  const ctx = { sub: s.sub, orgId: s.orgId };
  const [d, empresa] = await Promise.all([obterDocumento(ctx, docId), lerEmpresa(ctx)]);
  if (!d || d.projetoId !== id) notFound();
  const escreve = podeEscrever(s.papel);
  return (
    <div className="pagina pagina--larga">
      <Link className="voltar" href={`/app/projetos/${id}`}>
        <Icone nome="voltar" size={16} /> {d.projetoCodigo} · {d.projeto}
      </Link>
      {(d.tipo === "roteiro" || d.tipo === "decupagem") && podeEditarCriacao(s.papel) ? (
        <div className="cr-antigo nao-imprime">
          <span>
            <b>Editor novo de roteiro.</b> Cenas, Literário, Técnico e Teleprompter. Este documento fica como está.
          </span>
          <BotaoAcao
            acao={abrirNoEditorNovoAcao}
            campos={{ documento: d.id, tipo: d.tipo }}
            rotulo="Abrir no editor novo"
            icone="criacao"
            classe="glass-btn glass-btn--ink"
          />
        </div>
      ) : null}
      <EditorDocumento
        key={d.atualizado}
        id={d.id}
        tipo={d.tipo}
        titulo={d.titulo}
        data={d.data}
        conteudo={d.conteudo}
        projeto={`${d.projetoCodigo} · ${d.projeto}`}
        editavel={escreve}
        marca={empresa.fantasia ?? empresa.nomeOrg}
      />
      {escreve ? (
        <div className="rodape-acoes">
          <BotaoAcao
            acao={removerDocumentoAcao}
            campos={{ id: d.id, projeto: id }}
            rotulo="Apagar documento"
            classe="q-perigo"
            icone="lixo"
            confirmar="Apagar de vez?"
          />
        </div>
      ) : null}
    </div>
  );
}
