import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import Link from "next/link";
import { demonstracaoCompleta, temDemonstracao } from "@/lib/demo/demonstracao";
import { NOME_DO_PAPEL, podeRemover } from "@/lib/papeis";
import { meuAlcance } from "@/lib/pessoas";
import { emissor } from "@/lib/zro/config";
import { Icone } from "@/components/icones";
import { Avatar, BotaoSair } from "@/components/shell";
import { SeletorDeTema } from "@/components/tema";
import { CarregarDemonstracao, RemoverDemonstracao } from "@/components/demonstracao";

export const metadata = { title: "Ajustes" };

/**
 * Ajustes: a conta (perfil único: nome, e-mail e foto se editam na Absolute ZRO), a organização e o papel, o tema.
 * Equipe, revisor/função e ajustes da organização chegam com o Quadro (etapa 1).
 */
export default async function Ajustes() {
  const s = await exigirAcessoNaPagina("/app/ajustes");
  const ctx = { sub: s.sub, orgId: s.orgId };
  const demo = podeRemover(s.papel) ? await temDemonstracao(ctx) : false;
  const completa = demo ? await demonstracaoCompleta(ctx) : false;
  const alcance = await meuAlcance(ctx);
  return (
    <div className="pagina">
      <header className="pagina__cabeca">
        <h1 className="atitle">
          Seus <strong>ajustes.</strong>
        </h1>
        <p className="apoio">Sua conta é a conta Absolute ZRO; o papel vem da organização de lá.</p>
      </header>
      <div className="fichas">
        <section className="ficha" aria-label="Conta">
          <div className="ficha__pessoa">
            <Avatar sessao={s} grande />
            <div>
              <strong>{s.nome ?? s.email}</strong>
              <span className="sutil">{s.email}</span>
            </div>
          </div>
          <div className="acoes">
            <a className="glass-btn glass-btn--sm" href={`${emissor()}/perfil`} target="_blank" rel="noreferrer">
              <Icone nome="externo" size={15} /> Editar na conta Absolute ZRO
            </a>
            <BotaoSair />
          </div>
        </section>
        <section className="ficha" aria-label="Organização">
          <dl>
            <dt>Organização</dt>
            <dd>{s.orgNome}</dd>
            <dt>Seu papel</dt>
            <dd>
              {NOME_DO_PAPEL[s.papel]}
              {s.hubRole ? <span className="sutil"> · {s.hubRole} na Absolute ZRO</span> : null}
            </dd>
            {alcance.restrito ? (
              <>
                <dt>Clientes</dt>
                <dd>
                  Só {alcance.clientes === 1 ? "1 cliente" : `${alcance.clientes} clientes`} <span className="sutil">· a gestão escolhe</span>
                </dd>
              </>
            ) : null}
            <dt>Tema</dt>
            <dd>
              <SeletorDeTema />
            </dd>
          </dl>
        </section>
        <section className="ficha" aria-label="Equipe e agenda">
          <div>
            <strong className="ficha__titulo">Equipe e agenda</strong>
            <p className="sutil">Quem vê o quê, e a sua agenda no celular.</p>
          </div>
          <nav className="atalhos" aria-label="Equipe e agenda">
            <Link className="atalho" href="/app/ajustes/pessoas">
              <Icone nome="pessoas" size={18} /> Pessoas e acesso <Icone nome="seta" size={15} />
            </Link>
            <Link className="atalho" href="/app/ajustes/agenda">
              <Icone nome="agenda" size={18} /> Agenda no celular <Icone nome="seta" size={15} />
            </Link>
            {podeRemover(s.papel) ? (
              <Link className="atalho" href="/app/ajustes/importar">
                <Icone nome="importar" size={18} /> Importar planilha <Icone nome="seta" size={15} />
              </Link>
            ) : null}
          </nav>
        </section>
        <section className="ficha" aria-label="Produtora">
          <div>
            <strong className="ficha__titulo">Produtora</strong>
            <p className="sutil">A marca, o link de pedido e a base dos orçamentos.</p>
          </div>
          <nav className="atalhos" aria-label="Ajustes da produtora">
            <Link className="atalho" href="/app/ajustes/marca">
              <Icone nome="marca" size={18} /> Marca <Icone nome="seta" size={15} />
            </Link>
            <Link className="atalho" href="/app/ajustes/empresa">
              <Icone nome="documento" size={18} /> Empresa e orçamento <Icone nome="seta" size={15} />
            </Link>
            <Link className="atalho" href="/app/ajustes/pedido">
              <Icone nome="link" size={18} /> Link de pedido <Icone nome="seta" size={15} />
            </Link>
            <Link className="atalho" href="/app/ajustes/precos">
              <Icone nome="orcamento" size={18} /> Tabela de preços <Icone nome="seta" size={15} />
            </Link>
          </nav>
        </section>
        {podeRemover(s.papel) ? (
          <section className="ficha" id="demonstracao" aria-label="Demonstração">
            <div>
              <strong className="ficha__titulo">Demonstração</strong>
              <p className="sutil">
                {demo
                  ? completa
                    ? "Os dados de exemplo estão em todas as seções."
                    : "Há seções novas sem exemplo. Complete a demonstração."
                  : "Uma produtora de exemplo inteira, para ver o Maestro em ação."}
              </p>
            </div>
            <div className="acoes">
              {!demo || !completa ? <CarregarDemonstracao className="glass-btn glass-btn--sm" rotulo={demo ? "Completar demonstração" : undefined} /> : null}
              {demo ? <RemoverDemonstracao /> : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
