/**
 * O produto real em aparelhos (padrão da casa: credibilidade vem da tela de verdade). As fotos são capturas do Maestro
 * rodando com a produtora de demonstração (`e2e/capturas-inicio.spec.ts` + `scripts/capturas-inicio.mjs`), em claro e
 * escuro (`public/produto/<tela>-<mac|iphone>-<claro|escuro>.webp`); o tema da página escolhe qual aparece. A moldura é
 * só CSS: nada de mock do que não existe.
 */
import Image from "next/image";

type Tela = { nome: string; alt: string };

/** Tamanho de cada captura (MacBook 1440×900 a 1,5×; iPhone 393×852 a 2×; recortes no tamanho da folha). */
const TAM = { mac: [2160, 1350], iphone: [786, 1704] } as const;

function Fotos({ src, larg, alt, sizes, prioridade }: { src: string; larg: number; alt: number; sizes: string; prioridade?: boolean }) {
  return (
    <>
      <Image className="tela tela--claro" src={`/produto/${src}-claro.webp`} alt="" width={larg} height={alt} sizes={sizes} priority={prioridade} />
      <Image className="tela tela--escuro" src={`/produto/${src}-escuro.webp`} alt="" width={larg} height={alt} sizes={sizes} />
    </>
  );
}

export function MacBook({ tela, prioridade, sizes }: { tela: Tela; prioridade?: boolean; sizes?: string }) {
  return (
    <figure className="mac" role="img" aria-label={tela.alt}>
      <div className="mac__tampa">
        <span className="mac__camera" aria-hidden="true" />
        <div className="mac__tela">
          <Fotos src={`${tela.nome}-mac`} larg={TAM.mac[0]} alt={TAM.mac[1]} sizes={sizes ?? "(max-width: 900px) 92vw, 1040px"} prioridade={prioridade} />
        </div>
      </div>
      <div className="mac__base" aria-hidden="true" />
    </figure>
  );
}

export function IPhone({ tela, prioridade, sizes }: { tela: Tela; prioridade?: boolean; sizes?: string }) {
  return (
    <figure className="iphone" role="img" aria-label={tela.alt}>
      <span className="iphone__ilha" aria-hidden="true" />
      <div className="iphone__tela">
        <Fotos src={`${tela.nome}-iphone`} larg={TAM.iphone[0]} alt={TAM.iphone[1]} sizes={sizes ?? "(max-width: 900px) 40vw, 300px"} prioridade={prioridade} />
      </div>
    </figure>
  );
}

/** Um pedaço da tela, sem aparelho (a folha da viagem, o canvas do Fluxo): janela de vidro com cantos de app. */
export function Recorte({ tela, larg, alt, sizes, className }: { tela: Tela; larg: number; alt: number; sizes: string; className?: string }) {
  return (
    <figure className={`recorte${className ? ` ${className}` : ""}`} role="img" aria-label={tela.alt}>
      <Fotos src={tela.nome} larg={larg} alt={alt} sizes={sizes} />
    </figure>
  );
}
