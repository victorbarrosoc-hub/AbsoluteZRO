import { temAcesso } from "@/lib/auth/acesso";
import { sessaoDaPagina } from "@/lib/auth/pagina";
import { HUB_URL, ROTAS } from "@/lib/site";
import { MaestroSimbolo, ZroSimbolo } from "@/components/marca";

/**
 * Página inicial pública: o Maestro nasce fechado. Uma ideia só ("Em desenvolvimento."), uma linha, a porta de entrada
 * para quem já tem acesso e o caminho de volta à Absolute ZRO. Sem CTA de teste, sem fingir recurso.
 */
export default async function Inicio() {
  const sessao = await sessaoDaPagina();
  const dentro = !!sessao && temAcesso(sessao);
  return (
    <div className="abertura">
      <main id="conteudo" className="abertura__miolo">
        <MaestroSimbolo width={240} className="abertura__simbolo" title="Maestro" />
        <span className="abertura__nome">Maestro</span>
        <h1 className="atitle atitle--xl">
          Em <strong>desenvolvimento.</strong>
        </h1>
        <p className="apoio">Pauta, aprovação do cliente e projetos para agências e produtoras. Uma plataforma Absolute ZRO.</p>
        <div className="acoes acoes--centro">
          {dentro ? (
            <a className="glass-btn glass-btn--ink" href={ROTAS.app}>
              Abrir o Maestro
            </a>
          ) : (
            <a className="glass-btn glass-btn--ink" href={ROTAS.entrar}>
              <ZroSimbolo size={18} /> Entrar com Absolute ZRO
            </a>
          )}
          <a className="glass-btn" href={HUB_URL}>
            Voltar ao HUB
          </a>
        </div>
      </main>
      <footer className="abertura__rodape">
        <a href={HUB_URL}>
          <ZroSimbolo size={18} /> Absolute ZRO
        </a>
      </footer>
    </div>
  );
}
