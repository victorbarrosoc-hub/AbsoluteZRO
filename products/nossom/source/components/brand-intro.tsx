// Opening sequence: the canonical ribbon is drawn in light, takes the chrome, the name settles
// and the screen opens. CSS only; once per session, skipped for reduced motion and automation.
const ribbon = 'M3 42C28 14 35 0 55 18S82 43 107 8C78 48 72 53 50 36S25 24 3 42Z';
const decide = `(function(){var d=document.documentElement;try{var m=matchMedia('(prefers-reduced-motion: reduce)').matches;if(navigator.webdriver||m||sessionStorage.getItem('nossom:intro')){d.dataset.intro='skip';return}sessionStorage.setItem('nossom:intro','1');d.dataset.intro='play';setTimeout(function(){d.dataset.intro='done'},2200)}catch(e){d.dataset.intro='skip'}})();`;

export default function BrandIntro() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: decide }} />
      <div className="brand-intro" aria-hidden="true">
        <div className="brand-intro-glow" />
        <div className="brand-intro-waves">
          <span />
          <span />
          <span />
        </div>
        <div className="brand-intro-mark">
          <svg viewBox="0 0 110 56" width="168" height="86">
            <defs>
              <linearGradient id="intro-chrome" x1="0" y1="0" x2=".8" y2="1">
                <stop stopColor="#eef4fc" />
                <stop offset=".3" stopColor="#8c9eb5" />
                <stop offset=".5" stopColor="#ffffff" />
                <stop offset=".7" stopColor="#6fb6ff" />
                <stop offset="1" stopColor="#c9d8ea" />
              </linearGradient>
              <linearGradient id="intro-sweep" x1="0" x2="1">
                <stop stopColor="#fff" stopOpacity="0" />
                <stop offset=".5" stopColor="#fff" stopOpacity=".95" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <clipPath id="intro-clip">
                <path d={ribbon} />
              </clipPath>
            </defs>
            <path className="brand-intro-fill" d={ribbon} fill="url(#intro-chrome)" />
            <g clipPath="url(#intro-clip)">
              <rect
                className="brand-intro-sweep"
                x="-40"
                y="0"
                width="34"
                height="56"
                fill="url(#intro-sweep)"
              />
            </g>
            <path
              className="brand-intro-stroke"
              d={ribbon}
              pathLength={1}
              fill="none"
              stroke="#bfe3ff"
              strokeWidth="1.2"
            />
          </svg>
          <span className="brand-intro-name">
            {'NOSSOM'.split('').map((letter, i) => (
              <span key={i} style={{ animationDelay: `${0.62 + i * 0.05}s` }}>
                {letter}
              </span>
            ))}
          </span>
        </div>
      </div>
    </>
  );
}
