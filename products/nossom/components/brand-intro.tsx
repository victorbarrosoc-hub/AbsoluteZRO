import { coroaPath } from './brand';

// Abertura (titular, 02/11/2026: "quando abre, tá desatualizado a logo"): a Coroa sonora vazada se desenha, o clarão
// acende com o feixe horizontal, e QUASAR com o selo AUDIO LAB entra embaixo; depois a tela abre. Só CSS (nada por
// quadro no React, nenhum `d` mudando); uma vez por sessão, pulada com "reduzir movimento" e em automação.
const decide = `(function(){var d=document.documentElement;try{var m=matchMedia('(prefers-reduced-motion: reduce)').matches;if(navigator.webdriver||m||sessionStorage.getItem('nossom:intro')){d.dataset.intro='skip';return}sessionStorage.setItem('nossom:intro','1');d.dataset.intro='play';setTimeout(function(){d.dataset.intro='done'},2400)}catch(e){d.dataset.intro='skip'}})();`;

export default function BrandIntro() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: decide }} />
      <div className="brand-intro" aria-hidden="true">
        <div className="brand-intro-glow" />
        <div className="brand-intro-mark">
          <svg viewBox="0 0 100 100" width="156" height="156">
            <defs>
              <linearGradient id="intro-anel" x1="0" y1="0" x2="1" y2="0">
                <stop stopColor="#c9dafa" />
                <stop offset=".55" stopColor="#6f98ec" />
                <stop offset=".85" stopColor="#b9d2ff" />
                <stop offset="1" stopColor="#ffffff" />
              </linearGradient>
              <radialGradient id="intro-clarao">
                <stop stopColor="#fff" />
                <stop offset=".18" stopColor="#dcebff" />
                <stop offset=".5" stopColor="#6f9dff" stopOpacity=".45" />
                <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="intro-feixe" x1="0" x2="1">
                <stop stopColor="#fff" stopOpacity="0" />
                <stop offset=".4" stopColor="#fff" stopOpacity=".55" />
                <stop offset=".5" stopColor="#fff" />
                <stop offset=".6" stopColor="#fff" stopOpacity=".55" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              className="brand-intro-anel"
              d={coroaPath(160)}
              pathLength={1}
              fill="none"
              stroke="url(#intro-anel)"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <g className="brand-intro-luz">
              <rect
                className="brand-intro-feixe"
                x="46"
                y="49.55"
                width="80"
                height=".9"
                fill="url(#intro-feixe)"
              />
              <circle cx="86" cy="50" r="12" fill="url(#intro-clarao)" />
              <circle cx="86" cy="50" r="1.6" fill="#fff" />
            </g>
          </svg>
          <span className="brand-intro-nome">
            <span className="brand-intro-letras">
              {'QUASAR'.split('').map((letra, i) => (
                <span key={i} style={{ animationDelay: `${0.72 + i * 0.045}s` }}>
                  {letra}
                </span>
              ))}
            </span>
            <span className="brand-intro-selo">AUDIO LAB</span>
          </span>
        </div>
      </div>
    </>
  );
}
