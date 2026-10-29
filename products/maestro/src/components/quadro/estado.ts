"use client";
/**
 * O estado do Quadro no navegador e a conversa com /api/quadro:
 * - grava por CAMPO, mandando como base a versão de cada campo que a pessoa viu (conflito por campo no banco);
 * - mostra a mudança na hora (otimista); recusa desfaz e conflito traz o card atual com um aviso curto;
 * - tempo real simples: a cada 5 s, com a aba à vista, pergunta "o que mudou desde" e junta o que chegou;
 *   card com gravação em andamento não é atropelado, e versão mais velha nunca substitui a mais nova.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Referencias } from "@/lib/quadro/servidor";
import { novoId, type CampoEditavel, type CardQ, type DadosCard } from "@/lib/quadro/metodo";
import { renovarSecoes } from "@/lib/quadro/renovar";

export type Inicial = Referencias & { cards: CardQ[]; cursor: string; eu: string; podeEscrever: boolean };
export type Aviso = { id: number; texto: string; desfazer?: () => void };
type Resposta = { ok: true; card: CardQ } | { ok: false; status: number; erro: string; mensagem: string; card?: CardQ };

const ENDERECO = "/api/quadro";
const POLL_MS = 5000;

async function chamar(corpo: Record<string, unknown>): Promise<Resposta> {
  try {
    const r = await fetch(ENDERECO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
    });
    const d = (await r.json().catch(() => null)) as { card?: CardQ; erro?: string; mensagem?: string } | null;
    if (r.ok && d?.card) return { ok: true, card: d.card };
    if (r.status === 401) return { ok: false, status: 401, erro: "sem_sessao", mensagem: "A sessão acabou. Entre de novo." };
    return { ok: false, status: r.status, erro: d?.erro ?? "erro", mensagem: d?.mensagem ?? "Não deu para salvar agora.", card: d?.card };
  } catch {
    return { ok: false, status: 0, erro: "rede", mensagem: "Sem conexão. Tente de novo em instantes." };
  }
}

const porId = (l: CardQ[]) => Object.fromEntries(l.map((c) => [c.id, c])) as Record<string, CardQ>;

export function useQuadro(ini: Inicial) {
  const [cards, setCards] = useState<Record<string, CardQ>>(() => porId(ini.cards));
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const cursor = useRef(ini.cursor);
  const emVoo = useRef(new Map<string, number>());
  const atual = useRef(cards);
  useEffect(() => {
    atual.current = cards;
  });

  // depois de gravar (com uma folga, para juntar várias mudanças), as outras seções guardadas no navegador caducam
  const renovarT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const renovar = useCallback(() => {
    clearTimeout(renovarT.current);
    renovarT.current = setTimeout(() => void renovarSecoes().catch(() => {}), 1500);
  }, []);
  useEffect(() => () => clearTimeout(renovarT.current), []);

  const avisar = useCallback((texto: string, desfazer?: () => void) => setAviso({ id: Date.now(), texto, desfazer }), []);
  const fecharAviso = useCallback(() => setAviso(null), []);

  const voar = (id: string, d: 1 | -1) => {
    const n = (emVoo.current.get(id) ?? 0) + d;
    if (n > 0) emVoo.current.set(id, n);
    else emVoo.current.delete(id);
  };
  const por = useCallback((c: CardQ) => {
    setCards((m) => {
      const n = { ...m };
      if (c.dados.apagadoEm) delete n[c.id];
      else n[c.id] = c;
      return n;
    });
  }, []);

  /** Junta o que veio do banco: card em gravação fica como está; versão mais velha não volta. */
  const juntar = useCallback((chegaram: CardQ[]) => {
    setCards((m) => {
      let n = m;
      for (const c of chegaram) {
        if (emVoo.current.has(c.id)) continue;
        const local = m[c.id];
        if (local && local.versao > c.versao) continue;
        if (n === m) n = { ...m };
        if (c.dados.apagadoEm) delete n[c.id];
        else n[c.id] = c;
      }
      return n;
    });
  }, []);

  // tempo real simples: pergunta a cada 5 s com a aba à vista, e logo que a aba volta
  useEffect(() => {
    let parado = false;
    let indo = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const volta = async () => {
      clearTimeout(t);
      if (parado || indo) return;
      if (document.visibilityState === "visible") {
        indo = true;
        try {
          const r = await fetch(`${ENDERECO}?desde=${encodeURIComponent(cursor.current)}`, { cache: "no-store" });
          if (r.ok) {
            const d = (await r.json()) as { cards: CardQ[]; cursor: string };
            cursor.current = d.cursor;
            if (d.cards.length) juntar(d.cards);
          }
        } catch {
          // sem rede: tenta na próxima volta
        } finally {
          indo = false;
        }
      }
      if (!parado) t = setTimeout(volta, POLL_MS);
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void volta();
    };
    // A tela pode ter vindo do cache do roteador (staleTimes em next.config.ts): pergunta já o que mudou desde então.
    t = setTimeout(volta, 0);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      parado = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [juntar]);

  /** Muda campos de um card (otimista). Devolve false se o banco recusou. */
  const mudar = useCallback(
    async (id: string, campos: Partial<Record<CampoEditavel, unknown>>): Promise<boolean> => {
      const antes = atual.current[id];
      if (!antes) return false;
      const base: Record<string, number> = {};
      for (const k of Object.keys(campos)) base[k] = antes.versoes[k] ?? 0;
      const dados = { ...antes.dados } as Record<string, unknown>;
      for (const [k, v] of Object.entries(campos)) {
        if (v === null) delete dados[k];
        else dados[k] = v;
      }
      if (campos.coluna) dados.colunaEm = Date.now();
      por({ ...antes, dados: dados as DadosCard });
      voar(id, 1);
      const r = await chamar({ op: "mudar", id, campos, base });
      voar(id, -1);
      if (r.ok) {
        por(r.card);
        renovar();
        return true;
      }
      if (r.card) por(r.card);
      else por(antes);
      avisar(r.mensagem);
      return false;
    },
    [por, avisar, renovar],
  );

  const criar = useCallback(
    async (dados: Partial<DadosCard> & { tema: string }): Promise<string | null> => {
      const id = novoId();
      const campos: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(dados)) if (v !== undefined && v !== null && v !== "") campos[k] = v;
      const provisorio: CardQ = { id, versao: 0, versoes: {}, dados: { coluna: "pauta", ...campos, criadoEm: Date.now(), colunaEm: Date.now() } as DadosCard };
      por(provisorio);
      voar(id, 1);
      const r = await chamar({ op: "criar", id, dados: campos });
      voar(id, -1);
      if (r.ok) {
        por(r.card);
        renovar();
        return id;
      }
      setCards((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      avisar(r.mensagem);
      return null;
    },
    [por, avisar, renovar],
  );

  const restaurar = useCallback(
    async (id: string) => {
      const r = await chamar({ op: "restaurar", id });
      if (r.ok) por(r.card);
      else avisar(r.mensagem);
    },
    [por, avisar],
  );

  const apagar = useCallback(
    async (id: string) => {
      const antes = atual.current[id];
      if (!antes) return;
      setCards((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      voar(id, 1);
      const r = await chamar({ op: "apagar", id });
      voar(id, -1);
      if (r.ok) {
        avisar("Card apagado.", () => void restaurar(id));
        renovar();
      } else {
        por(antes);
        avisar(r.mensagem);
      }
    },
    [por, avisar, restaurar, renovar],
  );

  return { cards, mudar, criar, apagar, aviso, avisar, fecharAviso };
}
