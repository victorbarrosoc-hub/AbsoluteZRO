// Animações do site: revelar ao rolar, números que contam, o palco do topo, as duas demonstrações
// e os exemplos de uso. Cada laço só roda enquanto está na tela; com "reduzir movimento", tudo fica parado.
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  // ───────────── revelar ao rolar ─────────────
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  $$(".reveal").forEach((el) => io.observe(el));

  // ───────────── números que contam ─────────────
  const countIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        countIo.unobserve(e.target);
        const to = +e.target.dataset.count;
        if (reduce || !to) continue;
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / 1600);
          e.target.textContent = Math.round(to * ease(k));
          if (k < 1) requestAnimationFrame(step);
        };
        e.target.textContent = "0";
        requestAnimationFrame(step);
      }
    },
    { rootMargin: "0px 0px -15% 0px" },
  );
  $$("[data-count]").forEach((el) => countIo.observe(el));

  // laço que só roda com o elemento visível
  function loop(el, tick) {
    let raf = 0;
    let last = 0;
    let on = false;
    const frame = (now) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      tick(dt, now);
      raf = requestAnimationFrame(frame);
    };
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !on && !reduce) {
        on = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (!e.isIntersecting && on) {
        on = false;
        cancelAnimationFrame(raf);
      }
    }).observe(el);
  }

  // "fala" simulada: trechos falando e pausas curtas
  function speaker() {
    const s = { talking: true, left: 2.2 };
    s.step = (dt) => {
      s.left -= dt;
      if (s.left <= 0) {
        s.talking = !s.talking;
        s.left = s.talking ? 1.8 + Math.random() * 2.2 : 0.9 + Math.random() * 0.8;
        return true;
      }
      return false;
    };
    return s;
  }

  // ───────────── palco do topo ─────────────
  const stage = $(".stage");
  if (stage) {
    const area = $("#heroArea");
    const text = $("#heroText");
    const voice = $("#heroVoice");
    const label = $("#heroVoiceLabel");
    const bars = $$(".v-bars i", voice);
    const glass = $(".glass", stage);
    const screen = $(".screen", stage);
    const fitToGlass = () => {
      const g = glass.getBoundingClientRect();
      const s = screen.getBoundingClientRect();
      area.style.setProperty("--fit", `${g.top - s.top}px ${s.right - g.right}px ${s.bottom - g.bottom}px ${g.left - s.left}px`);
    };
    fitToGlass();
    addEventListener("resize", fitToGlass);
    if (reduce) area.classList.add("fit");
    let y = 0;
    let v = 0;
    let clock = 0;
    const sp = speaker();
    loop(stage, (dt) => {
      clock += dt;
      // a cada 9 s: começa com margem sobrando e ajusta ao vidro
      const c = clock % 9;
      area.classList.toggle("fit", c > 1.4);
      if (sp.step(dt)) {
        voice.classList.toggle("quiet", !sp.talking);
        label.textContent = sp.talking ? "falando" : "pausa";
      }
      bars.forEach((b, i) => (b.style.height = (sp.talking ? 4 + Math.abs(Math.sin(clock * (6 + i * 1.7) + i)) * 14 : 3) + "px"));
      v += ((sp.talking ? 22 : 0) - v) * Math.min(1, dt * 6);
      y += v * dt;
      if (y > text.scrollHeight / 2) y = 0;
      text.style.transform = `translateY(${-y}px)`;
    });
  }

  // ───────────── demonstração: área do TP ─────────────
  const demoArea = $("#demoArea");
  if (demoArea) {
    const cap = $("#daCap");
    let t = 0;
    let fit = null;
    if (reduce) {
      demoArea.classList.add("fit");
      cap.textContent = "Depois: o texto ocupa todo o vidro.";
    }
    loop(demoArea, (dt) => {
      t += dt;
      const now = t % 6 > 2.2;
      if (now !== fit) {
        fit = now;
        demoArea.classList.toggle("fit", fit);
        cap.textContent = fit ? "Depois: o texto ocupa todo o vidro." : "Antes: o texto perdia 18% de cada lado.";
      }
    });
  }

  // ───────────── demonstração: voz ─────────────
  const demoVoice = $("#demoVoice");
  if (demoVoice) {
    const wave = $("#dvWave");
    const roll = $("#dvRoll");
    const cap = $("#dvCap");
    wave.innerHTML = "<i></i>".repeat(40);
    const bars = $$("i", wave);
    const sp = speaker();
    let y = 0;
    let v = 0;
    let t = 0;
    loop(demoVoice, (dt) => {
      t += dt;
      if (sp.step(dt)) cap.textContent = sp.talking ? "Falando: o texto anda." : "Pausa: o texto espera.";
      bars.forEach((b, i) => {
        const h = sp.talking ? 4 + Math.abs(Math.sin(t * 7 + i * 0.6) * Math.sin(t * 3.1 + i * 0.23)) * 30 : 3;
        b.style.height = h + "px";
      });
      v += ((sp.talking ? 24 : 0) - v) * Math.min(1, dt * 6);
      y += v * dt;
      if (y > roll.scrollHeight * 0.6) y = 0;
      roll.style.transform = `translateY(${-y}px)`;
    });
  }

  // ───────────── exemplos de uso ─────────────
  const USES = {
    reels: {
      device: "phone",
      size: 15,
      title: "Reels de 30 segundos",
      text: "Celular na mão, coluna estreita colada na câmera e meta de 30 s.",
      specs: [["Perfil", "Na mão"], ["Letra", "30"], ["Velocidade", "170 ppm"], ["Meta", "30 s"]],
      lines: ['<span class="sec">Gancho</span>', "Você grava dez vezes o mesmo vídeo?", "<i>[pausa]</i>", "Cole o roteiro e deixe o texto rolar."],
      script: '<span class="k"># Gancho</span>\nVocê grava dez vezes o mesmo vídeo? <span class="c">[pausa]</span>\n<span class="k"># Virada</span>\nCole o roteiro e deixe o texto rolar.\n<span class="n">((mostrar o app aqui))</span>',
    },
    youtube: {
      device: "phone",
      size: 15,
      title: "Vídeo para o YouTube",
      text: "Celular no TP, margem zero no vidro e espelho ligado.",
      specs: [["Perfil", "TP pequeno"], ["Espelho", "Horizontal"], ["Velocidade", "150 ppm"], ["Meta", "Livre"]],
      lines: ['<span class="sec">Abertura</span>', "Fala, pessoal! Hoje tem três dicas.", "A primeira muda tudo.", '<span class="sec">Dica 1</span>'],
      script: '<span class="k"># Abertura</span>\nFala, pessoal! Hoje tem três dicas.\nA primeira muda tudo. <span class="c">[sorria]</span>\n<span class="k"># Dica 1</span>\n…',
    },
    aula: {
      device: "tablet",
      size: 21,
      title: "Aula e palestra",
      text: "iPad no TP grande, letra grande e controle Bluetooth na mão.",
      specs: [["Perfil", "TP grande"], ["Letra", "72"], ["Velocidade", "130 ppm"], ["Controle", "← → blocos"]],
      lines: ['<span class="sec">Introdução</span>', "Bom dia a todos.", "Hoje vamos falar sobre comunicação.", "<i>[respira]</i>"],
      script: '<span class="k"># Introdução</span>\nBom dia a todos. <span class="c">[respira]</span>\nHoje vamos falar sobre comunicação.\n<span class="k"># Parte 1</span>\n…',
    },
    venda: {
      device: "phone",
      size: 15,
      title: "Vídeo de vendas",
      text: "Ênfase nas palavras certas, voz ligada e meta de 1 minuto.",
      specs: [["Ênfase", "**negrito**"], ["Voz", "Ligada"], ["Velocidade", "160 ppm"], ["Meta", "1 min"]],
      lines: ['<span class="sec">Oferta</span>', "Só até sexta.", "Leve <b>dois</b> e pague um.", "<i>[pausa]</i>"],
      script: '<span class="k"># Oferta</span>\nSó até sexta. <span class="c">[pausa]</span>\nLeve <b>**dois**</b> e pague um.\n<span class="n">((mostrar o produto))</span>',
    },
  };
  const panel = $("#usePanel");
  if (panel) {
    const tabs = $$(".uses-tabs [data-use]");
    let current = "reels";
    let auto = true;
    const render = (key) => {
      const u = USES[key];
      $("#useDevice").classList.toggle("tablet", u.device === "tablet");
      $("#udText").style.fontSize = u.size + "px";
      $("#udText").innerHTML = u.lines.concat(u.lines, u.lines).map((l) => `<p>${l}</p>`).join("");
      $("#useTitle").textContent = u.title;
      $("#useText").textContent = u.text;
      $("#useSpecs").innerHTML = u.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
      $("#useScript").innerHTML = u.script;
      tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.use === key)));
    };
    const show = (key) => {
      if (key === current) return;
      current = key;
      if (reduce) return render(key);
      panel.classList.add("swap");
      setTimeout(() => {
        render(key);
        panel.classList.remove("swap");
      }, 260);
    };
    tabs.forEach((t) =>
      t.addEventListener("click", () => {
        auto = false;
        show(t.dataset.use);
      }),
    );
    render(current);
    let t = 0;
    const keys = Object.keys(USES);
    loop(panel, (dt) => {
      if (!auto) return;
      t += dt;
      if (t > 6) {
        t = 0;
        show(keys[(keys.indexOf(current) + 1) % keys.length]);
      }
    });
  }
})();
