"use client";
/** "Novo fluxo": cria com um título provisório e abre o canvas (o título muda lá, num clique). */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icone } from "@/components/icones";

export function NovoFluxo({ className = "glass-btn glass-btn--ink" }: { className?: string }) {
  const router = useRouter();
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={indo}
        onClick={async () => {
          setIndo(true);
          setErro(null);
          try {
            const r = await fetch("/api/criacao/fluxo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ op: "criar", titulo: "Novo fluxo" }),
            });
            const c = (await r.json().catch(() => null)) as { id?: string; mensagem?: string } | null;
            if (!r.ok || !c?.id) throw new Error(c?.mensagem ?? "Não deu para criar o fluxo.");
            router.push(`/app/criacao/fluxos/${c.id}`);
          } catch (e) {
            setErro(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Sem conexão. Tente de novo.");
            setIndo(false);
          }
        }}
      >
        <Icone nome="mais" size={18} /> {indo ? "Criando…" : "Novo fluxo"}
      </button>
      {erro ? (
        <p className="fx-erro" role="alert">
          {erro}
        </p>
      ) : null}
    </>
  );
}

/** "Tirar da lixeira" na lista da lixeira. */
export function RestaurarFluxo({ id }: { id: string }) {
  const router = useRouter();
  const [indo, setIndo] = useState(false);
  return (
    <button
      type="button"
      className="glass-btn glass-btn--sm"
      disabled={indo}
      onClick={async () => {
        setIndo(true);
        const r = await fetch("/api/criacao/fluxo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "restaurar", id }),
        }).catch(() => null);
        setIndo(false);
        if (r?.ok) router.refresh();
      }}
    >
      Tirar da lixeira
    </button>
  );
}
