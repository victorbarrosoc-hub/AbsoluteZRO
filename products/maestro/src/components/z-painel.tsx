"use client";
/**
 * A Z, a IA da Absolute ZRO, na aba própria (/app/z, discreta: ícone no fim da cápsula e no topo do celular). O painel é o `<zro-ia>` publicado pela Absolute
 * ZRO; ele fala com /api/zro/ia, o repasse do servidor que acrescenta o token da sessão (nada de token no navegador).
 * Token antigo ou sem o escopo da IA: o painel avisa e aqui aparece "Entrar de novo com Absolute ZRO".
 */
import { useEffect, useRef, useState } from "react";
import { ZroSimbolo } from "./marca";
import { useTema } from "./use-tema";

export const ZRO_IA_SCRIPT = "https://absolutezro.com/ia/v1/zro-ia.js";
const SUGESTOES = [
  "O que entra no Quadro esta semana?",
  "Como funciona a aprovação do cliente?",
  "O que a Absolute ZRO vê do meu projeto?",
  "Quantos créditos de IA tenho?",
];
const RECONECTAR = "/api/zro/entrar?volta=%2Fapp%2Fz";

type ZroIaElement = HTMLElement & { token?: unknown };
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "zro-ia": React.DetailedHTMLProps<React.HTMLAttributes<ZroIaElement>, ZroIaElement> & {
        api?: string;
        apoio?: string;
        sugestoes?: string;
        tema?: "claro" | "escuro" | "auto";
        nome?: string;
      };
    }
  }
}

export function PainelDaZ({ nome }: { nome: string | null }) {
  const ref = useRef<ZroIaElement>(null);
  const [semLogin, setSemLogin] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const tema = useTema() === "dark" ? "escuro" : "claro";

  useEffect(() => {
    if (customElements.get("zro-ia")) return;
    let script = document.querySelector<HTMLScriptElement>(`script[src="${ZRO_IA_SCRIPT}"]`);
    const falha = () => setFalhou(true);
    if (!script) {
      script = document.createElement("script");
      script.type = "module";
      script.src = ZRO_IA_SCRIPT;
      document.head.append(script);
    }
    script.addEventListener("error", falha);
    return () => script?.removeEventListener("error", falha);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sem = () => setSemLogin(true);
    const ok = () => setSemLogin(false);
    el.addEventListener("zro-ia:sem-login", sem);
    el.addEventListener("zro-ia:resposta", ok);
    return () => {
      el.removeEventListener("zro-ia:sem-login", sem);
      el.removeEventListener("zro-ia:resposta", ok);
    };
  }, [falhou]);

  // Sem o painel publicado (rede fora, bloqueio): avisa aqui mesmo, sem fingir conversa.
  if (falhou)
    return (
      <section className="z-aviso" aria-label="Z, a IA da Absolute ZRO">
        <ZroSimbolo size={40} />
        <p role="status">A Z não carregou agora.</p>
        <button type="button" className="glass-btn glass-btn--sm" onClick={() => location.reload()}>
          Tentar de novo
        </button>
      </section>
    );
  return (
    <section className="z-tela" aria-label="Z, a IA da Absolute ZRO" data-z={semLogin ? "sem-login" : undefined}>
      <zro-ia
        ref={ref}
        api="/api/zro/ia"
        tema={tema}
        apoio="Pergunte sobre a pauta, os clientes e os projetos."
        sugestoes={JSON.stringify(SUGESTOES)}
        nome={nome ?? undefined}
      />
      {semLogin && (
        <div className="z-aviso" role="status">
          <p>Entre de novo com a Absolute ZRO para conversar com a Z.</p>
          <a className="glass-btn glass-btn--ink glass-btn--sm" href={RECONECTAR}>
            <ZroSimbolo size={16} /> Entrar de novo com Absolute ZRO
          </a>
        </div>
      )}
    </section>
  );
}
