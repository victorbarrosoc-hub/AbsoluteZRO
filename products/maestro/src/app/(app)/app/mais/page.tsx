import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { Icone } from "@/components/icones";
import { AJUSTES, gruposPara, Z } from "@/lib/navegacao";

export const metadata = { title: "Seções" };

/** No celular, "Mais" abre todas as seções do Maestro, nos mesmos grupos da barra lateral. */
export default async function Mais() {
  const s = await exigirAcessoNaPagina("/app/mais");
  return (
    <div className="pagina">
      <header className="pagina__cabeca">
        <h1 className="atitle">
          Todas as <strong>seções.</strong>
        </h1>
      </header>
      {gruposPara(s.acessos)
        .filter((g) => g.nome)
        .map((g) => (
          <section key={g.nome} className="mais-grupo" aria-label={g.nome!}>
            <h2 className="lado__rotulo">{g.nome}</h2>
            <div className="mais-grade">
              {g.abas.map((a) => (
                <Link key={a.href} href={a.href} className="mais-item">
                  <Icone nome={a.icone} size={24} />
                  <span>{a.nome}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      <section className="mais-grupo" aria-label="Ajustes e Z">
        <div className="mais-grade">
          {[AJUSTES, Z].map((a) => (
            <Link key={a.href} href={a.href} className="mais-item">
              <Icone nome={a.icone} size={24} />
              <span>{a.nome}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
