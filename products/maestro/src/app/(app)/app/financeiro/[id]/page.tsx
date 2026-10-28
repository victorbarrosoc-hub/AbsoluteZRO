import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brl, dataBr, hojeBr } from "@/lib/dinheiro";
import { FORMAS, NOME_STATUS, nomeCategoria } from "@/lib/financeiro/contas";
import { CAMPOS_BAIXA } from "@/lib/financeiro/formularios";
import { obterLancamento } from "@/lib/financeiro/servidor";
import { podeVerDinheiro } from "@/lib/papeis";
import { BotaoAcao } from "@/components/acao";
import { Secao } from "@/components/crm";
import { Formulario } from "@/components/form";
import { Icone } from "@/components/icones";
import { Medidor, SeloStatus } from "@/components/painel";
import { darBaixaAcao, desfazerBaixaAcao, removerLancamentoAcao } from "../acoes";

export const metadata = { title: "Lançamento" };

/** Um lançamento: valor, quanto já foi baixado (total ou parcial), as baixas e dar baixa. */
export default async function FichaLancamento({ params }: PageProps<"/app/financeiro/[id]">) {
  const { id } = await params;
  const s = await exigirAcessoNaPagina(`/app/financeiro/${id}`);
  if (!podeVerDinheiro(s.papel)) redirect("/app/financeiro");
  const hoje = hojeBr();
  const l = await obterLancamento({ sub: s.sub, orgId: s.orgId }, id, hoje);
  if (!l) notFound();
  return (
    <div className="pagina pagina--estreita">
      <Link className="voltar" href={`/app/financeiro?mes=${l.vencimento.slice(0, 7)}`}>
        <Icone nome="voltar" size={16} /> Financeiro
      </Link>
      <header className="perfil">
        <div className="perfil__miolo">
          <span className="sutil">
            {l.tipo === "entrada" ? "Entrada" : "Saída"} · {nomeCategoria(l.categoria)}
          </span>
          <h1 className="atitle">
            <strong>{brl(l.valorCents)}</strong>
          </h1>
          <p className="apoio">{l.descricao}</p>
          <div className="perfil__selos">
            <SeloStatus status={l.status}>{NOME_STATUS[l.status]}</SeloStatus>
            <span className="selo">vence {dataBr(l.vencimento)}</span>
          </div>
        </div>
        <div className="acoes perfil__acoes">
          <Link className="glass-btn glass-btn--icone" href={`/app/financeiro/${l.id}/editar`} aria-label="Editar" title="Editar">
            <Icone nome="editar" size={18} />
          </Link>
        </div>
      </header>

      <Secao titulo={l.tipo === "entrada" ? "Recebido" : "Pago"}>
        <div className="progresso">
          <Medidor valor={l.pagoCents / l.valorCents} rotulo={`${brl(l.pagoCents)} de ${brl(l.valorCents)}`} tom={l.status === "atrasado" ? "aviso" : "ok"} />
          <span>
            {brl(l.pagoCents)} de {brl(l.valorCents)}
            {l.aberto > 0 ? <span className="sutil"> · falta {brl(l.aberto)}</span> : null}
          </span>
        </div>
        {l.baixas.length ? (
          <ul className="linhas">
            {l.baixas.map((b) => (
              <li key={b.id} className="linha">
                <span className="linha__coluna">{dataBr(b.data)}</span>
                <span className="linha__titulo">{brl(b.valorCents)}</span>
                <span className="linha__meta">{FORMAS.find((f) => f.k === b.forma)?.nome ?? ""}</span>
                <BotaoAcao acao={desfazerBaixaAcao} campos={{ id: b.id }} rotulo="Desfazer" classe="q-limpar" confirmar="Desfazer a baixa?" />
              </li>
            ))}
          </ul>
        ) : null}
        {l.aberto > 0 ? (
          <Formulario
            acao={darBaixaAcao}
            campos={CAMPOS_BAIXA}
            compacto
            ocultos={{ lancamento: l.id }}
            inicial={{ data: hoje, forma: "pix" }}
            rotulo={l.tipo === "entrada" ? "Registrar recebimento" : "Registrar pagamento"}
          />
        ) : null}
      </Secao>

      <Secao titulo="Ligado a">
        <dl className="dados">
          <dt>Projeto</dt>
          <dd>{l.projetoId ? <Link href={`/app/projetos/${l.projetoId}`}>{l.projetoCodigo}</Link> : "—"}</dd>
          <dt>Cliente</dt>
          <dd>{l.clienteId ? <Link href={`/app/clientes/${l.clienteId}`}>{l.cliente}</Link> : "—"}</dd>
          <dt>Freela</dt>
          <dd>{l.freelaId ? <Link href={`/app/freelas/${l.freelaId}`}>{l.freela}</Link> : "—"}</dd>
          {l.parcela ? (
            <>
              <dt>Parcela</dt>
              <dd>{l.parcela}</dd>
            </>
          ) : null}
          {l.escalaId ? (
            <>
              <dt>Origem</dt>
              <dd>Escala do projeto (acompanha a escala enquanto nada foi pago)</dd>
            </>
          ) : l.recorrenciaId ? (
            <>
              <dt>Origem</dt>
              <dd>
                <Link href="/app/financeiro/recorrencias">Recorrência</Link>
              </dd>
            </>
          ) : null}
        </dl>
        {l.notas ? <p className="observacoes">{l.notas}</p> : null}
      </Secao>
      {!l.escalaId ? (
        <div className="rodape-acoes">
          <BotaoAcao
            acao={removerLancamentoAcao}
            campos={{ id: l.id }}
            rotulo="Apagar lançamento"
            classe="q-perigo"
            icone="lixo"
            confirmar="Apagar com as baixas?"
          />
        </div>
      ) : null}
    </div>
  );
}
