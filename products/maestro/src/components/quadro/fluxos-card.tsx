"use client";
/**
 * Os fluxos da Criação ligados ao card, na ficha do Quadro ("Mandar para um card", fase F6). Lê pela rota do Fluxo
 * (`GET /api/criacao/fluxo?card=<id>`, como a pessoa: RLS e acesso por cliente) e só aparece quando há algum. Tocar
 * abre o fluxo.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icone } from "@/components/icones";

type FluxoDoCard = { id: string; titulo: string; itens: number };

export function FluxosDoCard({ card }: { card: string }) {
  const [fluxos, setFluxos] = useState<FluxoDoCard[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/criacao/fluxo?card=${encodeURIComponent(card)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ fluxos: FluxoDoCard[] }>) : { fluxos: [] }))
      .then(
        (d) => vivo && setFluxos(d.fluxos),
        () => {},
      );
    return () => {
      vivo = false;
    };
  }, [card]);
  if (!fluxos.length) return null;
  return (
    <section className="vc vc--fluxos" aria-label="Fluxos">
      <span className="vc__titulo">Fluxos</span>
      <ul className="vc__lista">
        {fluxos.map((f) => (
          <li key={f.id}>
            <Link className="vc__versao" href={`/app/criacao/fluxos/${f.id}`}>
              <Icone nome="grade" size={15} className="vc__icone" />
              <span className="vc__nome">{f.titulo}</span>
              <span className="vc__dia">{f.itens === 1 ? "1 item" : `${f.itens} itens`}</span>
              <Icone nome="seta" size={14} className="vc__abrir" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
