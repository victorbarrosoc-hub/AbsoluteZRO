"use client";

import { useEffect, useRef, useState } from "react";
import { BotaoZro } from "./zro";

/** O painel da Z, o mesmo em todas as plataformas da Absolute ZRO (web component, servido pela Absolute ZRO). */
export const SCRIPT_ZRO_IA = "https://absolutezro.com/ia/v1/zro-ia.js";

/**
 * Só o que a Z consegue: conversar e ler o retrato da conta Absolute ZRO (projetos, pendências, entregas e o consumo
 * do mês). Ela não move, não apaga nem confere arquivo, e não vê a fila de transferências deste app.
 */
export const SUGESTOES_Z = ["Entregas pendentes", "Resumo dos meus projetos", "Como conferir uma descarga", "Quanto usei este mês"];
export const APOIO_Z = "Pergunte sobre seus projetos, entregas e descargas.";

function carregarScript() {
  if (document.querySelector(`script[src="${SCRIPT_ZRO_IA}"]`)) return;
  const s = document.createElement("script");
  s.type = "module";
  s.src = SCRIPT_ZRO_IA;
  document.head.appendChild(s);
}

/**
 * A Z no topo da conta (o painel inicial do site). Fala com /api/zro/ia, que acrescenta o token da Absolute ZRO no
 * servidor (lib/zro/ia.ts). Sem token ou sem o escopo da Z, o painel avisa (`zro-ia:sem-login`) e aparece o
 * "Reconectar com Absolute ZRO", que volta para cá.
 * O <zro-ia> nasce por DOM, não por JSX: ele tem `api`, `sugestoes` e `tema` como getters e métodos, e o React 19
 * atribuiria propriedades por cima deles quando o elemento já está definido.
 */
export function PainelZ({ nome, volta = "/conta" }: { nome?: string; volta?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [semLogin, setSemLogin] = useState(false);

  useEffect(() => {
    const lugar = caixa.current;
    if (!lugar) return;
    const el = document.createElement("zro-ia");
    el.setAttribute("api", "/api/zro/ia");
    el.setAttribute("apoio", APOIO_Z);
    el.setAttribute("sugestoes", JSON.stringify(SUGESTOES_Z));
    el.setAttribute("tema", "auto");
    if (nome) el.setAttribute("nome", nome);
    const avisar = () => setSemLogin(true);
    el.addEventListener("zro-ia:sem-login", avisar);
    lugar.replaceChildren(el);
    carregarScript();
    return () => {
      el.removeEventListener("zro-ia:sem-login", avisar);
      el.remove();
    };
  }, [nome]);

  // Sem k-entra: animação de transform num ancestral prende a gaveta de Conversas (position: fixed) a esta caixa.
  return (
    <section aria-label="Z, a IA da Absolute ZRO" className="mb-10 grid gap-4 sm:mb-14">
      <div ref={caixa} className="min-h-[440px] [--zro-ia-altura:440px] sm:min-h-[500px] sm:[--zro-ia-altura:500px]" />
      {semLogin ? (
        <div className="flex justify-center">
          <BotaoZro modo="vincular" volta={volta} size="md">
            Reconectar com Absolute ZRO
          </BotaoZro>
        </div>
      ) : null}
    </section>
  );
}
