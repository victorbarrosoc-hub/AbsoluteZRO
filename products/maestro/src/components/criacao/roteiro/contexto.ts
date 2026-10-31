"use client";
/** O que todo bloco do editor precisa sem passar por cada camada: as operações (estáveis), o elenco e se edita. */
import { createContext, useContext } from "react";
import type { Pessoa, Roteiro, TipoBloco } from "@/lib/criacao/roteiro/modelo";

export type Foco = { id: string; onde?: "inicio" | "fim" };

export type Operacoes = {
  /** Muda o documento (a gravação vem sozinha). */
  mudar: (fn: (r: Roteiro) => Roteiro, foco?: Foco) => void;
  /** Leva o foco a um bloco (depois do próximo desenho). */
  focar: (f: Foco) => void;
  /** Abre a folha de tipos do iPhone para a cena. */
  adicionar: (cenaId: string) => void;
};

export type EditorCtx = { ops: Operacoes; pessoas: Pessoa[]; editavel: boolean };

export const Contexto = createContext<EditorCtx | null>(null);
export const useEditor = () => useContext(Contexto)!;

/** Os 6 tipos de ⌘1–6 e do "+", com ícone (a nota interna vem por Tab, "/" e no "+" do iPhone). */
export const ICONE_TIPO: Record<TipoBloco, "balao" | "imagem" | "camera" | "letra" | "musica" | "bandeira" | "cadeado"> = {
  fala: "balao",
  acao: "imagem",
  plano: "camera",
  lettering: "letra",
  audio: "musica",
  observacao: "bandeira",
  nota: "cadeado",
};
