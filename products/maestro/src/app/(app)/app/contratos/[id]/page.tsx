import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { lerContrato } from "@/lib/contrato/servidor";
import { BotaoImprimir } from "@/components/acao";
import { FolhaContrato } from "@/components/contrato/folha";
import { Icone } from "@/components/icones";

export const metadata: Metadata = { title: "Contrato" };

/**
 * O contrato aceito pelo cliente (registro imutável, drizzle/0020): o texto gravado no aceite, o registro e a
 * conferência do hash feita agora. Só administração e gestão (o RLS esconde do resto: 404). PDF pelo navegador.
 */
export default async function PaginaContratoAceito({ params }: PageProps<"/app/contratos/[id]">) {
  const { id } = await params;
  const sessao = await exigirAcessoNaPagina(`/app/contratos/${id}`);
  const c = await lerContrato({ sub: sessao.sub, orgId: sessao.orgId }, id);
  if (!c) notFound();
  return (
    <div className="pagina pagina--larga">
      <div className="timbrado-barra">
        <Link className="voltar" href={`/app/orcamentos/${c.orcamentoId}`}>
          <Icone nome="voltar" size={16} /> Orçamento {c.orcamentoCodigo}
        </Link>
        <div className="acoes">
          {c.projetoId && c.projetoCodigo ? (
            <Link className="glass-btn glass-btn--sm" href={`/app/projetos/${c.projetoId}`}>
              <Icone nome="projetos" size={16} /> {c.projetoCodigo}
            </Link>
          ) : null}
          {c.clienteId && c.clienteNome ? (
            <Link className="glass-btn glass-btn--sm" href={`/app/clientes/${c.clienteId}`}>
              <Icone nome="clientes" size={16} /> {c.clienteNome}
            </Link>
          ) : null}
          <span className="selo" data-status={c.conferido ? "aprovado" : "atrasado"}>
            <i aria-hidden="true" />
            {c.conferido ? "Aceito · conferido" : "Hash não confere"}
          </span>
          <BotaoImprimir rotulo="Baixar PDF" />
        </div>
      </div>
      <FolhaContrato
        html={c.html}
        registro={{
          nome: c.nome,
          documento: c.documento,
          endereco: c.endereco,
          em: c.aceitoEm,
          hash: c.hash,
          conferido: c.conferido,
          navegador: c.navegador,
          ipRegistrado: c.ipRegistrado,
        }}
      />
    </div>
  );
}
