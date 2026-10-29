/** Os contratos aceitos de um projeto ou cliente (só administração e gestão chegam a ver: o RLS esconde do resto). */
import Link from "next/link";
import type { ResumoContrato } from "@/lib/contrato/servidor";
import { Secao } from "@/components/crm";
import { Icone } from "@/components/icones";

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function ListaContratos({ contratos }: { contratos: ResumoContrato[] }) {
  if (!contratos.length) return null;
  return (
    <Secao titulo="Contratos">
      <ul className="linhas">
        {contratos.map((c) => (
          <li key={c.id} className="linha">
            <span className="linha__coluna">
              <Icone nome="documento" size={16} />
            </span>
            <span className="linha__titulo">
              <Link href={`/app/contratos/${c.id}`}>Contrato · {c.orcamentoCodigo}</Link>
              <span className="sutil"> · aceito por {c.nome}</span>
            </span>
            <span className="linha__meta">{data(c.aceitoEm)}</span>
          </li>
        ))}
      </ul>
    </Secao>
  );
}
