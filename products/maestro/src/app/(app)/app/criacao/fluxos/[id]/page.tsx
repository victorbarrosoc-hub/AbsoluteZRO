import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { podeEditarCriacao, podeEnviarCriacao, podeVerCriacao } from "@/lib/criacao/permissoes";
import { obterFluxo } from "@/lib/criacao/fluxo/servidor";
import { listarRoteiros } from "@/lib/criacao/roteiro/servidor";
import { carregarCards } from "@/lib/quadro/servidor";
import { carregarColunas } from "@/lib/quadro/colunas-servidor";
import { nomeDaColuna } from "@/lib/quadro/colunas";
import { Fluxo } from "@/components/criacao/fluxo/fluxo";
import { Icone } from "@/components/icones";
import { EstadoVazio } from "@/components/vazio";
import "../../../../../fluxo.css";
import "../../../../../fluxo-exportar.css";

export const metadata = { title: "Fluxo" };

/**
 * Um fluxo (plano da Criação §6, fase F5): o canvas com tudo o que está vivo, lido como a pessoa (RLS), mais os
 * roteiros e cards que ela alcança para a folha "Roteiro · Card". A tela grava e pergunta sozinha (/api/criacao/fluxo).
 */
export default async function PaginaFluxo({ params }: PageProps<"/app/criacao/fluxos/[id]">) {
  const { id } = await params;
  const sessao = await exigirAcessoNaPagina(`/app/criacao/fluxos/${id}`);
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  if (!podeVerCriacao(sessao.papel)) return <SemFluxo />;
  const f = await obterFluxo(ctx, id);
  if (!f) return <SemFluxo />;
  const podeEditar = podeEditarCriacao(sessao.papel);
  // a folha "Roteiro · Card" só serve a quem edita
  const [roteiros, cards, colunas] = podeEditar
    ? await Promise.all([listarRoteiros(ctx), carregarCards(ctx).then((c) => c.cards), carregarColunas(ctx)])
    : [[], [], []];
  return (
    <Fluxo
      fluxo={f.fluxo}
      nos={f.nos}
      ligacoes={f.ligacoes}
      refs={f.refs}
      cursor={f.cursor}
      podeEditar={podeEditar}
      podeEnviar={podeEnviarCriacao(sessao.papel)}
      roteiros={roteiros.map((r) => ({ id: r.id, titulo: r.titulo, estado: r.estado, versao: r.versaoAtual, duracaoSeg: r.duracaoSeg }))}
      cards={cards.map((c) => ({ id: c.id, titulo: c.dados.tema ?? "", coluna: c.dados.coluna ? nomeDaColuna(colunas, c.dados.coluna) : null }))}
    />
  );
}

function SemFluxo() {
  return (
    <div className="pagina">
      <EstadoVazio icone="grade" titulo="Esse fluxo não existe mais" apoio="Ele pode ter sido apagado, ou é de outra produtora.">
        <Link className="glass-btn glass-btn--ink" href="/app/criacao/fluxos">
          <Icone nome="voltar" size={18} /> Fluxos
        </Link>
      </EstadoVazio>
    </div>
  );
}
