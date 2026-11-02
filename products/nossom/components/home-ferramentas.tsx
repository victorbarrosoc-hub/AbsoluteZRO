// Home · Proposta 2 (titular, 01/11/2026; atualizada em 02/11 com a mesa, a Z, a trilha e a Presence): "Tudo o que o som pede. Num lugar só." Cada cartão mostra a forma do que a
// ferramenta faz (faixas, onda tratada, curva, falas no tempo, volume de entrega), sem parágrafo. Os desenhos são
// fixos (sem animação por quadro); quem abre o estúdio cai direto na ferramenta.
import Link from 'next/link';

/** Barras de onda determinísticas (mesmo desenho no servidor e no navegador). */
function barras(n: number, semente: number) {
  let s = semente * 9301 + 49297;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: n }, (_, i) => {
    let a = 0.25 + 0.75 * Math.abs(Math.sin((i / n) * 9 + r() * 0.8)) * (0.55 + 0.45 * r());
    if (r() < 0.06) a *= 0.25;
    return Math.max(6, Math.round(a * 100));
  });
}
function Onda({
  n,
  semente,
  cor,
  cor2,
  corte = 2,
}: {
  n: number;
  semente: number;
  cor: string;
  cor2?: string;
  corte?: number;
}) {
  return (
    <span className="hf-onda" aria-hidden="true">
      {barras(n, semente).map((h, i) => (
        <i key={i} style={{ height: `${h}%`, background: i / n < corte ? cor : (cor2 ?? cor) }} />
      ))}
    </span>
  );
}

/** A mesa de faixas: o original e cada passo, nas cores do estúdio (Z em ciano, Presence em roxo). */
const MESA = [
  { nome: 'Original', cor: '#7f9bc7', semente: 4 },
  { nome: 'Z · voz limpa', cor: '#3fd0ff', semente: 9 },
  { nome: 'Quasar Presence', cor: '#a274ff', semente: 6 },
];

const FAIXAS = [
  { nome: 'Voz', cor: '#5aa9ff', semente: 2 },
  { nome: 'Bateria', cor: '#8eb2ff', semente: 7 },
  { nome: 'Baixo', cor: '#a98bff', semente: 11 },
  { nome: 'Guitarra', cor: '#dcefff', semente: 5 },
  { nome: 'Resto', cor: '#48484a', semente: 13 },
];

function Cartao({
  closed,
  href,
  className = '',
  titulo,
  apoio,
  children,
}: {
  closed: boolean;
  href: string;
  className?: string;
  titulo: string;
  apoio: string;
  children: React.ReactNode;
}) {
  const corpo = (
    <>
      <div className="hf-forma">{children}</div>
      <h3>{titulo}</h3>
      <p>{apoio}</p>
    </>
  );
  // Fechado ao público, o cartão só apresenta: nada abre.
  return closed ? (
    <div className={`hf-cartao ${className}`}>{corpo}</div>
  ) : (
    <Link href={href} className={`hf-cartao ${className}`}>
      {corpo}
    </Link>
  );
}

export default function HomeFerramentas({ closed }: { closed: boolean }) {
  return (
    <section className="home-ferramentas ns-wrap" id="produto">
      <h2>
        <span>Tudo o que o som pede.</span> Num lugar só.
      </h2>
      <div className="hf-grade">
        <Cartao
          closed={closed}
          href="/studio/automatico"
          className="hf-grande"
          titulo="Mesa de faixas"
          apoio="Cada passo do tratamento, lado a lado."
        >
          <span className="hf-faixas">
            {MESA.map((f) => (
              <span key={f.nome} className="hf-faixa">
                <small>{f.nome}</small>
                <Onda n={90} semente={f.semente} cor={f.cor} />
              </span>
            ))}
          </span>
        </Cartao>
        <Cartao
          closed={closed}
          href="/studio/automatico"
          className="hf-z"
          titulo="Melhorar com a Z"
          apoio="Voz limpa e clara."
        >
          <Onda n={40} semente={3} cor="#a274ff" cor2="#3a3a3c" corte={0.5} />
        </Cartao>
        <Cartao
          closed={closed}
          href="/studio/mixagem"
          className="hf-z"
          titulo="Trilha e efeitos"
          apoio="Descreva. A Z cria."
        >
          <span className="hf-pedidos" aria-hidden="true">
            <span>lo-fi calmo com piano</span>
            <span>whoosh rápido</span>
            <span>chuva leve</span>
          </span>
        </Cartao>
        <Cartao
          closed={closed}
          href="/studio/masterizacao"
          className="hf-z"
          titulo="Quasar Presence"
          apoio="Corpo e presença na voz."
        >
          <span className="hf-eq hf-presence" aria-hidden="true">
            {[62, 48, 80, 56].map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
          </span>
        </Cartao>
        <Cartao closed={closed} href="/studio/remixar" titulo="Remixar" apoio="Escolha o que fica.">
          <span className="hf-faixas hf-faixas-mini">
            {FAIXAS.slice(0, 3).map((f) => (
              <span key={f.nome} className="hf-faixa">
                <small>{f.nome}</small>
                <Onda n={40} semente={f.semente} cor={f.cor} />
              </span>
            ))}
          </span>
        </Cartao>
        <Cartao
          closed={closed}
          href="/studio/legendas"
          titulo="Legendas"
          apoio="Cada fala, no tempo certo."
        >
          <span className="hf-falas" aria-hidden="true">
            <span>00:12 Bom dia, gente.</span>
            <strong>00:15 Hoje a conversa é sobre som.</strong>
            <span>00:19 E sobre como deixar…</span>
          </span>
        </Cartao>
        <Cartao
          closed={closed}
          href="/studio/equalizacao"
          titulo="Equalização"
          apoio="Uma assinatura de voz."
        >
          <span className="hf-eq" aria-hidden="true">
            {[30, 55, 90, 70, 40].map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} className={i === 2 ? 'on' : ''} />
            ))}
          </span>
        </Cartao>
        <Cartao
          closed={closed}
          href="/studio/masterizacao"
          titulo="Preparar entrega"
          apoio="YouTube, podcast, TV."
        >
          <span className="hf-lufs" aria-hidden="true">
            <b>−14</b> LUFS
          </span>
        </Cartao>
      </div>
      {!closed && (
        <Link href="/studio" className="button primary">
          Abrir o estúdio
        </Link>
      )}
    </section>
  );
}
