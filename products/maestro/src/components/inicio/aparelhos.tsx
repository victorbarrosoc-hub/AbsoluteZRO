/**
 * O produto real em aparelhos (padrão da casa: credibilidade vem da tela de verdade). As fotos são capturas do Maestro
 * rodando com a organização de demonstração (`npm run db:seed:demo`), em claro e escuro (public/produto/*.webp); o
 * tema da página escolhe qual aparece. A moldura é só CSS: nada de mock do que não existe.
 */
import Image from "next/image";

type Tela = { nome: string; alt: string };

function Fotos({ tela, larg, alt, sizes, prioridade }: { tela: string; larg: number; alt: number; sizes: string; prioridade?: boolean }) {
  return (
    <>
      <Image className="tela tela--claro" src={`/produto/${tela}-claro.webp`} alt="" width={larg} height={alt} sizes={sizes} priority={prioridade} />
      <Image className="tela tela--escuro" src={`/produto/${tela}-escuro.webp`} alt="" width={larg} height={alt} sizes={sizes} />
    </>
  );
}

export function MacBook({ tela, prioridade }: { tela: Tela; prioridade?: boolean }) {
  return (
    <figure className="mac" aria-label={tela.alt}>
      <div className="mac__tampa">
        <span className="mac__camera" aria-hidden="true" />
        <div className="mac__tela">
          <Fotos tela={`${tela.nome}-mac`} larg={2160} alt={1350} sizes="(max-width: 900px) 92vw, 1040px" prioridade={prioridade} />
        </div>
      </div>
      <div className="mac__base" aria-hidden="true" />
    </figure>
  );
}

export function IPhone({ tela, prioridade }: { tela: Tela; prioridade?: boolean }) {
  return (
    <figure className="iphone" aria-label={tela.alt}>
      <span className="iphone__ilha" aria-hidden="true" />
      <div className="iphone__tela">
        <Fotos tela={`${tela.nome}-iphone`} larg={786} alt={1704} sizes="(max-width: 900px) 40vw, 300px" prioridade={prioridade} />
      </div>
    </figure>
  );
}
