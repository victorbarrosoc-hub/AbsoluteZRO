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
 * A Z na aba própria (/z, a tela de entrada da área logada; pedido do titular, 27/10/2026), ocupando a tela. Fala com /api/zro/ia, que acrescenta o token da Absolute ZRO no
 * servidor (lib/zro/ia.ts). Sem token ou sem o escopo da Z, o painel avisa (`zro-ia:sem-login`) e aparece o
 * "Reconectar com Absolute ZRO", que volta para cá.
 * O <zro-ia> nasce por DOM, não por JSX: ele tem `api`, `sugestoes` e `tema` como getters e métodos, e o React 19
 * atribuiria propriedades por cima deles quando o elemento já está definido.
 */
export function PainelZ({ nome, volta = "/z" }: { nome?: string; volta?: string }) {
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
  // A altura é a da janela menos o cabeçalho e as abas (nunca abaixo de 440 px).
  return (
    <section aria-label="Z, a IA da Absolute ZRO" className="grid gap-4">
      <div
        ref={caixa}
        className="min-h-[max(440px,calc(100dvh_-_190px))] [--zro-ia-altura:max(440px,calc(100dvh_-_190px))] sm:min-h-[max(500px,calc(100dvh_-_230px))] sm:[--zro-ia-altura:max(500px,calc(100dvh_-_230px))]"
      />
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
