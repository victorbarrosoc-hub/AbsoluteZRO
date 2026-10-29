"use client";
/** Busca das listas: atualiza ?q= enquanto a pessoa digita (sem recarregar a página), mantendo os outros filtros. */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icone } from "./icones";

export function Busca({ placeholder = "Buscar" }: { placeholder?: string }) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [v, setV] = useState(params.get("q") ?? "");
  const [, iniciar] = useTransition();
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <label className="q-busca">
      <Icone nome="busca" size={16} />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        placeholder={placeholder}
        value={v}
        onChange={(e) => {
          const q = e.currentTarget.value;
          setV(q);
          clearTimeout(t.current);
          t.current = setTimeout(() => {
            const u = new URLSearchParams(params.toString());
            if (q.trim()) u.set("q", q.trim());
            else u.delete("q");
            const s = u.toString();
            iniciar(() => router.replace(s ? `${caminho}?${s}` : caminho, { scroll: false }));
          }, 250);
        }}
      />
    </label>
  );
}
