"use client";
/**
 * Gravação do Roteiro (plano da Criação §4.3): salva sozinha 600 ms depois da última mudança (e na hora ao sair do
 * campo, ao esconder a aba e ao sair da tela), sempre com o `rev` que a tela viu por último. Se outra pessoa gravou
 * antes (409 com o atual), junta as duas por id (`juntarRoteiros`, três vias a partir do último que as duas viram) e
 * grava de novo; o que mudou dos dois lados no mesmo bloco vira aviso com as duas versões. Poll de 5 s, como no
 * Quadro: sem mudança local, adota o que chegou; com mudança local, a próxima gravação junta.
 *
 * O estado do documento mora em refs (fonte da verdade para o que é assíncrono) e é espelhado no React para desenhar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { type Conflito, juntarRoteiros } from "@/lib/criacao/roteiro/juntar";
import type { Roteiro } from "@/lib/criacao/roteiro/modelo";
import type { EstadoRoteiro, RoteiroCompleto } from "@/lib/criacao/roteiro/servidor";

export type EstadoGravacao = "salvo" | "pendente" | "salvando" | "offline" | "erro";
const ESPERA_MS = 600;
const POLL_MS = 5000;

type Base = { rev: number; conteudo: Roteiro; titulo: string };
export type Aviso = { conflitos: Conflito[]; quem: string | null };

export function useGravacao(id: string, inicial: RoteiroCompleto, editavel: boolean) {
  const url = `/api/criacao/roteiros/${id}`;
  const [roteiro, setRoteiro] = useState(inicial.conteudo);
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [estado, setEstado] = useState<EstadoGravacao>("salvo");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [meta, setMeta] = useState({ estado: inicial.estado as EstadoRoteiro, versaoAtual: inicial.versaoAtual, rev: inicial.rev });

  const base = useRef<Base>({ rev: inicial.rev, conteudo: inicial.conteudo, titulo: inicial.titulo });
  const atual = useRef({ roteiro: inicial.conteudo, titulo: inicial.titulo });
  const emVoo = useRef<Promise<void> | null>(null);
  const deNovo = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sujo = () => atual.current.roteiro !== base.current.conteudo || atual.current.titulo !== base.current.titulo;

  const adotar = useCallback((r: RoteiroCompleto) => {
    base.current = { rev: r.rev, conteudo: r.conteudo, titulo: r.titulo };
    atual.current = { roteiro: r.conteudo, titulo: r.titulo };
    setRoteiro(r.conteudo);
    setTitulo(r.titulo);
    setMeta({ estado: r.estado, versaoAtual: r.versaoAtual, rev: r.rev });
  }, []);

  const gravarRef = useRef<() => Promise<void>>(async () => {});
  const gravar = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!editavel) return;
    if (emVoo.current) {
      deNovo.current = true;
      return emVoo.current;
    }
    if (!sujo()) {
      setEstado("salvo");
      return;
    }
    const corpo = atual.current;
    const b = base.current;
    const json = JSON.stringify({ op: "salvar", rev: b.rev, conteudo: corpo.roteiro, ...(corpo.titulo !== b.titulo ? { titulo: corpo.titulo } : {}) });
    setEstado("salvando");
    const ida = (async () => {
      let r: Response;
      try {
        r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: json.length < 60_000 });
      } catch {
        setEstado("offline");
        setMensagem("Sem conexão. Tentando de novo.");
        timer.current = setTimeout(() => void gravarRef.current(), POLL_MS);
        return;
      }
      const d = (await r.json().catch(() => ({}))) as {
        rev?: number;
        erro?: string;
        mensagem?: string;
        atual?: RoteiroCompleto;
      };
      if (r.ok && d.rev) {
        base.current = { rev: d.rev, conteudo: corpo.roteiro, titulo: corpo.titulo.replace(/\s+/g, " ").trim() || b.titulo };
        if (atual.current.titulo === corpo.titulo) atual.current = { ...atual.current, titulo: base.current.titulo };
        setMeta((m) => ({ ...m, rev: d.rev! }));
        setMensagem(null);
        setEstado(sujo() ? "pendente" : "salvo");
        if (sujo()) deNovo.current = true;
        return;
      }
      if (r.status === 409 && d.atual) {
        const deles = d.atual;
        const junto = juntarRoteiros(b.conteudo, atual.current.roteiro, deles.conteudo);
        const meuTitulo = atual.current.titulo !== b.titulo ? atual.current.titulo : deles.titulo;
        base.current = { rev: deles.rev, conteudo: deles.conteudo, titulo: deles.titulo };
        atual.current = { roteiro: junto.roteiro, titulo: meuTitulo };
        setRoteiro(junto.roteiro);
        setTitulo(meuTitulo);
        setMeta({ estado: deles.estado, versaoAtual: deles.versaoAtual, rev: deles.rev });
        if (junto.conflitos.length) setAviso({ conflitos: junto.conflitos, quem: deles.atualizadoPor });
        deNovo.current = true;
        return;
      }
      setEstado("erro");
      setMensagem(d.mensagem ?? "Não deu para salvar.");
    })();
    emVoo.current = ida;
    try {
      await ida;
    } finally {
      emVoo.current = null;
    }
    if (deNovo.current) {
      deNovo.current = false;
      return gravarRef.current();
    }
  }, [editavel, url]);
  useEffect(() => {
    gravarRef.current = gravar;
  }, [gravar]);

  /** Muda o documento (a tela chama a cada tecla) e agenda a gravação. */
  const mudar = useCallback(
    (fn: (r: Roteiro) => Roteiro) => {
      const novo = fn(atual.current.roteiro);
      if (novo === atual.current.roteiro) return;
      atual.current = { ...atual.current, roteiro: novo };
      setRoteiro(novo);
      setEstado("pendente");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void gravar(), ESPERA_MS);
    },
    [gravar],
  );

  const mudarTitulo = useCallback(
    (t: string) => {
      atual.current = { ...atual.current, titulo: t };
      setTitulo(t);
      setEstado("pendente");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void gravar(), ESPERA_MS);
    },
    [gravar],
  );

  // poll de 5 s (só com a aba à vista)
  useEffect(() => {
    let parado = false;
    const olhar = async () => {
      if (document.hidden || emVoo.current) return;
      try {
        const r = await fetch(`${url}?rev=${base.current.rev}`, { cache: "no-store" });
        if (!r.ok || parado) return;
        const d = (await r.json()) as { mudou: boolean; rev: number; estado?: EstadoRoteiro; versaoAtual?: number; roteiro?: RoteiroCompleto };
        if (!d.mudou) {
          setMeta((m) => (m.estado === d.estado && m.versaoAtual === d.versaoAtual ? m : { ...m, estado: d.estado!, versaoAtual: d.versaoAtual! }));
          return;
        }
        if (d.roteiro && !sujo() && !emVoo.current) adotar(d.roteiro);
        else if (d.roteiro) setMeta((m) => ({ ...m, estado: d.roteiro!.estado, versaoAtual: d.roteiro!.versaoAtual }));
      } catch {
        /* sem rede: a próxima volta tenta */
      }
    };
    const t = setInterval(olhar, POLL_MS);
    return () => {
      parado = true;
      clearInterval(t);
    };
  }, [url, adotar]);

  // aba escondida ou tela saindo: grava na hora
  useEffect(() => {
    const esconder = () => {
      if (document.hidden) void gravar();
    };
    const sair = (e: BeforeUnloadEvent) => {
      if (sujo()) {
        void gravar();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", esconder);
    window.addEventListener("beforeunload", sair);
    return () => {
      document.removeEventListener("visibilitychange", esconder);
      window.removeEventListener("beforeunload", sair);
      void gravar();
    };
  }, [gravar]);

  /** O `rev` do último que o servidor confirmou (versões e restaurar mandam este). */
  const rev = useCallback(() => base.current.rev, []);

  return { roteiro, titulo, estado, mensagem, aviso, meta, setMeta, setAviso, mudar, mudarTitulo, gravar, adotar, rev };
}
