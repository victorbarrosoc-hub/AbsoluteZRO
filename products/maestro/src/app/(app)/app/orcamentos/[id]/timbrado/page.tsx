import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { nomeStatus } from "@/lib/orcamento/motor";
import { pode as podeArea } from "@/lib/acessos";
import { documentoDoOrcamento } from "@/lib/orcamento/orcamentos";
import { BotaoImprimir } from "@/components/acao";
import { Icone } from "@/components/icones";
import { Timbrado } from "@/components/orcamento/timbrado";
import { SeloStatus } from "@/components/painel";

export const metadata: Metadata = { title: "Timbrado" };

/**
 * O timbrado: o que o cliente recebe, sem custo nem margem. O PDF sai pelo navegador ("Imprimir ou salvar PDF"),
 * com o CSS de impressão em A4 (sem dependência de gerador de PDF no servidor).
 */
export default async function PaginaTimbrado({ params }: PageProps<"/app/orcamentos/[id]/timbrado">) {
  const { id } = await params;
  const sessao = await exigirAcessoNaPagina(`/app/orcamentos/${id}/timbrado`);
  if (!podeArea(sessao, "orcamentos")) notFound();
  const doc = await documentoDoOrcamento({ sub: sessao.sub, orgId: sessao.orgId }, id);
  if (!doc) notFound();
  return (
    <div className="pagina pagina--larga">
      <div className="timbrado-barra">
        <Link className="voltar" href={`/app/orcamentos/${id}`}>
          <Icone nome="voltar" size={16} /> Orçamento {doc.codigo}
        </Link>
        <div className="acoes">
          <SeloStatus status={doc.status}>{nomeStatus(doc.status)}</SeloStatus>
          <BotaoImprimir />
        </div>
      </div>
      <Timbrado doc={doc} />
    </div>
  );
}
