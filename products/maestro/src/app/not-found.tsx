import Link from "next/link";
import { HUB_URL } from "@/lib/site";
import { MaestroSimbolo, ZroSimbolo } from "@/components/marca";

export default function NaoEncontrado() {
  return (
    <div className="abertura">
      <main id="conteudo" className="abertura__miolo">
        <MaestroSimbolo width={120} className="abertura__simbolo" title="Maestro" />
        <h1 className="atitle">
          Essa página <strong>não existe.</strong>
        </h1>
        <div className="acoes acoes--centro">
          <Link className="glass-btn glass-btn--ink" href="/">
            Início
          </Link>
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
