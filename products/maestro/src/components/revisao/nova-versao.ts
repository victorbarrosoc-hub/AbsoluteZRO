"use client";
/**
 * Colar o link de uma versão nova, igual no lote (`lote-equipe.tsx`) e na ficha do card (`quadro/versoes.tsx`): a prévia
 * da fonte ao colar (`detectarFonte`, as mesmas fontes e mensagens) e a mesma ação do servidor (`novaVersaoAcao`: sessão,
 * papel, `maestro.versao_criar` e, com o link do cliente ativo, a volta para Em aprovação e o Drive compartilhado).
 */
import { useState, useTransition } from "react";
import { novaVersaoAcao } from "@/app/(app)/app/aprovacoes/acoes";
import { detectarFonte, type Deteccao } from "@/lib/revisao/fontes/detectar";

export function useNovaVersao(card: string, aoFim: () => void) {
  const [link, setLinkCru] = useState("");
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const fonte: Deteccao | null = link.trim() ? detectarFonte(link) : null;

  const setLink = (v: string) => {
    setLinkCru(v);
    setErro(null);
  };

  function enviar() {
    if (!fonte?.ok) {
      setErro(fonte && !fonte.ok ? fonte.erro : "Cole o link da peça.");
      return;
    }
    iniciar(async () => {
      const r = await novaVersaoAcao(card, link, titulo);
      if (!r.ok) setErro(r.mensagem);
      else {
        setLinkCru("");
        setTitulo("");
        setErro(null);
        aoFim();
      }
    });
  }

  /** O que mostrar embaixo do campo: o erro do servidor ou o do link colado. */
  const mensagem = erro ?? (fonte && !fonte.ok ? fonte.erro : null);
  return { link, setLink, titulo, setTitulo, fonte, pendente, enviar, mensagem };
}
