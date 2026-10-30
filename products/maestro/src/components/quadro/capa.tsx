"use client";
/**
 * A capa na ficha do card (drizzle/0035): a imagem que o card mostra no Quadro para achar o job de relance. Quem
 * escreve no Quadro escolhe uma imagem (PNG, JPEG, WebP) ou um vídeo, arrasta para cá ou cola (⌘V) com a ficha aberta;
 * vídeo vira um quadro aqui no navegador (o arquivo não sai do aparelho, só a imagem). O servidor confere, limpa e
 * reencoda (src/lib/quadro/capa.ts). Sem capa enviada, a ficha mostra a miniatura que a peça já dá (YouTube). Leitura
 * só vê.
 */
import { useEffect, useRef, useState } from "react";
import type { CardQ } from "@/lib/quadro/metodo";
import { ACEITA_CAPA, CAPA_ENTRADA_MAX } from "@/lib/quadro/capa-regras";
import { imagemDoCard, type Selo } from "@/lib/quadro/selos";
import { NOME_DA_FONTE } from "@/lib/revisao/fontes/detectar";
import { Icone } from "@/components/icones";

const IMAGEM = /^image\/(png|jpeg|webp)$/;
const VIDEO = /^video\//;

/** Um quadro do vídeo (a um terço, no máximo aos 2 s), em JPEG, sem sair do navegador. */
async function quadroDoVideo(arquivo: File): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise<void>((ok, falhou) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => falhou(new Error("video"));
    });
    const t = Number.isFinite(v.duration) && v.duration > 0 ? Math.min(2, v.duration / 3) : 0;
    await new Promise<void>((ok, falhou) => {
      v.onseeked = () => ok();
      v.onerror = () => falhou(new Error("video"));
      v.currentTime = t;
    });
    const escala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight, 1));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(v.videoWidth * escala));
    c.height = Math.max(1, Math.round(v.videoHeight * escala));
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.86));
    if (!blob) throw new Error("video");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
    v.removeAttribute("src");
    v.load();
  }
}

type Props = {
  card: CardQ;
  selo: Selo | undefined;
  podeEscrever: boolean;
  /** O card como o banco devolveu (com a capa nova). */
  adotar: (c: CardQ) => void;
};

export function CapaDaFicha({ card, selo, podeEscrever, adotar }: Props) {
  const campo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sobre, setSobre] = useState(false);
  const imagem = imagemDoCard(card.id, card.dados.capa, selo);
  const temCapa = imagem?.origem === "capa";

  async function enviar(arquivo: File | Blob) {
    if (enviando) return;
    setErro(null);
    if (arquivo.size > CAPA_ENTRADA_MAX) return setErro("Arquivo grande demais para virar capa (até 12 MB).");
    let corpo: Blob = arquivo;
    if (VIDEO.test(arquivo.type)) {
      try {
        corpo = await quadroDoVideo(arquivo as File);
      } catch {
        return setErro("Não consegui tirar um quadro desse vídeo. Tente uma imagem.");
      }
    } else if (!IMAGEM.test(arquivo.type)) return setErro("Use uma imagem (PNG, JPEG ou WebP) ou um vídeo.");
    setEnviando(true);
    try {
      const r = await fetch(`/api/quadro/capa?card=${encodeURIComponent(card.id)}`, {
        method: "POST",
        headers: { "Content-Type": corpo.type || "application/octet-stream" },
        body: corpo,
        cache: "no-store",
      });
      const d = (await r.json().catch(() => null)) as { card?: CardQ; mensagem?: string } | null;
      if (r.ok && d?.card) adotar(d.card);
      else setErro(d?.mensagem ?? "Não deu para salvar a capa agora.");
    } catch {
      setErro("Sem conexão. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  async function tirar() {
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch(`/api/quadro/capa?card=${encodeURIComponent(card.id)}`, { method: "DELETE", cache: "no-store" });
      const d = (await r.json().catch(() => null)) as { card?: CardQ; mensagem?: string } | null;
      if (r.ok && d?.card) adotar(d.card);
      else setErro(d?.mensagem ?? "Não deu para tirar a capa agora.");
    } catch {
      setErro("Sem conexão. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  // ⌘V com uma imagem na área de transferência, com a ficha aberta: vira a capa (texto colado segue para o campo)
  const enviarAgora = useRef(enviar);
  useEffect(() => {
    enviarAgora.current = enviar;
  });
  useEffect(() => {
    if (!podeEscrever) return;
    const aoColar = (e: ClipboardEvent) => {
      const arquivo = [...(e.clipboardData?.files ?? [])].find((f) => IMAGEM.test(f.type));
      if (!arquivo) return;
      e.preventDefault();
      void enviarAgora.current(arquivo);
    };
    window.addEventListener("paste", aoColar);
    return () => window.removeEventListener("paste", aoColar);
  }, [podeEscrever]);

  if (!imagem && !podeEscrever) return null;

  const dica = imagem?.origem === "peca" && selo?.peca ? (selo.peca.fonte === "youtube" ? `Do ${NOME_DA_FONTE.youtube}` : "Da peça") : null;

  return (
    <div
      className="q-capa"
      data-sobre={sobre || undefined}
      data-enviando={enviando || undefined}
      onDragOver={(e) => {
        if (!podeEscrever || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!sobre) setSobre(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(false);
      }}
      onDrop={(e) => {
        if (!podeEscrever) return;
        e.preventDefault();
        setSobre(false);
        const arquivo = e.dataTransfer.files[0];
        if (arquivo) void enviar(arquivo);
      }}
    >
      {imagem ? (
        <figure className="q-capa__imagem">
          {/* eslint-disable-next-line @next/next/no-img-element -- capa da rota com sessão ou miniatura pública da peça */}
          <img key={imagem.src} src={imagem.src} alt="Capa do card" draggable={false} referrerPolicy="no-referrer" />
          {dica ? <figcaption>{dica}</figcaption> : null}
        </figure>
      ) : null}
      {podeEscrever ? (
        <div className="q-capa__acoes">
          <button
            type="button"
            className="glass-btn glass-btn--sm"
            disabled={enviando}
            title="Escolha, arraste ou cole uma imagem. Vídeo vira um quadro."
            onClick={() => campo.current?.click()}
          >
            <Icone nome="imagem" size={15} />
            {enviando ? "Enviando…" : temCapa ? "Trocar capa" : "Adicionar capa"}
          </button>
          {temCapa ? (
            <button type="button" className="q-capa__tirar" aria-label="Tirar a capa" disabled={enviando} onClick={() => void tirar()}>
              Tirar
            </button>
          ) : null}
          <input
            ref={campo}
            type="file"
            accept={ACEITA_CAPA}
            hidden
            data-campo="capa"
            onChange={(e) => {
              const arquivo = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (arquivo) void enviar(arquivo);
            }}
          />
        </div>
      ) : null}
      {erro ? (
        <p className="q-capa__erro" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
