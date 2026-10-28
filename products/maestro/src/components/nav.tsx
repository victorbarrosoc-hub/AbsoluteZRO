"use client";
/** As abas do MVP, a Z primeiro (como nas outras plataformas). A aba ativa segue o caminho. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone, type NomeIcone } from "./icones";

export const ABAS: { href: string; nome: string; icone: NomeIcone }[] = [
  { href: "/app/z", nome: "Z", icone: "z" },
  { href: "/app/quadro", nome: "Quadro", icone: "quadro" },
  { href: "/app/aprovacoes", nome: "Aprovações", icone: "aprovacoes" },
  { href: "/app/clientes", nome: "Clientes", icone: "clientes" },
  { href: "/app/projetos", nome: "Projetos", icone: "projetos" },
  { href: "/app/ajustes", nome: "Ajustes", icone: "ajustes" },
];

export function Abas() {
  const caminho = usePathname();
  return (
    <nav className="nav" aria-label="Seções do Maestro">
      {ABAS.map((a) => {
        const ativa = caminho === a.href || caminho.startsWith(`${a.href}/`);
        return (
          <Link key={a.href} href={a.href} aria-current={ativa ? "page" : undefined} data-aba={a.icone}>
            <Icone nome={a.icone} size={16} />
            {a.nome}
          </Link>
        );
      })}
    </nav>
  );
}
