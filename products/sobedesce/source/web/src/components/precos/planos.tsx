import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ROTAS } from "@/lib/site";
import { FluxoDemo } from "./fluxo-demo";

/**
 * Planos do SOBEDESCE (docs/PLANOS-E-ROADMAP.md, na branch docs/custos-lancamento). Preços de lançamento: durante o
 * beta aberto (SOBEDESCE_BETA_ABERTO) toda conta usa tudo, por isso todos os botões levam a criar a conta.
 */

type Linha = { texto: string; nao?: boolean; beta?: boolean };

type Plano = {
  id: string;
  nome: string;
  para: string;
  preco: string;
  periodo: string;
  anual: string | null;
  destaque?: string;
  linhas: Linha[];
  extra?: string;
  acao: { label: string; href: string; externo?: boolean };
};

const PLANOS: Plano[] = [
  {
    id: "gratis",
    nome: "Grátis",
    para: "Para começar e mandar arquivo grande sem dor de cabeça.",
    preco: "R$ 0",
    periodo: "para sempre",
    anual: null,
    linhas: [
      { texto: "2 aparelhos por conta do Drive" },
      { texto: "Envio e download retomáveis no Google Drive" },
      { texto: "Wi-Fi direto entre celular e computador" },
      { texto: "Calculadora de mídia" },
      { texto: "Comparador, Entre discos e Frames com limite" },
      { texto: "Backup Automático", nao: true },
    ],
    acao: { label: "Criar conta grátis", href: ROTAS.criarConta },
  },
  {
    id: "pro",
    nome: "Pro",
    para: "Para quem vive de entregar arquivo pesado.",
    preco: "R$ 39",
    periodo: "/mês",
    anual: "ou R$ 390 por ano (2 meses grátis)",
    linhas: [
      { texto: "3 aparelhos por conta do Drive" },
      { texto: "Tudo do Grátis" },
      { texto: "Comparador e Entre discos sem limite" },
      { texto: "Frames e busca por cena" },
      { texto: "Backup Automático", nao: true },
    ],
    acao: { label: "Criar conta", href: ROTAS.criarConta },
  },
  {
    id: "produtora",
    nome: "Produtora",
    para: "Para o set: o cartão passa sozinho, conferido.",
    preco: "R$ 129",
    periodo: "/mês",
    anual: "ou R$ 1.290 por ano (2 meses grátis)",
    destaque: "Backup Automático",
    linhas: [
      { texto: "5 aparelhos por conta do Drive" },
      { texto: "Tudo do Pro" },
      { texto: "Backup Automático: espetou o cartão, copiou" },
      { texto: "Cada arquivo conferido antes do “pode formatar”" },
      { texto: "Só o material novo, em vários HDs ao mesmo tempo" },
      { texto: "Organizado por diária, dono e cartão" },
      { texto: "Referências: salve vídeos e posts numa coleção do Drive" },
    ],
    extra: "Aparelho extra: R$ 25 por mês cada.",
    acao: { label: "Criar conta", href: ROTAS.criarConta },
  },
  {
    id: "synquei",
    nome: "Produtora + Synquei",
    para: "Do cartão à timeline, sem arrastar arquivo.",
    preco: "R$ 179",
    periodo: "/mês",
    anual: "ou R$ 1.790 por ano (2 meses grátis)",
    linhas: [
      { texto: "Tudo da Produtora" },
      { texto: "Synquei completo: sincronia pelo som, com timecode como apoio" },
      { texto: "Cada cartão novo entra no DaVinci por diária, câmera, dono e cartão", beta: true },
      { texto: "Multicâmera pronta pra cortar" },
      { texto: "Exporta para Premiere, Resolve, Final Cut e Avid" },
    ],
    extra: "A integração com o DaVinci precisa do DaVinci Resolve Studio.",
    acao: { label: "Conhecer o Synquei", href: "https://synquei.vercel.app", externo: true },
  },
];

function Card({ p }: { p: Plano }) {
  const forte = Boolean(p.destaque);
  return (
    <article
      aria-labelledby={`plano-${p.id}`}
      className={cn(
        "relative flex flex-col rounded-[24px] p-6 ring-1 sm:p-7",
        forte ? "bg-stage text-white ring-white/10" : "bg-surface text-ink ring-line",
      )}
    >
      {p.destaque ? (
        <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-up to-down px-3 py-1 text-[12px] font-semibold text-white">{p.destaque}</span>
      ) : null}
      <h2 id={`plano-${p.id}`} className="font-display text-[22px] font-semibold tracking-[-0.02em]">
        {p.nome}
      </h2>
      <p className={cn("mt-2 min-h-[44px] text-[14px] leading-snug", forte ? "text-white/65" : "text-ink-2")}>{p.para}</p>
      <p className="mt-5 flex items-baseline gap-1">
        <span className="font-display text-[40px] leading-none font-semibold tracking-[-0.03em]">{p.preco}</span>
        <span className={cn("text-[15px]", forte ? "text-white/60" : "text-ink-2")}>{p.periodo}</span>
      </p>
      <p className={cn("mt-2 min-h-[20px] text-[13px]", forte ? "text-white/55" : "text-ink-3")}>{p.anual}</p>
      <ul className="mt-6 grid gap-3 text-[14px] leading-snug">
        {p.linhas.map((l) => (
          <li key={l.texto} className={cn("flex gap-2.5", l.nao && (forte ? "text-white/40" : "text-ink-3"))}>
            {l.nao ? (
              <Minus className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <Check className={cn("mt-0.5 size-4 shrink-0", forte ? "text-down-soft" : "text-down-text")} aria-hidden="true" />
            )}
            <span>
              {l.nao ? <span className="sr-only">Não inclui: </span> : null}
              {l.texto}
              {l.beta ? <span className="ml-1.5 rounded-full bg-up/15 px-1.5 py-0.5 align-[1px] text-[11px] font-semibold text-up-text">Beta</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {p.extra ? <p className={cn("mt-5 text-[12.5px] leading-snug", forte ? "text-white/55" : "text-ink-3")}>{p.extra}</p> : null}
      <div className="mt-auto pt-7">
        {p.acao.externo ? (
          <a
            href={p.acao.href}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "secondary", size: "lg", className: "w-full" })}
          >
            {p.acao.label}
          </a>
        ) : (
          <Link
            href={p.acao.href}
            className={buttonClasses({
              variant: forte ? "secondary" : "primary",
              size: "lg",
              className: cn("w-full", forte && "bg-white text-ink ring-0 hover:bg-white/90"),
            })}
          >
            {p.acao.label}
          </Link>
        )}
      </div>
    </article>
  );
}

const PERGUNTAS = [
  {
    p: "O que conta como aparelho?",
    r: "Cada computador ou celular que usa o SOBEDESCE com a mesma conta do Google Drive. No Grátis são 2, no Pro 3 e na Produtora 5 (com aparelho extra a R$ 25 por mês).",
  },
  {
    p: "Hoje eu já pago alguma coisa?",
    r: "Não. Durante o beta, toda conta usa tudo de graça. Os preços desta página valem quando a cobrança começar, e a gente avisa antes.",
  },
  {
    p: "Meus arquivos passam pelos servidores do SOBEDESCE?",
    r: "Não. O envio vai do seu aparelho direto para o Google Drive, e o Backup Automático copia do cartão direto para os seus HDs.",
  },
  {
    p: "Preciso do DaVinci Resolve Studio?",
    r: "Só para o Synquei mandar os cartões sozinho para dentro do projeto do DaVinci. A sincronia e a exportação para Premiere, Resolve, Final Cut e Avid funcionam sem ele.",
  },
];

export function Planos() {
  return (
    <>
      <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-ok/12 px-3.5 py-1.5 text-[13px] font-medium text-ok-text ring-1 ring-ok/25">
        <Check className="size-3.5" aria-hidden="true" />
        Beta aberto: hoje tudo está liberado de graça para quem tem conta.
      </p>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {PLANOS.map((p) => (
          <Card key={p.id} p={p} />
        ))}
      </div>
      <p className="mt-6 text-[13px] text-ink-3">Preços em reais, de lançamento. Podem mudar até a cobrança começar.</p>

      <section aria-labelledby="como-funciona" className="mt-24 grid gap-8">
        <div className="max-w-[720px]">
          <p className="text-[15px] font-semibold text-up-text">Produtora + Synquei</p>
          <h2 id="como-funciona" className="mt-3 font-display text-[28px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance text-ink sm:text-[40px]">
            Espetou o cartão. Abriu o DaVinci. Já está tudo lá.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
            O SOBEDESCE copia o cartão para os HDs e confere cada arquivo. O Synquei sincroniza câmeras e gravador pelo som e manda para o DaVinci, em pastas por
            diária, câmera, dono e cartão. Só entra o que é novo.
          </p>
        </div>
        <FluxoDemo />
      </section>

      <section aria-labelledby="duvidas" className="mt-24 max-w-[760px]">
        <h2 id="duvidas" className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink sm:text-[34px]">
          Dúvidas
        </h2>
        <dl className="mt-8 grid gap-7">
          {PERGUNTAS.map((q) => (
            <div key={q.p}>
              <dt className="text-[17px] font-semibold text-ink">{q.p}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-ink-2">{q.r}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
