"use client";
/**
 * O player da revisão (plano v2 §4.1): um adaptador por fonte com o mesmo controle (tocar, pausar, pular, tempo, passo
 * de quadro). <video> nativo para arquivo direto, Dropbox, HLS (nativo no Safari; hls.js carregado só quando preciso)
 * e Drive pela chave de API do Maestro; IFrame API do YouTube (sem cookie); Player SDK do Vimeo; iframe do Drive como
 * último recurso (sem tempo: o comentário leva o tempo digitado). O tempo sobe para a tela no máximo 4 vezes por
 * segundo (timeupdate / consulta), nunca por quadro.
 */
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { capacidades, urlDrivePreview, type Capacidades } from "@/lib/revisao/fontes/detectar";
import { FPS_PADRAO } from "@/lib/revisao/tempo";
import type { VersaoVista } from "@/lib/revisao/tipos";
import { Icone } from "@/components/icones";
import { useMidia } from "@/components/use-midia";
import { DriveEquipe } from "./drive-equipe";

export type Controle = {
  tocar(): void;
  pausar(): void;
  alternar(): void;
  pular(ms: number): void;
  passo(direcao: 1 | -1): void;
  tempo(): number | null;
};

export type EventosPlayer = {
  aoTempo?: (ms: number) => void;
  aoDuracao?: (ms: number) => void;
  aoTocando?: (tocando: boolean) => void;
  aoCapacidades?: (c: Capacidades) => void;
  aoProporcao?: (r: number) => void;
};

type PropsAdaptador = EventosPlayer & { aoControle: (c: Controle | null) => void };

// ───────────── scripts dos players externos (uma vez por página) ─────────────

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, permitir: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
};
type YTNamespace = { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer };
type VimeoPlayer = {
  play(): Promise<void>;
  pause(): Promise<void>;
  setCurrentTime(s: number): Promise<number>;
  getCurrentTime(): Promise<number>;
  getDuration(): Promise<number>;
  getPaused(): Promise<boolean>;
  on(ev: string, cb: (d: { seconds?: number; duration?: number }) => void): void;
  destroy(): Promise<void>;
};
type VimeoNamespace = { Player: new (el: HTMLElement, o: Record<string, unknown>) => VimeoPlayer };
type Janela = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void; Vimeo?: VimeoNamespace };

const scripts = new Map<string, Promise<void>>();
function carregarScript(src: string, pronto: () => boolean, esperar?: (fim: () => void) => void): Promise<void> {
  if (pronto()) return Promise.resolve();
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((ok, erro) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onerror = () => {
        scripts.delete(src);
        erro(new Error("script"));
      };
      if (esperar) esperar(ok);
      else s.onload = () => ok();
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

function carregarYouTube(): Promise<YTNamespace> {
  const w = window as Janela;
  return carregarScript(
    "https://www.youtube.com/iframe_api",
    () => !!w.YT?.Player,
    (fim) => {
      const antes = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        antes?.();
        fim();
      };
    },
  ).then(() => w.YT!);
}

function carregarVimeo(): Promise<VimeoNamespace> {
  const w = window as Janela;
  return carregarScript("https://player.vimeo.com/api/player.js", () => !!w.Vimeo?.Player).then(() => w.Vimeo!);
}

// ───────────── <video> nativo (arquivo, Dropbox, HLS, Drive com a chave) ─────────────

function VideoNativo({
  src,
  hls,
  fps,
  aoControle,
  aoTempo,
  aoDuracao,
  aoTocando,
  aoProporcao,
  aoErro,
}: PropsAdaptador & { src: string; hls?: boolean; fps: number; aoErro?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const fim: { destruir?: () => void; vivo: boolean } = { vivo: true };
    if (hls && !v.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js")
        .then(({ default: Hls }) => {
          if (!fim.vivo) return;
          if (!Hls.isSupported()) return aoErro?.();
          const h = new Hls({ enableWorker: true });
          h.loadSource(src);
          h.attachMedia(v);
          h.on(Hls.Events.ERROR, (_e, d) => d.fatal && aoErro?.());
          fim.destruir = () => h.destroy();
        })
        .catch(() => aoErro?.());
    } else v.src = src;
    aoControle({
      tocar: () => void v.play().catch(() => {}),
      pausar: () => v.pause(),
      alternar: () => (v.paused ? void v.play().catch(() => {}) : v.pause()),
      pular: (ms) => {
        v.currentTime = Math.max(0, ms / 1000);
      },
      passo: (d) => {
        v.pause();
        v.currentTime = Math.max(0, v.currentTime + d / fps);
      },
      tempo: () => Math.round(v.currentTime * 1000),
    });
    return () => {
      fim.vivo = false;
      fim.destruir?.();
      aoControle(null);
    };
  }, [src, hls, fps, aoControle, aoErro]);
  // No toque e no celular (iPhone), a barra nativa cobre a imagem e o tempo dela pisa no timecode gravado no quadro: lá quem
  // controla é o transporte do Maestro, embaixo do vídeo (tocar, quadro a quadro, régua); tocar na imagem pausa/toca.
  const toque = useMidia("(hover: none), (pointer: coarse), (max-width: 600px)");
  return (
    <video
      ref={ref}
      className="rv-video"
      playsInline
      preload="metadata"
      controls={!toque}
      onClick={toque ? (e) => (e.currentTarget.paused ? void e.currentTarget.play().catch(() => {}) : e.currentTarget.pause()) : undefined}
      controlsList="nodownload noremoteplayback"
      disablePictureInPicture
      onTimeUpdate={(e) => aoTempo?.(Math.round(e.currentTarget.currentTime * 1000))}
      onSeeked={(e) => aoTempo?.(Math.round(e.currentTarget.currentTime * 1000))}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (Number.isFinite(v.duration)) aoDuracao?.(Math.round(v.duration * 1000));
        if (v.videoWidth && v.videoHeight) aoProporcao?.(v.videoWidth / v.videoHeight);
      }}
      onPlay={() => aoTocando?.(true)}
      onPause={() => aoTocando?.(false)}
      onError={() => aoErro?.()}
    />
  );
}

// ───────────── YouTube (IFrame API, youtube-nocookie) ─────────────

function YouTube({ id, aoControle, aoTempo, aoDuracao, aoTocando, aoErro }: PropsAdaptador & { id: string; aoErro: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let p: YTPlayer | null = null;
    let relogio: number | undefined;
    let vivo = true;
    const alvo = document.createElement("div");
    ref.current?.appendChild(alvo);
    carregarYouTube()
      .then((YT) => {
        if (!vivo) return;
        p = new YT.Player(alvo, {
          videoId: id,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
          events: {
            onReady: () => {
              if (!p) return;
              const d = p.getDuration();
              if (d > 0) aoDuracao?.(Math.round(d * 1000));
              relogio = window.setInterval(() => p && aoTempo?.(Math.round(p.getCurrentTime() * 1000)), 250);
            },
            onStateChange: (e: { data: number }) => {
              aoTocando?.(e.data === 1);
              if (p && e.data === 1) {
                const d = p.getDuration();
                if (d > 0) aoDuracao?.(Math.round(d * 1000));
              }
            },
            onError: () => aoErro(),
          },
        });
        aoControle({
          tocar: () => p?.playVideo(),
          pausar: () => p?.pauseVideo(),
          alternar: () => (p?.getPlayerState() === 1 ? p.pauseVideo() : p?.playVideo()),
          pular: (ms) => p?.seekTo(Math.max(0, ms / 1000), true),
          passo: (d) => {
            p?.pauseVideo();
            if (p) p.seekTo(Math.max(0, p.getCurrentTime() + d / FPS_PADRAO), true);
          },
          tempo: () => (p ? Math.round(p.getCurrentTime() * 1000) : null),
        });
      })
      .catch(aoErro);
    return () => {
      vivo = false;
      window.clearInterval(relogio);
      p?.destroy();
      alvo.remove();
      aoControle(null);
    };
  }, [id, aoControle, aoTempo, aoDuracao, aoTocando, aoErro]);
  return <div ref={ref} className="rv-embed" />;
}

// ───────────── Vimeo (Player SDK) ─────────────

function Vimeo({ url, aoControle, aoTempo, aoDuracao, aoTocando, aoErro }: PropsAdaptador & { url: string; aoErro: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let p: VimeoPlayer | null = null;
    let vivo = true;
    let t = 0;
    let tocando = false;
    const alvo = document.createElement("div");
    alvo.className = "rv-embed__alvo";
    ref.current?.appendChild(alvo);
    carregarVimeo()
      .then((V) => {
        if (!vivo) return;
        p = new V.Player(alvo, { url, dnt: true, playsinline: true, responsive: true, title: false, byline: false, portrait: false });
        p.on("loaded", () => void p?.getDuration().then((d) => d > 0 && aoDuracao?.(Math.round(d * 1000))));
        p.on("timeupdate", (d) => {
          t = Math.round((d.seconds ?? 0) * 1000);
          aoTempo?.(t);
        });
        p.on("seeked", (d) => {
          t = Math.round((d.seconds ?? 0) * 1000);
          aoTempo?.(t);
        });
        p.on("play", () => {
          tocando = true;
          aoTocando?.(true);
        });
        p.on("pause", () => {
          tocando = false;
          aoTocando?.(false);
        });
        p.on("error", () => aoErro());
        aoControle({
          tocar: () => void p?.play().catch(() => {}),
          pausar: () => void p?.pause().catch(() => {}),
          alternar: () => void (tocando ? p?.pause() : p?.play())?.catch(() => {}),
          pular: (ms) => void p?.setCurrentTime(Math.max(0, ms / 1000)).catch(() => {}),
          passo: (d) => {
            void p?.pause().catch(() => {});
            void p?.setCurrentTime(Math.max(0, t / 1000 + d / FPS_PADRAO)).catch(() => {});
          },
          tempo: () => t,
        });
      })
      .catch(aoErro);
    return () => {
      vivo = false;
      void p?.destroy().catch(() => {});
      alvo.remove();
      aoControle(null);
    };
  }, [url, aoControle, aoTempo, aoDuracao, aoTocando, aoErro]);
  return <div ref={ref} className="rv-embed" />;
}

// ───────────── o player ─────────────

function Aviso({ children, href }: { children: ReactNode; href?: string }) {
  return (
    <div className="rv-aviso">
      <p>{children}</p>
      {href ? (
        <a className="glass-btn glass-btn--sm" href={href} target="_blank" rel="noreferrer noopener">
          <Icone nome="externo" size={15} /> Abrir o vídeo
        </a>
      ) : null}
    </div>
  );
}

export function Player({ versao, aoControle, ...ev }: { versao: VersaoVista; aoControle: (c: Controle | null) => void } & EventosPlayer) {
  const [falhou, setFalhou] = useState(false);
  const { aoCapacidades } = ev;
  const fps = versao.fps && versao.fps > 0 ? versao.fps : FPS_PADRAO;
  // Equipe com o SOBEDESCE: o Drive toca pelo service worker com o token curto da pessoa (tempo de verdade).
  const resolverDrive = useContext(DriveEquipe);
  const pedeEquipe = versao.fonte === "drive" && !!versao.driveId && !versao.driveChave && !!resolverDrive;
  const [equipe, setEquipe] = useState<{ id: string; src: string | null } | null>(null);
  useEffect(() => {
    if (!pedeEquipe || !resolverDrive || !versao.driveId) return;
    let vivo = true;
    const id = versao.driveId;
    void resolverDrive(id).then((src) => vivo && setEquipe({ id, src }));
    return () => {
      vivo = false;
    };
  }, [pedeEquipe, resolverDrive, versao.driveId]);
  const srcEquipe = pedeEquipe && equipe?.id === versao.driveId ? equipe.src : null;
  const esperandoEquipe = pedeEquipe && equipe?.id !== versao.driveId && !falhou;
  const stream = srcEquipe ?? versao.stream;
  const streamDrive = versao.fonte === "drive" && !!stream && !falhou;
  const id = versao.fonte === "youtube" ? new URL(versao.url).searchParams.get("v") : null;

  useEffect(() => {
    // Falhou o player com tempo: o Drive cai no iframe (sem tempo); os outros, no aviso com o link.
    const c = falhou
      ? { tempo: false, quadro: false, velocidade: false }
      : capacidades({ tipo: versao.fonte, chave: versao.driveChave ?? undefined }, { driveStream: !!stream });
    aoCapacidades?.(c);
  }, [versao.fonte, versao.driveChave, stream, falhou, aoCapacidades]);

  // Estável: os adaptadores recriam o player quando ela muda (e o <video> voltaria ao zero a cada render).
  const erro = useCallback(() => setFalhou(true), []);
  let miolo: ReactNode;
  if (esperandoEquipe) {
    miolo = <div className="rv-embed rv-carregando" aria-busy="true" aria-label="Abrindo o vídeo do Drive" />;
  } else if (versao.fonte === "link") {
    miolo = <Aviso href={versao.url}>Este vídeo abre em outra aba. Comente com o tempo digitado.</Aviso>;
  } else if (versao.fonte === "drive" && !streamDrive) {
    const prev = versao.driveId ? urlDrivePreview(versao.driveId, versao.driveChave) : null;
    miolo = prev ? (
      <iframe
        className="rv-embed"
        src={prev}
        title={versao.titulo ?? "Vídeo no Google Drive"}
        allow="autoplay; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin"
      />
    ) : (
      <Aviso href={versao.url}>Não deu para tocar este arquivo do Drive aqui.</Aviso>
    );
  } else if (falhou) {
    miolo = <Aviso href={versao.url}>Não deu para tocar este vídeo aqui.</Aviso>;
  } else if (versao.fonte === "youtube" && id) {
    miolo = <YouTube key={versao.id} id={id} aoControle={aoControle} aoErro={erro} {...ev} />;
  } else if (versao.fonte === "vimeo") {
    miolo = <Vimeo key={versao.id} url={versao.url} aoControle={aoControle} aoErro={erro} {...ev} />;
  } else {
    const src = streamDrive ? stream! : versao.url;
    miolo = (
      <VideoNativo
        key={`${versao.id}:${srcEquipe ? "equipe" : "url"}`}
        src={src}
        hls={versao.fonte === "hls"}
        fps={fps}
        aoControle={aoControle}
        aoErro={erro}
        {...ev}
      />
    );
  }
  return <>{miolo}</>;
}
