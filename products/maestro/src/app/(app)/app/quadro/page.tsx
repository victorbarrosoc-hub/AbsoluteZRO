import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { COLUNAS } from "@/lib/quadro/metodo";

export const metadata = { title: "Quadro" };

/**
 * O Quadro: as 8 colunas do método, vazias. Os cards, a ficha, os filtros e as vistas chegam na etapa 1; até lá a
 * tela mostra o método de verdade (nomes do proprietário), sem botão para o que ainda não existe.
 */
export default async function Quadro() {
  await exigirAcessoNaPagina("/app/quadro");
  return (
    <div className="pagina">
      <header className="pagina__cabeca">
        <h1 className="atitle">
          O <strong>Quadro.</strong>
        </h1>
        <p className="apoio">Oito colunas, um próximo passo por card. Os cards chegam na próxima etapa.</p>
      </header>
      <div className="quadro" role="list" aria-label="Colunas do método">
        {COLUNAS.map((c) => (
          <section key={c.k} className="coluna" role="listitem" aria-label={c.nome}>
            <div className="coluna__topo">
              <h2>{c.nome}</h2>
              <span className="coluna__n" title="Cards nesta coluna">
                0
              </span>
            </div>
            <p className="coluna__desc">{c.desc}</p>
            <div className="coluna__vago" aria-hidden="true" />
          </section>
        ))}
      </div>
    </div>
  );
}
