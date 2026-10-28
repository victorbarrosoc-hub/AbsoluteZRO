import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brl } from "@/lib/dinheiro";
import { GRUPOS, UNIDADES, nomeUnidade } from "@/lib/orcamento/motor";
import { carregarTabela, faixasEmTexto, opcoesEmTexto } from "@/lib/orcamento/precos";
import { podeVerDinheiro } from "@/lib/papeis";
import { BotaoAcao } from "@/components/acao";
import { Secao } from "@/components/crm";
import { Formulario, type DefCampo } from "@/components/form";
import { Icone } from "@/components/icones";
import { EditorModelo } from "@/components/orcamento/modelo-editor";
import { removerItemAcao, removerModeloAcao, removerVariavelAcao, salvarItemAcao, salvarVariavelAcao } from "./acoes";

export const metadata = { title: "Tabela de preços" };

const CAMPOS_ITEM: DefCampo[] = [
  { nome: "nome", rotulo: "Item", obrigatorio: true, max: 120, largo: true, placeholder: "Ex.: Diária de captação" },
  { nome: "grupo", rotulo: "Grupo", tipo: "select", opcoes: GRUPOS.map((g) => ({ valor: g.k, nome: g.nome })) },
  { nome: "unidade", rotulo: "Unidade", tipo: "select", opcoes: UNIDADES.map((u) => ({ valor: u.k, nome: u.nome })) },
  { nome: "preco", rotulo: "Preço", tipo: "dinheiro", obrigatorio: true, placeholder: "0,00" },
  { nome: "custo", rotulo: "Custo (interno)", tipo: "dinheiro", placeholder: "0,00", dica: "Nunca sai no timbrado." },
  {
    nome: "faixas",
    rotulo: "Preço por quantidade",
    tipo: "area",
    linhas: 2,
    largo: true,
    placeholder: "4: 750,00",
    dica: "Uma por linha: a partir de 4, R$ 750,00 cada.",
  },
  { nome: "descricao", rotulo: "Descrição", max: 500, largo: true },
  {
    nome: "ativo",
    rotulo: "Na tabela",
    tipo: "segmentos",
    opcoes: [
      { valor: "sim", nome: "Ativo" },
      { valor: "nao", nome: "Fora" },
    ],
  },
];

const CAMPOS_VARIAVEL: DefCampo[] = [
  { nome: "rotulo", rotulo: "Pergunta", obrigatorio: true, max: 80, placeholder: "Ex.: Nicho" },
  {
    nome: "tipo",
    rotulo: "Tipo",
    tipo: "segmentos",
    opcoes: [
      { valor: "escolha", nome: "Escolha" },
      { valor: "numero", nome: "Número" },
    ],
  },
  { nome: "chave", rotulo: "Chave", max: 40, placeholder: "sai do nome", dica: "Usada nas fórmulas dos modelos." },
  {
    nome: "opcoes",
    rotulo: "Opções e multiplicador",
    tipo: "area",
    linhas: 4,
    largo: true,
    placeholder: "Corporativo: 1\nCasamento: 1,3\nUrgente: 1,25 | pos",
    dica: 'Uma por linha. "| pos, extra" limita o multiplicador a esses grupos.',
  },
];

/** Ajustes → Tabela de preços: itens com faixas, variáveis (nicho, urgência…) e modelos de orçamento. */
export default async function TabelaDePrecos() {
  const sessao = await exigirAcessoNaPagina("/app/ajustes/precos");
  const tabela = await carregarTabela({ sub: sessao.sub, orgId: sessao.orgId });
  const muda = podeVerDinheiro(sessao.papel);
  return (
    <div className="pagina">
      <Link className="voltar" href="/app/ajustes">
        <Icone nome="voltar" size={16} /> Ajustes
      </Link>
      <header className="pagina__cabeca">
        <h1 className="atitle">
          Tabela de <strong>preços.</strong>
        </h1>
        <p className="apoio">O orçamento nasce daqui. {muda ? "" : "Só administração e gestão mudam."}</p>
      </header>

      {GRUPOS.map((g) => {
        const itens = tabela.itens.filter((i) => i.grupo === g.k);
        if (!itens.length) return null;
        return (
          <Secao key={g.k} titulo={g.nome}>
            <ul className="tabela-precos">
              {itens.map((i) => (
                <li key={i.id} data-ativo={i.ativo || undefined}>
                  <details>
                    <summary>
                      <span className="tp__nome">
                        {i.nome}
                        {i.descricao ? <span className="sutil">{i.descricao}</span> : null}
                      </span>
                      <span className="tp__faixas">
                        {i.faixas.map((f) => (
                          <span key={f.aPartirDe} className="chip" title={`A partir de ${f.aPartirDe}`}>
                            {f.aPartirDe}+ · {brl(f.precoCents)}
                          </span>
                        ))}
                      </span>
                      <span className="tp__preco">
                        {brl(i.precoCents)}
                        <span className="sutil">/{nomeUnidade(i.unidade)}</span>
                      </span>
                      <span className="tp__custo" title="Custo interno">
                        {brl(i.custoCents)}
                      </span>
                      {!i.ativo ? <span className="selo">Fora</span> : null}
                    </summary>
                    {muda ? (
                      <div className="tp__editar">
                        <Formulario
                          acao={salvarItemAcao}
                          campos={CAMPOS_ITEM}
                          id={i.id}
                          compacto
                          inicial={{
                            nome: i.nome,
                            grupo: i.grupo,
                            unidade: i.unidade,
                            preco: (i.precoCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
                            custo: (i.custoCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
                            faixas: faixasEmTexto(i.faixas),
                            descricao: i.descricao ?? "",
                            ativo: i.ativo ? "sim" : "nao",
                          }}
                          rotulo="Salvar item"
                        />
                        <BotaoAcao
                          acao={removerItemAcao}
                          campos={{ id: i.id }}
                          rotulo="Remover item"
                          classe="q-perigo"
                          icone="lixo"
                          confirmar="Remover da tabela?"
                        />
                      </div>
                    ) : null}
                  </details>
                </li>
              ))}
            </ul>
          </Secao>
        );
      })}

      {muda ? (
        <details className="secao secao--abrir">
          <summary>
            <Icone nome="mais" size={18} /> Novo item
          </summary>
          <Formulario
            acao={salvarItemAcao}
            campos={CAMPOS_ITEM}
            compacto
            inicial={{ grupo: "captacao", unidade: "diaria", ativo: "sim" }}
            rotulo="Adicionar item"
          />
        </details>
      ) : null}

      <Secao titulo="Variáveis">
        {tabela.variaveis.length ? (
          <ul className="tabela-precos">
            {tabela.variaveis.map((v) => (
              <li key={v.id}>
                <details>
                  <summary>
                    <span className="tp__nome">
                      {v.rotulo}
                      <span className="sutil">{v.tipo === "numero" ? "número" : `${v.opcoes.length} opções`}</span>
                    </span>
                    <span className="tp__faixas">
                      {v.opcoes.map((o) => (
                        <span key={o.valor} className="chip">
                          {o.rotulo}
                          {o.mult && o.mult !== 1 ? ` ×${String(o.mult).replace(".", ",")}` : ""}
                        </span>
                      ))}
                    </span>
                    <span className="codigo">{v.chave}</span>
                  </summary>
                  {muda ? (
                    <div className="tp__editar">
                      <Formulario
                        acao={salvarVariavelAcao}
                        campos={CAMPOS_VARIAVEL}
                        id={v.id}
                        compacto
                        inicial={{ rotulo: v.rotulo, tipo: v.tipo, chave: v.chave, opcoes: opcoesEmTexto(v.opcoes) }}
                        rotulo="Salvar variável"
                      />
                      <BotaoAcao
                        acao={removerVariavelAcao}
                        campos={{ id: v.id }}
                        rotulo="Remover"
                        classe="q-perigo"
                        icone="lixo"
                        confirmar="Remover a variável?"
                      />
                    </div>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nada">Nenhuma variável. Ex.: nicho (casamento ×1,3), urgência, quantidade de vídeos.</p>
        )}
        {muda ? (
          <details className="secao--abrir">
            <summary>
              <Icone nome="mais" size={16} /> Nova variável
            </summary>
            <Formulario acao={salvarVariavelAcao} campos={CAMPOS_VARIAVEL} compacto inicial={{ tipo: "escolha" }} rotulo="Adicionar variável" />
          </details>
        ) : null}
      </Secao>

      <Secao titulo="Modelos">
        {tabela.modelos.length ? (
          <ul className="tabela-precos">
            {tabela.modelos.map((m) => (
              <li key={m.id}>
                <details>
                  <summary>
                    <span className="tp__nome">
                      {m.nome}
                      <span className="sutil">{m.descricao ?? m.nicho}</span>
                    </span>
                    <span className="tp__faixas">
                      <span className="chip">{m.linhas.length} linhas</span>
                    </span>
                  </summary>
                  {muda ? (
                    <div className="tp__editar">
                      <EditorModelo modelo={m} itens={tabela.itens} variaveis={tabela.variaveis} />
                      <BotaoAcao
                        acao={removerModeloAcao}
                        campos={{ id: m.id }}
                        rotulo="Remover modelo"
                        classe="q-perigo"
                        icone="lixo"
                        confirmar="Remover o modelo?"
                      />
                    </div>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nada">Nenhum modelo. Um modelo monta o orçamento sozinho a partir das respostas.</p>
        )}
        {muda && tabela.itens.length ? (
          <details className="secao--abrir">
            <summary>
              <Icone nome="mais" size={16} /> Novo modelo
            </summary>
            <EditorModelo modelo={null} itens={tabela.itens} variaveis={tabela.variaveis} />
          </details>
        ) : null}
      </Secao>
    </div>
  );
}
