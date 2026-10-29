import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarClientes } from "@/lib/crm/clientes";
import { hojeBr } from "@/lib/dinheiro";
import { listarVeiculos } from "@/lib/inventario/servidor";
import { avisoDeValidade, codigoOrcamento, nomeStatus } from "@/lib/orcamento/motor";
import { obterOrcamento } from "@/lib/orcamento/orcamentos";
import { lerLinkDoOrcamento } from "@/lib/orcamento/link";
import { totais } from "@/lib/orcamento/motor";
import { siteUrl } from "@/lib/site";
import { LinkDoOrcamentoPainel } from "@/components/link-publico";
import { carregarTabela } from "@/lib/orcamento/precos";
import { servicosAbertos } from "@/lib/orcamento/servicos";
import { lerEmpresa } from "@/lib/organizacao";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { pode as podeArea } from "@/lib/acessos";
import { BotaoAcao } from "@/components/acao";
import { Icone } from "@/components/icones";
import { EditorOrcamento } from "@/components/orcamento/editor";
import { SeloStatus } from "@/components/painel";
import { contratoAcao, novaVersaoAcao, removerOrcamentoAcao, statusAcao } from "../acoes";
import { contratosDe } from "@/lib/contrato/servidor";

export const metadata = { title: "Orçamento" };

/** O orçamento: editor (rascunho), status, versões, timbrado e aprovação. */
export default async function FichaOrcamento({ params }: PageProps<"/app/orcamentos/[id]">) {
  const { id } = await params;
  const sessao = await exigirAcessoNaPagina(`/app/orcamentos/${id}`);
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const hoje = hojeBr();
  if (!podeArea(sessao, "orcamentos")) notFound();
  const o = await obterOrcamento(ctx, id, hoje);
  if (!o) notFound();
  // Link do orçamento: gestão com a área (o banco confere: links_publicos). Contrato: área Contratos. Aprovar lança as
  // parcelas no Financeiro: precisa também dessa área.
  const gestao = podeRemover(sessao.papel);
  const dinheiro = gestao; // o painel do link
  const veContrato = podeArea(sessao, "contratos");
  const aprova = gestao && podeArea(sessao, "financeiro");
  const [tabela, clientes, empresa, veiculos, link] = await Promise.all([
    carregarTabela(ctx),
    listarClientes(ctx),
    lerEmpresa(ctx),
    listarVeiculos(ctx),
    dinheiro ? lerLinkDoOrcamento(ctx, o.id) : Promise.resolve(null),
  ]);
  const [contrato] = veContrato ? await contratosDe(ctx, { orcamentoId: o.id }) : [];
  const quando = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const escreve = podeEscrever(sessao.papel);
  const editavel = escreve && o.status === "rascunho";
  const validade = avisoDeValidade(o.validade, hoje, o.status);
  const base =
    empresa.lat != null && empresa.lon != null && empresa.cidade
      ? { rotulo: empresa.cidade, detalhe: [empresa.cidade, empresa.uf].filter(Boolean).join(" · "), lat: empresa.lat, lon: empresa.lon }
      : null;

  return (
    <div className="pagina pagina--larga">
      <Link className="voltar" href="/app/orcamentos">
        <Icone nome="voltar" size={16} /> Orçamentos
      </Link>
      <header className="perfil">
        <span className="codigo codigo--grande">{codigoOrcamento(o.numero, o.versao)}</span>
        <div className="perfil__miolo">
          <h1 className="atitle">
            <strong>{o.titulo}</strong>
          </h1>
          <p className="apoio">
            {o.clienteNome ?? "Sem cliente"}
            {o.projetoId && o.projetoCodigo ? (
              <>
                {" · "}
                <Link href={`/app/projetos/${o.projetoId}`}>{o.projetoCodigo}</Link>
              </>
            ) : null}
          </p>
          <div className="perfil__selos">
            <SeloStatus status={o.efetivo}>{nomeStatus(o.efetivo)}</SeloStatus>
            {validade ? (
              <span className="selo" data-status={validade.tom ?? "neutro"}>
                <i aria-hidden="true" />
                {validade.tom ? validade.rotulo : `vale ${validade.rotulo}`}
              </span>
            ) : null}
            {o.versoes.length > 1 ? (
              <nav className="versoes" aria-label="Versões">
                {o.versoes.map((v) => (
                  <Link key={v.id} href={`/app/orcamentos/${v.id}`} aria-current={v.id === o.id ? "page" : undefined} title={nomeStatus(v.status)}>
                    v{v.versao}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
        </div>
        <div className="acoes perfil__acoes">
          <Link className="glass-btn glass-btn--ink" href={`/app/orcamentos/${o.id}/timbrado`}>
            <Icone nome="documento" size={18} /> Timbrado
          </Link>
          {escreve && o.status === "rascunho" ? (
            <BotaoAcao acao={statusAcao} campos={{ id: o.id, para: "enviado" }} rotulo="Marcar enviado" icone="seta" />
          ) : null}
          {escreve && o.status === "enviado" ? (
            <>
              <BotaoAcao acao={statusAcao} campos={{ id: o.id, para: "rascunho" }} rotulo="Voltar para rascunho" icone="editar" />
              <BotaoAcao acao={statusAcao} campos={{ id: o.id, para: "recusado" }} rotulo="Recusado" confirmar="O cliente recusou?" />
            </>
          ) : null}
          {escreve && o.status === "recusado" ? <BotaoAcao acao={statusAcao} campos={{ id: o.id, para: "rascunho" }} rotulo="Reabrir" icone="editar" /> : null}
          {escreve && o.status !== "rascunho" ? <BotaoAcao acao={novaVersaoAcao} campos={{ id: o.id }} rotulo="Nova versão" icone="copiar" /> : null}
        </div>
      </header>

      {o.aceite ? (
        <p className="aviso-ok oc-aviso-equipe" role="status">
          <Icone nome="check" size={16} /> Aceito pelo cliente: {o.aceite.nome}, em {quando(o.aceite.em)}.
        </p>
      ) : null}
      {o.retorno && o.status === "enviado" ? (
        <section className="ficha oc-retorno-equipe" aria-label="Pedido de ajuste">
          <strong className="ficha__titulo">
            <Icone nome="balao" size={16} /> {o.retorno.nome} pediu ajuste · {quando(o.retorno.em)}
          </strong>
          <p className="observacoes">{o.retorno.texto}</p>
          <p className="sutil">Faça uma nova versão e mande o link de novo.</p>
        </section>
      ) : null}
      {o.pedidoId ? (
        <p className="sutil">
          Nasceu de um <Link href={`/app/pedidos/${o.pedidoId}`}>pedido pelo link</Link>.
        </p>
      ) : null}
      {dinheiro && (o.status === "rascunho" || o.status === "enviado" || link) ? (
        <LinkDoOrcamentoPainel
          orcamentoId={o.id}
          url={link?.token ? `${siteUrl()}/o/${link.token}` : null}
          total={totais(o.itens, o.descontoCents).total}
          hoje={hoje}
          status={o.status}
          parcelasAtuais={o.parcelas.length}
          expira={link?.expira ?? null}
          usos={link?.usos ?? 0}
        />
      ) : null}

      {gestao && veContrato ? (
        <section className="ficha ct-ficha" aria-label="Contrato">
          <span className="ct-ficha__icone" data-ligado={o.contrato || !!contrato || undefined} aria-hidden="true">
            <Icone nome="documento" size={20} />
          </span>
          <div className="ct-ficha__miolo">
            <strong className="ficha__titulo">Contrato</strong>
            <p className="sutil">
              {contrato
                ? `Aceito por ${contrato.nome} em ${quando(contrato.aceitoEm)}.`
                : o.contrato
                  ? "Vai junto com o link; o cliente aceita os dois."
                  : "O cliente aceita só a proposta."}
            </p>
          </div>
          <div className="acoes">
            {contrato ? (
              <Link className="glass-btn glass-btn--sm glass-btn--ink" href={`/app/contratos/${contrato.id}`}>
                <Icone nome="documento" size={16} /> Ver contrato
              </Link>
            ) : o.status === "rascunho" || o.status === "enviado" ? (
              <BotaoAcao
                acao={contratoAcao}
                campos={{ id: o.id, ligar: o.contrato ? "0" : "1" }}
                rotulo={o.contrato ? "Não enviar contrato" : "Enviar contrato junto"}
                icone={o.contrato ? "fechar" : "check"}
              />
            ) : null}
            <Link className="q-limpar" href="/app/ajustes/contrato">
              Modelo
            </Link>
          </div>
        </section>
      ) : null}

      <EditorOrcamento
        key={`${o.id}:${o.status}`}
        ficha={o}
        tabela={tabela}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
        editavel={editavel}
        podeAprovar={aprova && (o.status === "enviado" || o.status === "rascunho")}
        base={base}
        veiculos={veiculos}
        servicos={servicosAbertos()}
      />

      {podeRemover(sessao.papel) && o.status !== "aprovado" ? (
        <div className="rodape-acoes">
          <BotaoAcao acao={removerOrcamentoAcao} campos={{ id: o.id }} rotulo="Apagar esta versão" classe="q-perigo" icone="lixo" confirmar="Apagar de vez?" />
        </div>
      ) : null}
    </div>
  );
}
