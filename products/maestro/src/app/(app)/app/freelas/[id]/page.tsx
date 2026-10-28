import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brl, dataCurta, hojeBr } from "@/lib/dinheiro";
import { NOME_STATUS } from "@/lib/financeiro/contas";
import { CAMPOS_PAGAMENTO } from "@/lib/freelas/formularios";
import { nomeFuncao, nomeUnidadeValor, textoWhatsapp } from "@/lib/freelas/funcoes";
import { formatarDocumento, TIPOS_PIX } from "@/lib/freelas/pagamento";
import { obterFreela } from "@/lib/freelas/servidor";
import { listarEquipDoFreela } from "@/lib/freelas/equipamentos";
import { KitDoFreela } from "@/components/kit-freela";
import { nomeCategoriaEquip } from "@/lib/inventario/nomes";
import { podeEscrever } from "@/lib/papeis";
import { Monograma, Secao } from "@/components/crm";
import { Formulario } from "@/components/form";
import { Icone } from "@/components/icones";
import { SeloStatus } from "@/components/painel";
import { salvarPagamentoAcao } from "../acoes";

export const metadata = { title: "Freela" };

/** A ficha do freela: funções e valores, escalas com o status do pagamento, equipamento e (gestão) dados de pagamento. */
export default async function FichaFreela({ params }: PageProps<"/app/freelas/[id]">) {
  const { id } = await params;
  const s = await exigirAcessoNaPagina(`/app/freelas/${id}`);
  const hoje = hojeBr();
  const [f, kit] = await Promise.all([obterFreela({ sub: s.sub, orgId: s.orgId }, s.papel, id, hoje), listarEquipDoFreela({ sub: s.sub, orgId: s.orgId }, id)]);
  if (!f) notFound();
  const wpp = f.whatsapp ? `https://wa.me/${f.whatsapp}?text=${encodeURIComponent(textoWhatsapp(f.whatsappMsg, f.nome, s.orgNome))}` : null;
  const aPagar = f.escalas.filter((e) => e.pagamento && e.pagamento.status !== "pago").reduce((t, e) => t + e.valorCents - (e.pagamento?.pagoCents ?? 0), 0);
  return (
    <div className="pagina">
      <Link className="voltar" href="/app/freelas">
        <Icone nome="voltar" size={16} /> Freelas
      </Link>
      <header className="perfil">
        <Monograma nome={f.nome} grande />
        <div className="perfil__miolo">
          <h1 className="atitle">
            <strong>{f.nome}</strong>
          </h1>
          <p className="apoio">{[f.funcoes.map(nomeFuncao).join(", "), f.cidade].filter(Boolean).join(" · ")}</p>
          <div className="perfil__selos">
            {!f.ativo ? <span className="selo">Inativo</span> : null}
            {f.nichos.map((n) => (
              <span key={n} className="chip">
                {n}
              </span>
            ))}
          </div>
        </div>
        <div className="acoes perfil__acoes">
          {wpp ? (
            <a className="glass-btn glass-btn--ink" href={wpp} target="_blank" rel="noreferrer">
              <Icone nome="whatsapp" size={18} /> WhatsApp
            </a>
          ) : null}
          {podeEscrever(s.papel) ? (
            <Link className="glass-btn glass-btn--icone" href={`/app/freelas/${f.id}/editar`} aria-label="Editar" title="Editar">
              <Icone nome="editar" size={18} />
            </Link>
          ) : null}
        </div>
      </header>

      <div className="painel">
        <Secao titulo="Escalas">
          {f.escalas.length ? (
            <ul className="linhas">
              {f.escalas.map((e) => (
                <li key={e.id} className="linha">
                  <span className="linha__coluna">
                    {dataCurta(e.inicio)}
                    {e.fim !== e.inicio ? `–${dataCurta(e.fim)}` : ""}
                  </span>
                  <span className="linha__titulo">
                    {e.projetoId ? <Link href={`/app/projetos/${e.projetoId}`}>{e.evento ?? e.projeto}</Link> : (e.evento ?? "Sem projeto")}
                    <span className="sutil"> · {nomeFuncao(e.funcao)}</span>
                  </span>
                  <span className="linha__meta num">{brl(e.valorCents)}</span>
                  {e.pagamento ? <SeloStatus status={e.pagamento.status}>{NOME_STATUS[e.pagamento.status]}</SeloStatus> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="nada">Ainda não foi escalado. Escale pela agenda ou pelo projeto.</p>
          )}
          {f.dadosPagamento !== undefined && aPagar > 0 ? <p className="sutil">A pagar: {brl(aPagar)}</p> : null}
        </Secao>
        <Secao titulo="Equipamento próprio">
          <KitDoFreela freelaId={f.id} itens={kit} podeMudar={podeEscrever(s.papel)} />
        </Secao>
        <div className="painel__lado">
          <Secao titulo="Valores">
            {f.valores.length ? (
              <dl className="dados">
                {f.valores.map((v) => (
                  <div key={`${v.funcao}${v.unidade}`} className="dados__par">
                    <dt>{nomeFuncao(v.funcao)}</dt>
                    <dd className="num">
                      {brl(v.valorCents)} <span className="sutil">{nomeUnidadeValor(v.unidade)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="nada">Sem valores.</p>
            )}
          </Secao>
          <Secao titulo="No inventário">
            {f.equipamentos.length ? (
              <ul className="linhas">
                {f.equipamentos.map((e) => (
                  <li key={e.id}>
                    <Link className="linha" href={`/app/inventario/${e.id}`}>
                      <span className="linha__coluna">{nomeCategoriaEquip(e.categoria)}</span>
                      <span className="linha__titulo">{e.nome}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nada">Nada dele no inventário da produtora.</p>
            )}
          </Secao>
          {f.dadosPagamento !== undefined ? (
            <Secao titulo="Dados de pagamento">
              {f.dadosPagamento?.ilegivel ? <p className="erro">Dados ilegíveis (a chave mudou). Cadastre de novo.</p> : null}
              {f.dadosPagamento ? (
                <dl className="dados">
                  <dt>CPF/CNPJ</dt>
                  <dd>{f.dadosPagamento.documento ? formatarDocumento(f.dadosPagamento.documento) : "—"}</dd>
                  <dt>PIX</dt>
                  <dd>{f.dadosPagamento.pix ? `${TIPOS_PIX.find((t) => t.k === f.dadosPagamento?.pixTipo)?.nome ?? ""} · ${f.dadosPagamento.pix}` : "—"}</dd>
                  <dt>Titular</dt>
                  <dd>{f.dadosPagamento.titular ?? "—"}</dd>
                </dl>
              ) : null}
              <details className="secao--abrir">
                <summary>
                  <Icone nome="editar" size={15} /> {f.dadosPagamento ? "Trocar" : "Cadastrar"}
                </summary>
                <Formulario
                  acao={salvarPagamentoAcao}
                  campos={CAMPOS_PAGAMENTO}
                  compacto
                  ocultos={{ freela: f.id }}
                  inicial={{
                    documento: f.dadosPagamento?.documento ?? "",
                    titular: f.dadosPagamento?.titular ?? f.nome,
                    pixTipo: f.dadosPagamento?.pixTipo ?? "",
                    pix: f.dadosPagamento?.pix ?? "",
                  }}
                  rotulo="Guardar"
                />
              </details>
              <p className="sutil">Só administração e gestão veem. Guardados cifrados.</p>
            </Secao>
          ) : null}
          {f.notas ? (
            <Secao titulo="Notas">
              <p className="observacoes">{f.notas}</p>
            </Secao>
          ) : null}
        </div>
      </div>
    </div>
  );
}
