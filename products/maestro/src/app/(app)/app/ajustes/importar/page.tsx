import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { dataBr } from "@/lib/dinheiro";
import { TIPOS } from "@/lib/importar/csv";
import { historicoDeImportacoes } from "@/lib/importar/servidor";
import { podeRemover } from "@/lib/papeis";
import { CabecaForm } from "@/components/form";
import { Importador } from "@/components/importador";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Importar planilha" };

/**
 * Importar planilha (estudo MakersHub §4.2, drizzle/0016): clientes, projetos, freelas e equipamentos de um .csv, com
 * as colunas achadas pelos cabeçalhos, prévia linha a linha e confirmação. Só administração e gestão (o banco confere).
 */
export default async function Importar() {
  const s = await exigirAcessoNaPagina("/app/ajustes/importar");
  if (!podeRemover(s.papel))
    return (
      <div className="pagina">
        <CabecaForm voltar="/app/ajustes" titulo={<strong>Importar planilha</strong>} />
        <EstadoVazio icone="importar" titulo="Importar é da gestão" apoio="Só administração e gestão trazem cadastros em massa." />
      </div>
    );
  const historico = await historicoDeImportacoes({ sub: s.sub, orgId: s.orgId });
  return (
    <div className="pagina">
      <CabecaForm voltar="/app/ajustes" titulo={<strong>Importar planilha</strong>}>
        <p className="apoio">Confira antes; nada entra sem o seu “Importar”.</p>
      </CabecaForm>
      <Importador />
      {historico.length ? (
        <section className="secao" aria-label="Importações anteriores">
          <header className="secao__topo">
            <h2>Anteriores</h2>
          </header>
          <ul className="importar__historico">
            {historico.map((h) => (
              <li key={h.id}>
                <b>{TIPOS.find((t) => t.k === h.tipo)?.nome}</b>
                <span>{h.arquivo}</span>
                <small>
                  {dataBr(h.em.slice(0, 10))} · {h.criados} novos · {h.atualizados} atualizados · {h.iguais} iguais · {h.ignorados} pulados
                </small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
