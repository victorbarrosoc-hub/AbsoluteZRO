/* global HTMLElement, document, location, URLSearchParams, customElements, CustomEvent, fetch, matchMedia, MutationObserver, addEventListener, removeEventListener, clearTimeout, structuredClone */
/*
 * <zro-set> · o Set da Absolute ZRO dentro de qualquer plataforma do ecossistema (29/10/2026, ADR 0031).
 * Quem da equipe e dos contatos está no Set agora (e em qual app), e as conversas: diretas pelo @ e do projeto. Uma
 * pílula discreta na barra de cima (os rostos de quem está online e o balão das não lidas) abre a folha com Online,
 * Conversas e Ajustes (invisível, quem vê, "visto há", contatos e bloqueados). No HUB, /set mostra a mesma coisa inteira.
 *
 * Uso (o app repassa /api/zro/set/* ao HUB com o token da sessão, escopo zro.set; nada de token no navegador):
 *   <script type="module" src="https://absolutezro.com/set/v1/zro-set.js"></script>
 *   <zro-set api="/api/zro/set"></zro-set>
 *
 * Atributos: api (base, sem barra no fim; no HUB "/api/v1/set"), modo (botao|pagina, padrão botao), tema
 * (claro|escuro|auto; auto segue o html[data-theme] do app ou o sistema), projeto (id do projeto canônico aberto no app:
 * a conversa dele fica no topo), abrir (pessoa:<id> | projeto:<id> | conversa:<id> | ajustes: abre direto).
 * Eventos: zro-set:sem-login (401: o app pede login de novo; a pílula some), zro-set:estado (detail { online, naoLidas }).
 * No modo página, o elemento ganha data-conversa enquanto uma conversa está aberta.
 * Presença: uma batida a cada 45 s com a aba visível ("ativo"), a cada 3 min escondida ("ausente") e "saiu" ao fechar.
 * Com a folha aberta, o estado é relido a cada 12 s; com uma conversa aberta, as mensagens novas a cada 4 s. Toda
 * leitura repetida manda If-None-Match (ETag da API): sem mudança, 304 sem corpo. Nada de serviço pago de tempo real.
 * Sem dependências, sem cookies de terceiros, respeita "reduzir movimento". Mudou, suba VERSAO (vai no data-versao).
 */
export const VERSAO = '2026.10.29-set'

const BATIDA_MS = 45_000
const BATIDA_ESCONDIDA_MS = 180_000
const ESTADO_ABERTO_MS = 12_000
const CONVERSA_MS = 4_000

const CSS = `
:host{--ink:#1d1d1f;--mute:#6e6e73;--faint:#8e8e93;--line:rgb(0 0 0/.08);--line2:rgb(0 0 0/.14);--surf:#fff;--surf2:#f5f5f7;--surf3:#ebebf0;--vidro:rgb(255 255 255/.72);--folha:rgb(250 250 252/.985);--eu:#1d1d1f;--euInk:#fff;--on:#30d158;--aus:#ff9f0a;--perigo:#d70015;--ease:cubic-bezier(.2,.8,.2,1);display:inline-block;position:relative;color:var(--ink);font:inherit;font-size:15px;line-height:1.4;-webkit-font-smoothing:antialiased}
:host([data-escuro]){--ink:#f5f5f7;--mute:#aeaeb2;--faint:#8e8e93;--line:rgb(255 255 255/.1);--line2:rgb(255 255 255/.18);--surf:rgb(255 255 255/.06);--surf2:rgb(255 255 255/.08);--surf3:rgb(255 255 255/.14);--vidro:rgb(40 40 44/.6);--folha:rgb(24 24 27/.985);--eu:#f5f5f7;--euInk:#1d1d1f;--perigo:#ff453a}
:host([modo=pagina]){display:block}
:host([data-fora]){display:none!important}
*{box-sizing:border-box;margin:0}
/* o atributo hidden vale mesmo onde a regra dá display (a lista some quando a conversa abre na folha) */
[hidden]{display:none!important}
button,input,textarea{font:inherit;color:inherit}
button{cursor:pointer}
:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
/* a pílula da barra de cima: vidro, rostos de quem está online e o balão */
.pilula{position:relative;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px 0 6px;border:1px solid var(--line2);border-radius:999px;background:var(--vidro);-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6);box-shadow:inset 0 1px 0 rgb(255 255 255/.35);font-size:.8rem;font-weight:600;letter-spacing:-.01em;white-space:nowrap;transition:border-color .2s,transform .2s var(--ease)}
.pilula:hover{border-color:var(--faint)}.pilula:active{transform:scale(.97)}
.pilula[data-vazia]{padding-left:10px}
.rostos{display:inline-flex}.rostos .av{width:22px;height:22px;font-size:.6rem;margin-left:-7px;box-shadow:0 0 0 2px var(--surf2)}.rostos .av:first-child{margin-left:0}
.ponto{width:7px;height:7px;border-radius:50%;background:var(--on);box-shadow:0 0 0 2px rgb(48 209 88/.18)}
.ponto[data-off]{background:var(--faint);box-shadow:none}
/* no celular, só o rosto (ou o ícone) e o ponto: a barra do app não quebra */
@media (max-width:600px){.pilula{gap:4px;padding:0 8px 0 4px}.pilula[data-vazia]{padding:0 9px}.pilula .num,.rostos .av+.av{display:none}}
.balao{position:absolute;top:-5px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--eu);color:var(--euInk);font-size:.68rem;font-weight:700;line-height:18px;text-align:center;box-shadow:0 0 0 2px var(--surf2)}
/* rosto: foto ou iniciais, com o ponto de presença */
.av{position:relative;flex:none;display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--surf3);color:var(--mute);font-size:.78rem;font-weight:700;overflow:hidden}
.av img{width:100%;height:100%;object-fit:cover}
.av-wrap{position:relative;flex:none}
.av-wrap i{position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;border:2px solid var(--folha);background:var(--on)}
.av-wrap i[data-e=ausente]{background:var(--aus)}.av-wrap i[data-e=offline]{display:none}
.av[data-proj]{border-radius:10px;background:var(--ink);color:var(--surf2)}
:host([data-escuro]) .av[data-proj]{background:var(--surf3);color:var(--ink)}
/* a folha: lateral no computador, de baixo no celular */
.folha{position:fixed;inset:0;z-index:2147483000;pointer-events:none}
.folha[data-on]{pointer-events:auto}
.veu{position:absolute;inset:0;border:0;background:rgb(0 0 0/.22);opacity:0}
.folha[data-on] .veu{opacity:1}
.painel{display:flex;flex-direction:column;min-height:0;color:var(--ink)}
.folha .painel{position:absolute;top:10px;right:10px;bottom:10px;width:min(420px,calc(100vw - 20px));border:1px solid var(--line);border-radius:22px;background:var(--folha);-webkit-backdrop-filter:blur(30px) saturate(1.8);backdrop-filter:blur(30px) saturate(1.8);box-shadow:0 30px 80px rgb(0 0 0/.18);overflow:hidden;translate:calc(100% + 20px) 0;visibility:hidden}
.folha[data-on] .painel{translate:0 0;visibility:visible}
@media (max-width:600px){.folha .painel{top:auto;left:0;right:0;bottom:0;width:100%;height:min(92dvh,760px);border-radius:22px 22px 0 0;translate:0 102%;padding-bottom:env(safe-area-inset-bottom)}}
@media (prefers-reduced-motion:no-preference){.veu{transition:opacity .3s var(--ease)}.folha .painel{transition:translate .42s var(--ease),visibility 0s .42s}.folha[data-on] .painel{transition:translate .42s var(--ease),visibility 0s}.vista{animation:entra .28s var(--ease) both}}
@keyframes entra{from{opacity:0;translate:0 4px}}
/* modo página (/set no HUB): lista e conversa lado a lado quando cabe */
:host([modo=pagina]) .painel{min-height:min(720px,calc(100dvh - 160px));border:1px solid var(--line);border-radius:22px;background:var(--surf);overflow:hidden;container-type:inline-size}
.colunas{flex:1;display:grid;grid-template-columns:minmax(0,1fr);min-height:0}
:host([modo=pagina]) .colunas{grid-template-columns:minmax(280px,360px) minmax(0,1fr)}
:host([modo=pagina]) .col-lista{border-right:1px solid var(--line)}
@container (max-width:720px){.colunas{grid-template-columns:minmax(0,1fr)!important}.colunas[data-conversa] .col-lista{display:none}.colunas:not([data-conversa]) .col-conv{display:none}:host([modo=pagina]) .col-lista{border-right:0}}
.col-lista,.col-conv{display:flex;flex-direction:column;min-height:0;min-width:0}
.vazio-conv{flex:1;display:grid;place-items:center;align-content:center;gap:8px;padding:40px;color:var(--faint);text-align:center}
.vazio-conv b{color:var(--ink);font-size:1.15rem;font-weight:300;letter-spacing:-.02em}.vazio-conv b strong{font-weight:800}
/* cabeçalho e abas */
.cab{display:flex;align-items:center;gap:10px;padding:16px 16px 10px}
.cab h2{flex:1;font-size:1.35rem;line-height:1.1;font-weight:800;letter-spacing:-.03em}
.cab h2 span{font-weight:300}
.ico{flex:none;display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:var(--mute)}
.ico:hover{background:var(--surf3);color:var(--ink)}
.ico[aria-pressed=true]{background:var(--ink);color:var(--surf2)}
.abas{display:flex;gap:4px;margin:0 16px 8px;padding:3px;border-radius:12px;background:var(--surf3)}
.abas button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;border:0;border-radius:9px;background:transparent;color:var(--mute);font-size:.84rem;font-weight:600}
.abas button[aria-selected=true]{background:var(--surf);color:var(--ink);box-shadow:0 1px 3px rgb(0 0 0/.12)}
:host([data-escuro]) .abas button[aria-selected=true]{background:rgb(255 255 255/.16)}
.abas b{min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--eu);color:var(--euInk);font-size:.68rem;line-height:18px}
.rolar{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 8px 16px}
.grupo{padding:14px 10px 6px;color:var(--faint);font-size:.72rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.lista{display:grid;gap:1px;padding:0;list-style:none}
.linha{display:flex;align-items:center;gap:12px;width:100%;min-height:58px;padding:8px 10px;border:0;border-radius:14px;background:transparent;text-align:left}
.linha:hover,.linha[aria-current=true]{background:var(--surf2)}
.linha .txt{flex:1;min-width:0;display:grid;gap:1px}
.linha .nome{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;letter-spacing:-.01em}
.linha .sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mute);font-size:.82rem}
.linha .lado{flex:none;display:grid;justify-items:end;gap:4px;color:var(--faint);font-size:.74rem}
.linha .lado b{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--eu);color:var(--euInk);font-size:.7rem;line-height:20px;text-align:center}
.linha .lado b[data-mudo]{background:var(--surf3);color:var(--mute)}
.linha[data-off] .nome{color:var(--mute);font-weight:500}
.vazio{display:grid;justify-items:center;gap:12px;padding:36px 20px;color:var(--mute);text-align:center}
.vazio .sinal{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--surf3);color:var(--faint)}
/* botões de vidro (como a .glass-btn da central) */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;padding:0 14px;border:1px solid var(--line2);border-radius:999px;background:var(--vidro);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:inset 0 1px 0 rgb(255 255 255/.3);font-size:.84rem;font-weight:600;white-space:nowrap}
.btn:hover{border-color:var(--faint)}
.btn[data-tinta]{border-color:transparent;background:var(--eu);color:var(--euInk);box-shadow:inset 0 1px 0 rgb(255 255 255/.25),0 6px 16px rgb(0 0 0/.16)}
.btn[data-perigo]{color:var(--perigo)}
.btn:disabled{opacity:.4;cursor:default}
.btn-p{min-height:28px;padding:0 11px;font-size:.78rem}
/* conversa */
.conv-cab{display:flex;align-items:center;gap:10px;padding:12px 12px 10px;border-bottom:1px solid var(--line)}
.conv-cab .txt{flex:1;min-width:0}
.conv-cab .nome{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;letter-spacing:-.01em}
.conv-cab .sub{display:block;color:var(--mute);font-size:.78rem}
.msgs{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:3px;padding:14px 14px 10px}
.mais{align-self:center;margin-bottom:8px}
.msg{display:flex;flex-direction:column;align-items:flex-start;max-width:82%}
.msg[data-minha]{align-self:flex-end;align-items:flex-end}
.msg .quem{margin:8px 0 2px 12px;color:var(--faint);font-size:.72rem;font-weight:600}
.bolha{padding:8px 13px;border:0;border-radius:18px;background:var(--surf3);text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.38}
.msg[data-minha] .bolha{background:var(--eu);color:var(--euInk)}
.linha-msg{display:flex;align-items:center;gap:4px;max-width:100%}.msg[data-minha] .linha-msg{flex-direction:row-reverse}
.bolha{cursor:default}
.op{flex:none;display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:50%;background:transparent;color:var(--faint);opacity:0}
.linha-msg:hover .op,.op:focus-visible{opacity:1}.op:hover{background:var(--surf3)}
@media (hover:none){.op{display:none}.bolha{cursor:pointer}}
.msg[data-apagada] .bolha{background:transparent;border:1px dashed var(--line2);color:var(--faint);font-style:italic}
.bolha a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.msg .meta{margin:2px 10px 0;color:var(--faint);font-size:.68rem}
.dia{align-self:center;margin:12px 0 6px;color:var(--faint);font-size:.72rem;font-weight:600}
.compor{display:flex;align-items:flex-end;gap:8px;padding:10px 12px 12px;border-top:1px solid var(--line)}
.compor .campo{flex:1;display:grid;gap:4px}
.compor textarea{width:100%;min-height:40px;max-height:160px;padding:9px 14px;border:1px solid var(--line2);border-radius:20px;outline:0;resize:none;background:var(--surf);font-size:.95rem;line-height:1.35;field-sizing:content}
.compor textarea:focus{border-color:var(--faint)}
.editando{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 6px;color:var(--mute);font-size:.76rem}
.editando button{border:0;background:none;color:var(--ink);font-weight:600}
.enviar{flex:none;display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:50%;background:var(--eu);color:var(--euInk);box-shadow:inset 0 1px 0 rgb(255 255 255/.3),0 6px 16px rgb(0 0 0/.16)}
.enviar:disabled{opacity:.3;cursor:default}
.aviso{margin:8px 14px;padding:10px 12px;border-radius:12px;background:var(--surf3);color:var(--mute);font-size:.82rem;text-align:center}
/* ajustes */
.secao{display:grid;gap:2px;margin:8px 4px 14px;padding:4px;border-radius:16px;background:var(--surf2)}
:host([modo=pagina]) .secao{background:var(--surf2)}
.opcao{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:6px 10px}
.opcao span{display:grid}.opcao small{color:var(--mute);font-size:.78rem}
.chave{position:relative;flex:none;width:44px;height:26px;border:0;border-radius:999px;background:var(--surf3);transition:background .2s}
.chave::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgb(0 0 0/.25);transition:translate .2s var(--ease)}
.chave[aria-checked=true]{background:var(--on)}.chave[aria-checked=true]::after{translate:18px 0}
.escolhas{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:4px 6px 8px}
.escolhas button{min-height:36px;border:1px solid var(--line);border-radius:12px;background:var(--surf);font-size:.82rem;font-weight:600;color:var(--mute)}
.escolhas button[aria-checked=true]{border-color:var(--ink);color:var(--ink)}
.add{display:flex;gap:8px;padding:6px}
.add input{flex:1;min-width:0;height:36px;padding:0 14px;border:1px solid var(--line2);border-radius:999px;outline:0;background:var(--surf)}
.add input:focus{border-color:var(--faint)}
.retorno{padding:0 12px 8px;color:var(--mute);font-size:.8rem}
/* folha de ações (como a action sheet do iOS) */
.acoes{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;justify-content:flex-end;padding:10px;background:rgb(0 0 0/.18)}
.acoes[hidden]{display:none}
.acoes .caixa{display:grid;gap:8px;padding:14px;border-radius:18px;background:var(--folha);-webkit-backdrop-filter:blur(30px);backdrop-filter:blur(30px);box-shadow:0 20px 60px rgb(0 0 0/.25)}
.acoes h3{font-size:.95rem;font-weight:700;text-align:center}
.acoes p{color:var(--mute);font-size:.84rem;text-align:center}
.acoes .btn{width:100%;min-height:42px}
.acoes textarea{width:100%;min-height:60px;padding:10px 12px;border:1px solid var(--line2);border-radius:12px;outline:0;resize:none;background:var(--surf)}
@media (prefers-reduced-motion:no-preference){.acoes .caixa{animation:sobe .3s var(--ease) both}}
@keyframes sobe{from{translate:0 24px;opacity:0}}
.carregando{display:grid;gap:10px;padding:12px}
.carregando i{display:block;height:52px;border-radius:14px;background:var(--surf2)}
@media (prefers-reduced-motion:no-preference){.carregando i{animation:pulsa 1.4s ease-in-out infinite}}
@keyframes pulsa{50%{opacity:.5}}
`

const I = {
  pessoas:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.6-.4 4.6 1.2 5 4"/></svg>',
  fechar:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  voltar:
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  mais: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  ajustes:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  seta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  olho: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.6 2.3-3.2 3.6M6.4 7.6C4.6 8.9 3.3 10.7 2.5 12c1 1.5 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  mudo: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6"/></svg>',
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
/** Texto com links (só http/https), sem HTML. */
function comLinks(t) {
  return esc(t).replace(/\bhttps?:\/\/[^\s<]+/g, (u) => {
    const m = u.match(/^(.*?)([.,;:!?)]*)$/)
    const url = m ? m[1] : u
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${m ? m[2] : ''}`
  })
}
const iniciais = (nome) =>
  String(nome || '?')
    .replace(/^@/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
function av(p, o = {}) {
  const t = o.proj ? `<span class="av" data-proj aria-hidden="true">${esc(iniciais(p.titulo || p.nome))}</span>` : ''
  if (t) return t
  const img = p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-foto>` : esc(iniciais(p.nome))
  return `<span class="av" aria-hidden="true">${img}</span>`
}
function avComPonto(p) {
  return `<span class="av-wrap">${av(p)}<i data-e="${esc(p.estado || 'offline')}"></i></span>`
}

const RTF = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' })
const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const DIA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
function ha(iso) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return RTF.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return RTF.format(-Math.round(s / 3600), 'hour')
  return RTF.format(-Math.round(s / 86400), 'day')
}
function quando(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date().toDateString() === d.toDateString() ? HORA.format(d) : DIA.format(d)
}
/** "no Maestro", "na Absolute ZRO" (a central). */
const noApp = (app) => `${app.id === 'hub' ? 'na' : 'no'} ${app.nome}`
function subDaPessoa(p) {
  if (p.estado === 'online') return p.app ? noApp(p.app) : 'online'
  if (p.estado === 'ausente') return p.app ? `ausente · ${noApp(p.app)}` : 'ausente'
  return p.vistoEm ? `visto ${ha(p.vistoEm)}` : ''
}
const chave = () => (crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Date.now()) + Math.random().toString(36).slice(2))

const QUEM = [
  ['equipe_contatos', 'Equipe e contatos'],
  ['equipe', 'Só a equipe'],
  ['contatos', 'Só contatos'],
  ['ninguem', 'Ninguém'],
]
const MOTIVOS = [
  ['spam', 'Spam'],
  ['assedio', 'Assédio'],
  ['ofensa', 'Ofensa'],
  ['golpe', 'Golpe'],
  ['outro', 'Outro motivo'],
]

class ZroSet extends HTMLElement {
  constructor() {
    super()
    this.s = {
      aberto: false,
      aba: 'online',
      estado: null,
      conversas: null,
      projetos: [],
      contatos: null,
      conv: null,
      msgs: [],
      mais: false,
      editando: null,
      retorno: '',
      semLogin: false,
    }
    this.token = null
    this.etags = new Map()
    this.root = this.attachShadow({ mode: 'open' })
    this.timers = {}
    this.ultimaBatida = 0
  }

  static get observedAttributes() {
    return ['tema', 'modo', 'projeto']
  }
  attributeChangedCallback() {
    if (!this.$) return
    this.aplicarTema()
    this.render()
  }
  get api() {
    return (this.getAttribute('api') || '/api/zro/set').replace(/\/$/, '')
  }
  set api(v) {
    if (v == null || v === '') this.removeAttribute('api')
    else this.setAttribute('api', String(v))
  }
  get tema() {
    return this.getAttribute('tema') || 'auto'
  }
  set tema(v) {
    if (v == null || v === '') this.removeAttribute('tema')
    else this.setAttribute('tema', String(v))
  }
  get pagina() {
    return this.getAttribute('modo') === 'pagina'
  }

  connectedCallback() {
    this.dataset.versao = VERSAO
    this.root.innerHTML = `<style>${CSS}</style><div class="raiz"></div>`
    this.$ = this.root.querySelector('.raiz')
    this.aplicarTema()
    this.mq = matchMedia('(prefers-color-scheme: dark)')
    this.onTema = () => this.aplicarTema()
    this.mq.addEventListener?.('change', this.onTema)
    this.mo = new MutationObserver(this.onTema)
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    this.onVis = () => this.batida(true)
    this.onSai = () => this.sair()
    this.onTecla = (e) => {
      if (e.key === 'Escape' && this.s.aberto && !this.pagina) {
        if (!this.fecharAcoes()) this.fechar()
      }
    }
    document.addEventListener('visibilitychange', this.onVis)
    addEventListener('pagehide', this.onSai)
    addEventListener('keydown', this.onTecla)
    if (this.pagina) this.s.aberto = true
    this.render()
    this.batida(true).then(() => this.abrirPedido())
  }

  disconnectedCallback() {
    for (const t of Object.values(this.timers)) clearTimeout(t)
    // a folha mora no <body> (fora de qualquer barra com transform ou vidro, que prenderia o position: fixed)
    this.folhaHost?.remove()
    this.folhaHost = null
    this.mq?.removeEventListener?.('change', this.onTema)
    this.mo?.disconnect()
    document.removeEventListener('visibilitychange', this.onVis)
    removeEventListener('pagehide', this.onSai)
    removeEventListener('keydown', this.onTecla)
  }

  aplicarTema() {
    const t = this.tema
    const h = document.documentElement
    const doApp =
      h.dataset.theme === 'dark' || h.classList.contains('dark') ? true : h.dataset.theme === 'light' || h.classList.contains('light') ? false : null
    const escuro = t === 'escuro' || (t === 'auto' && (doApp ?? matchMedia('(prefers-color-scheme: dark)').matches))
    this.toggleAttribute('data-escuro', escuro)
    this.folhaHost?.toggleAttribute('data-escuro', escuro)
  }

  // ───────────── rede ─────────────

  async req(caminho, init = {}) {
    const headers = { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) }
    // leitura repetida (o poll): manda a ETag da última resposta; 304 = nada mudou, vale a cópia guardada
    const leitura = !init.method || init.method === 'GET'
    const guardada = leitura ? this.etags.get(caminho) : null
    if (guardada) headers['If-None-Match'] = guardada.etag
    if (typeof this.token === 'function') {
      const t = await this.token()
      if (t) headers.Authorization = `Bearer ${t}`
    } else if (typeof this.token === 'string' && this.token) headers.Authorization = `Bearer ${this.token}`
    const r = await fetch(this.api + caminho, {
      ...init,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
      credentials: this.api.startsWith('/') ? 'same-origin' : 'omit',
      cache: 'no-store',
    })
    if (r.status === 401) {
      if (!this.s.semLogin) {
        this.s.semLogin = true
        this.toggleAttribute('data-fora', !this.pagina)
        this.dispatchEvent(new CustomEvent('zro-set:sem-login', { bubbles: true, composed: true }))
        this.render()
      }
      throw new Error('sem-login')
    }
    if (r.status === 304 && guardada) return structuredClone(guardada.dados)
    if (!r.ok) {
      let msg = 'Não deu certo agora. Tente de novo.'
      try {
        const j = await r.json()
        // a API da Absolute ZRO diz `message`; o repasse de um app pode dizer `mensagem`
        msg = j.message || j.mensagem || msg
      } catch {
        /* sem corpo */
      }
      const e = new Error(msg)
      e.status = r.status
      throw e
    }
    if (r.status === 204) return null
    const dados = await r.json()
    const etag = leitura && r.headers.get('etag')
    if (etag) {
      // poucas leituras diferentes por widget (estado, lista, a conversa aberta): guarda só as últimas
      this.etags.delete(caminho)
      this.etags.set(caminho, { etag, dados: structuredClone(dados) })
      if (this.etags.size > 8) this.etags.delete(this.etags.keys().next().value)
    }
    return dados
  }

  /** A batida de presença (e o estado de volta). `agora`: fora do ritmo (abriu, voltou à aba). */
  /** Escondido pelo app (a barra do celular e a do computador podem ter um cada): este não fala com ninguém. */
  get calado() {
    return !this.pagina && !this.s.aberto && typeof this.checkVisibility === 'function' && !this.hasAttribute('data-fora') && !this.checkVisibility()
  }

  async batida(agora = false) {
    clearTimeout(this.timers.batida)
    if (this.calado) {
      this.timers.batida = setTimeout(() => this.batida(true), BATIDA_MS)
      return
    }
    const visivel = document.visibilityState === 'visible'
    const anterior = this.s.estado
    try {
      if (agora || Date.now() - this.ultimaBatida > (visivel ? BATIDA_MS : BATIDA_ESCONDIDA_MS) - 1000) {
        this.s.estado = await this.req('', { method: 'POST', body: { estado: visivel ? 'ativo' : 'ausente' } })
        this.ultimaBatida = Date.now()
      } else this.s.estado = await this.req('')
      this.s.semLogin = false
      this.toggleAttribute('data-fora', false)
      this.avisar()
      // chegou mensagem: recarrega a lista (e a conversa aberta já se atualiza no ritmo dela)
      if (this.s.aberto && (!anterior || anterior.ultima !== this.s.estado.ultima || anterior.pedidos !== this.s.estado.pedidos)) {
        if (this.s.aba === 'conversas' || this.pagina) this.carregarConversas()
        if (this.s.aba === 'ajustes') this.carregarContatos()
      }
      this.render()
    } catch {
      /* sem login (já tratado) ou rede: tenta no próximo ritmo */
    }
    if (this.s.semLogin) return
    const prox = this.s.aberto && visivel ? ESTADO_ABERTO_MS : visivel ? BATIDA_MS : BATIDA_ESCONDIDA_MS
    this.timers.batida = setTimeout(() => this.batida(), prox)
  }

  sair() {
    if (this.s.semLogin || this.calado) return
    try {
      fetch(this.api, {
        method: 'POST',
        keepalive: true,
        credentials: this.api.startsWith('/') ? 'same-origin' : 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: '{"estado":"saiu"}',
      }).catch(() => {})
    } catch {
      /* fechando */
    }
  }

  avisar() {
    const e = this.s.estado
    if (!e) return
    this.dispatchEvent(
      new CustomEvent('zro-set:estado', {
        bubbles: true,
        composed: true,
        detail: { online: e.pessoas.filter((p) => p.estado === 'online').length, naoLidas: e.naoLidas },
      }),
    )
  }

  async carregarConversas() {
    try {
      const r = await this.req('/conversas')
      this.s.conversas = r.conversas
      this.s.projetos = r.projetos
      this.render()
    } catch {
      /* fica a lista anterior */
    }
  }

  async carregarContatos() {
    try {
      this.s.contatos = await this.req('/contatos')
      this.render()
    } catch {
      /* fica a anterior */
    }
  }

  async abrirPedido() {
    // na página, sem o atributo, vale o endereço (?projeto=, ?pessoa=, ?conversa=, ?ajustes)
    let a = this.getAttribute('abrir') || ''
    if (!a && this.pagina) {
      const q = new URLSearchParams(location.search)
      a = q.has('ajustes') ? 'ajustes' : ['projeto', 'pessoa', 'conversa'].map((k) => (q.get(k) ? `${k}:${q.get(k)}` : '')).find(Boolean) || ''
    }
    const [tipo, id] = a.split(':')
    if (tipo === 'ajustes') return this.irPara('ajustes')
    if (tipo === 'conversa' && id) return this.abrirConversa(id)
    if ((tipo === 'pessoa' || tipo === 'projeto') && id) return this.iniciar({ [tipo]: id })
  }

  // ───────────── navegação ─────────────

  abrir() {
    if (this.s.aberto) return
    this.s.aberto = true
    this.render()
    this.batida(true)
    if (this.s.aba === 'conversas') this.carregarConversas()
    setTimeout(() => this.r.querySelector('.painel .abas [aria-selected=true]')?.focus(), 60)
  }
  fechar() {
    if (this.pagina) return
    this.s.aberto = false
    clearTimeout(this.timers.conv)
    this.render()
    this.batida()
    this.root.querySelector('.pilula')?.focus()
  }
  irPara(aba) {
    this.s.aba = aba
    if (!this.pagina) this.s.conv = null
    clearTimeout(this.timers.conv)
    if (aba === 'conversas') this.carregarConversas()
    if (aba === 'ajustes') this.carregarContatos()
    this.render()
  }

  async iniciar(alvo) {
    try {
      const r = await this.req('/conversas', { method: 'POST', body: alvo })
      await this.abrirConversa(r.conversa.id, r.conversa)
    } catch (e) {
      this.dizer(e.message)
      this.render()
    }
  }

  async abrirConversa(id, resumo) {
    clearTimeout(this.timers.conv)
    this.s.conv = resumo || this.s.conversas?.find((c) => c.id === id) || { id, titulo: '…', tipo: 'direta', podeEscrever: false }
    this.s.msgs = []
    this.s.mais = false
    this.s.editando = null
    this.s.aba = 'conversas'
    this.render(true)
    try {
      const r = await this.req(`/conversas/${encodeURIComponent(id)}`)
      if (this.s.conv?.id !== id) return
      this.s.conv = r.conversa
      this.s.msgs = r.mensagens
      this.s.mais = r.mais
      this.render(true)
      this.marcarLida()
      if (this.pagina) this.carregarConversas()
      this.r.querySelector('.compor textarea')?.focus({ preventScroll: true })
    } catch (e) {
      this.s.conv = null
      this.dizer(e.message)
      this.render()
      return
    }
    this.seguirConversa()
  }

  seguirConversa() {
    clearTimeout(this.timers.conv)
    this.timers.conv = setTimeout(async () => {
      const c = this.s.conv
      if (!c || !this.s.aberto) return
      if (document.visibilityState === 'visible') await this.novas()
      this.seguirConversa()
    }, CONVERSA_MS)
  }

  async novas() {
    const c = this.s.conv
    if (!c) return
    const ultima = this.s.msgs.reduce((m, x) => Math.max(m, x.seq), 0)
    try {
      const r = await this.req(`/conversas/${encodeURIComponent(c.id)}?depois=${ultima}`)
      if (this.s.conv?.id !== c.id) return
      this.s.conv = r.conversa
      const novas = r.mensagens.filter((m) => !this.s.msgs.some((x) => x.id === m.id))
      // edições e apagadas recentes chegam relendo as últimas
      if (novas.length) {
        this.s.msgs = [...this.s.msgs, ...novas]
        this.render(true)
        this.marcarLida()
      } else if (r.conversa.ultima === ultima && Math.random() < 0.25) {
        const r2 = await this.req(`/conversas/${encodeURIComponent(c.id)}?limite=30`)
        if (this.s.conv?.id !== c.id) return
        const porId = new Map(r2.mensagens.map((m) => [m.id, m]))
        let mudou = false
        this.s.msgs = this.s.msgs.map((m) => {
          const n = porId.get(m.id)
          if (n && (n.texto !== m.texto || n.apagada !== m.apagada)) {
            mudou = true
            return n
          }
          return m
        })
        if (mudou) this.render()
      }
    } catch {
      /* tenta no próximo ritmo */
    }
  }

  async antigas() {
    const c = this.s.conv
    const primeira = this.s.msgs[0]
    if (!c || !primeira) return
    try {
      const r = await this.req(`/conversas/${encodeURIComponent(c.id)}?antes=${primeira.seq}`)
      const lista = this.r.querySelector('.msgs')
      const altura = lista?.scrollHeight ?? 0
      this.s.msgs = [...r.mensagens, ...this.s.msgs]
      this.s.mais = r.mais
      this.render()
      const l2 = this.r.querySelector('.msgs')
      if (l2) l2.scrollTop = l2.scrollHeight - altura
    } catch {
      /* fica como está */
    }
  }

  marcarLida() {
    const c = this.s.conv
    const ultima = this.s.msgs.reduce((m, x) => Math.max(m, x.seq), 0)
    if (!c || !ultima || document.visibilityState !== 'visible') return
    if (this.s.estado?.porConversa?.[c.id]) {
      const n = this.s.estado.porConversa[c.id]
      delete this.s.estado.porConversa[c.id]
      if (!c.silenciada) this.s.estado.naoLidas = Math.max(0, this.s.estado.naoLidas - n)
      this.renderPilula()
    }
    const lc = this.s.conversas?.find((x) => x.id === c.id)
    if (lc) lc.naoLidas = 0
    this.req(`/conversas/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: { lidaAte: ultima } }).catch(() => {})
  }

  async enviar() {
    const ta = this.r.querySelector('.compor textarea')
    const c = this.s.conv
    if (!ta || !c) return
    const texto = ta.value.trim()
    if (!texto) return
    const ed = this.s.editando
    ta.value = ''
    this.s.editando = null
    try {
      if (ed) {
        await this.req(`/mensagens/${encodeURIComponent(ed)}`, { method: 'PATCH', body: { texto } })
        this.s.msgs = this.s.msgs.map((m) => (m.id === ed ? { ...m, texto, editadaEm: new Date().toISOString() } : m))
        this.render()
      } else {
        await this.req(`/conversas/${encodeURIComponent(c.id)}/mensagens`, { method: 'POST', body: { texto, chave: chave() } })
        await this.novas()
        if (this.pagina) this.carregarConversas()
      }
    } catch (e) {
      ta.value = texto
      this.dizer(e.message)
      this.render()
    }
    this.r.querySelector('.compor textarea')?.focus()
  }

  // ───────────── folha de ações ─────────────

  acoes(html) {
    const a = this.r.querySelector('.acoes')
    if (!a) return
    a.innerHTML = `<div class="caixa" role="dialog" aria-modal="true">${html}<button class="btn" data-a="cancelar">Cancelar</button></div>`
    a.hidden = false
    a.querySelector('button, textarea')?.focus()
  }
  fecharAcoes() {
    const a = this.r.querySelector('.acoes')
    if (!a || a.hidden) return false
    a.hidden = true
    a.innerHTML = ''
    return true
  }

  menuConversa() {
    const c = this.s.conv
    if (!c) return
    const nome = esc(c.titulo)
    this.acoes(
      `<h3>${nome}</h3>
       <button class="btn" data-a="silenciar">${c.silenciada ? 'Reativar avisos' : 'Silenciar'}</button>
       ${c.tipo === 'direta' && c.pessoa ? `<button class="btn" data-a="pedir-bloqueio">Bloquear</button><button class="btn" data-perigo data-a="pedir-denuncia" data-pessoa="${esc(c.pessoa.id)}">Denunciar</button>` : ''}`,
    )
  }
  menuMensagem(id) {
    const m = this.s.msgs.find((x) => x.id === id)
    if (!m || m.apagada) return
    const recente = Date.now() - new Date(m.criadaEm).getTime() < 24 * 3600_000
    if (m.minha) {
      this.acoes(
        `${recente ? `<button class="btn" data-a="editar" data-id="${esc(id)}">Editar</button>` : ''}<button class="btn" data-perigo data-a="apagar" data-id="${esc(id)}">Apagar</button>`,
      )
    } else {
      this.acoes(
        `<h3>${esc(m.autor.nome)}</h3><button class="btn" data-perigo data-a="pedir-denuncia" data-pessoa="${esc(m.autor.id)}" data-msg="${esc(id)}">Denunciar mensagem</button>`,
      )
    }
  }
  pedirDenuncia(pessoa, msg) {
    this.acoes(
      `<h3>Denunciar</h3><p>A moderação da Absolute ZRO vê o motivo${msg ? ' e a mensagem' : ''}. Ninguém mais.</p>
       <div class="escolhas" role="radiogroup" aria-label="Motivo">${MOTIVOS.map(([k, t], i) => `<button role="radio" aria-checked="${i === 0}" data-motivo="${k}">${t}</button>`).join('')}</div>
       <textarea maxlength="300" placeholder="Conte o que houve (opcional)" aria-label="Detalhe"></textarea>
       <button class="btn" data-tinta data-a="denunciar" data-pessoa="${esc(pessoa)}" data-msg="${esc(msg || '')}">Enviar denúncia</button>`,
    )
  }

  async acao(a, alvo) {
    const s = this.s
    const c = s.conv
    try {
      switch (a) {
        case 'abrir':
          return this.abrir()
        case 'fechar':
          return this.fechar()
        case 'aba':
          return this.irPara(alvo.dataset.aba)
        case 'voltar':
          s.conv = null
          clearTimeout(this.timers.conv)
          this.carregarConversas()
          return this.render()
        case 'pessoa':
          return this.iniciar({ pessoa: alvo.dataset.id })
        case 'projeto':
          return this.iniciar({ projeto: alvo.dataset.id })
        case 'conversa':
          return this.abrirConversa(alvo.dataset.id)
        case 'antigas':
          return this.antigas()
        case 'menu-conversa':
          return this.menuConversa()
        case 'msg':
          return this.menuMensagem(alvo.dataset.id)
        case 'cancelar':
          return this.fecharAcoes()
        case 'cancelar-edicao':
          s.editando = null
          this.r.querySelector('.compor textarea').value = ''
          return this.render()
        case 'silenciar':
          this.fecharAcoes()
          await this.req(`/conversas/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: { silenciada: !c.silenciada } })
          c.silenciada = !c.silenciada
          this.batida()
          return this.render()
        case 'pedir-bloqueio':
          return this.acoes(
            `<h3>Bloquear ${esc(c.pessoa.nome)}?</h3><p>Vocês deixam de se ver no Set e de trocar mensagens. Ninguém é avisado.</p><button class="btn" data-perigo data-a="bloquear" data-id="${esc(c.pessoa.id)}">Bloquear</button>`,
          )
        case 'bloquear':
          this.fecharAcoes()
          await this.req('/bloqueios', { method: 'POST', body: { pessoa: alvo.dataset.id } })
          s.conv = null
          this.dizer('Bloqueado.')
          this.carregarConversas()
          this.carregarContatos()
          return this.batida()
        case 'pedir-denuncia':
          return this.pedirDenuncia(alvo.dataset.pessoa, alvo.dataset.msg)
        case 'denunciar': {
          const caixa = alvo.closest('.caixa')
          const motivo = caixa.querySelector('[data-motivo][aria-checked=true]')?.dataset.motivo || 'outro'
          const detalhe = caixa.querySelector('textarea')?.value || ''
          await this.req('/denuncias', { method: 'POST', body: { pessoa: alvo.dataset.pessoa, mensagem: alvo.dataset.msg || undefined, motivo, detalhe } })
          return this.acoes(`<h3>Denúncia enviada</h3><p>Obrigado. Se quiser, bloqueie também.</p>`)
        }
        case 'editar': {
          this.fecharAcoes()
          const m = s.msgs.find((x) => x.id === alvo.dataset.id)
          s.editando = m.id
          this.render()
          const ta = this.r.querySelector('.compor textarea')
          ta.value = m.texto
          return ta.focus()
        }
        case 'apagar':
          this.fecharAcoes()
          await this.req(`/mensagens/${encodeURIComponent(alvo.dataset.id)}`, { method: 'DELETE' })
          s.msgs = s.msgs.map((m) => (m.id === alvo.dataset.id ? { ...m, texto: null, apagada: true } : m))
          return this.render()
        case 'invisivel':
          return this.preferir({ invisivel: !s.estado?.eu.preferencias.invisivel })
        case 'quem':
          return this.preferir({ quemVe: alvo.dataset.v })
        case 'visto':
          return this.preferir({ mostrarVisto: !s.estado?.eu.preferencias.mostrarVisto })
        case 'aceitar':
        case 'recusar':
          await this.req(`/contatos/${encodeURIComponent(alvo.dataset.id)}`, { method: 'PUT', body: { acao: a } })
          this.dizer(a === 'aceitar' ? 'Agora vocês são contatos.' : '')
          this.carregarContatos()
          return this.batida(true)
        case 'remover':
          await this.req(`/contatos/${encodeURIComponent(alvo.dataset.id)}`, { method: 'DELETE' })
          this.carregarContatos()
          return this.batida(true)
        case 'desbloquear':
          await this.req(`/bloqueios/${encodeURIComponent(alvo.dataset.id)}`, { method: 'DELETE' })
          this.carregarContatos()
          return this.batida(true)
      }
    } catch (e) {
      if (e.message === 'sem-login') return
      this.fecharAcoes()
      this.dizer(e.message)
      this.render()
    }
  }

  async preferir(p) {
    const e = this.s.estado
    if (!e) return
    const antes = { ...e.eu.preferencias }
    Object.assign(e.eu.preferencias, p)
    this.render()
    try {
      const r = await this.req('/preferencias', { method: 'PUT', body: p })
      e.eu.preferencias = r.preferencias
      this.batida(true)
    } catch (err) {
      e.eu.preferencias = antes
      this.dizer(err.message)
      this.render()
    }
  }

  async pedirContato(form) {
    const input = form.querySelector('input')
    const arroba = input.value.trim()
    if (!arroba) return
    try {
      const r = await this.req('/contatos', { method: 'POST', body: { arroba } })
      input.value = ''
      this.dizer(r.estado === 'aceito' ? `Agora vocês são contatos.` : `Pedido enviado para @${arroba.replace(/^@/, '')}.`)
      this.carregarContatos()
      this.batida(true)
    } catch (e) {
      this.dizer(e.message)
      this.render()
    }
  }

  /** Um aviso curto no topo da lista (erro ou confirmação). */
  dizer(msg) {
    this.s.retorno = msg || ''
    this.s.retornoAte = Date.now() + 5000
    clearTimeout(this.timers.retorno)
    if (msg) this.timers.retorno = setTimeout(() => this.render(), 5100)
  }

  // ───────────── desenho ─────────────

  render(rolarAoFim = false) {
    if (!this.$) return
    if (!this.$.dataset.montado) this.montar()
    // na página, o app sabe quando uma conversa está aberta (no celular a página dá a tela inteira para ela)
    if (this.pagina) this.toggleAttribute('data-conversa', !!this.s.conv)
    this.renderPilula()
    const folha = this.r.querySelector('.folha')
    if (folha) {
      folha.toggleAttribute('data-on', this.s.aberto)
      folha.setAttribute('aria-hidden', String(!this.s.aberto))
    }
    if (!this.s.aberto) return
    this.renderLista()
    this.renderConversa(rolarAoFim)
  }

  montar() {
    this.$.dataset.montado = '1'
    const painel = `<section class="painel" aria-label="Set">
        <div class="colunas"><div class="col-lista"></div><div class="col-conv"></div></div>
        <div class="acoes" hidden></div>
      </section>`
    if (this.pagina) {
      this.$.innerHTML = painel
      this.r = this.root
      this.ouvir(this.$)
      return
    }
    this.$.innerHTML = `<button class="pilula" data-a="abrir" aria-haspopup="dialog"></button>`
    this.ouvir(this.$)
    // a folha vai para o <body>: dentro da barra do app, um ancestral com transform ou backdrop-filter prenderia o
    // position: fixed (no Safari do iPhone ela abria fora da tela)
    this.folhaHost?.remove()
    const host = document.createElement('zro-set-folha')
    host.dataset.versao = VERSAO
    host.toggleAttribute('data-escuro', this.hasAttribute('data-escuro'))
    host.style.cssText = 'display:contents'
    this.r = host.attachShadow({ mode: 'open' })
    this.r.innerHTML = `<style>${CSS}</style><div class="raiz"><div class="folha" aria-hidden="true"><button class="veu" data-a="fechar" tabindex="-1" aria-label="Fechar"></button>${painel.replace('<section class="painel"', '<section class="painel" role="dialog" aria-modal="true"')}</div></div>`
    document.body.append(host)
    this.folhaHost = host
    this.ouvir(this.r.querySelector('.raiz'))
  }

  /** Os cliques, envios e teclas de uma parte do widget (a pílula, a folha ou a página). */
  ouvir(raiz) {
    raiz.addEventListener('click', (ev) => {
      const r = ev.target.closest('[data-motivo]')
      if (r) {
        for (const b of r.parentElement.querySelectorAll('[data-motivo]')) b.setAttribute('aria-checked', String(b === r))
        return
      }
      // link dentro da mensagem abre direto (o toque fora dele, na bolha, abre as opções)
      if (ev.target.closest('a[href]')) return
      const alvo = ev.target.closest('[data-a]')
      if (!alvo || !raiz.contains(alvo)) return
      // no computador as opções da mensagem ficam no botão ao lado (clicar na bolha deixa selecionar o texto)
      if (alvo.classList.contains('bolha') && matchMedia('(hover: hover)').matches) return
      ev.preventDefault()
      this.acao(alvo.dataset.a, alvo)
    })
    raiz.addEventListener('submit', (ev) => {
      ev.preventDefault()
      if (ev.target.matches('.compor')) this.enviar()
      else if (ev.target.matches('.add')) this.pedirContato(ev.target)
    })
    raiz.addEventListener('keydown', (ev) => {
      if (ev.target.matches('.compor textarea') && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault()
        this.enviar()
      }
    })
    raiz.addEventListener(
      'error',
      (ev) => {
        if (ev.target.matches?.('img[data-foto]')) ev.target.remove()
      },
      true,
    )
  }

  renderPilula() {
    const b = this.root.querySelector('.pilula')
    const e = this.s.estado
    if (!b) return
    const online = e ? e.pessoas.filter((p) => p.estado === 'online') : []
    const nl = e?.naoLidas ?? 0
    const ped = e?.pedidos ?? 0
    const inv = e?.eu.preferencias.invisivel
    const rostos = online
      .slice(0, 3)
      .map((p) => av(p))
      .join('')
    b.toggleAttribute('data-vazia', !online.length)
    b.innerHTML = `${online.length ? `<span class="rostos">${rostos}</span>` : I.pessoas}<span class="ponto"${online.length && !inv ? '' : ' data-off'}></span><span class="num">${online.length ? online.length : 'Set'}</span>${nl + ped ? `<span class="balao">${nl + ped > 99 ? '99+' : nl + ped}</span>` : ''}`
    b.setAttribute(
      'aria-label',
      `Set: ${online.length ? `${online.length} ${online.length === 1 ? 'pessoa online' : 'pessoas online'}` : 'ninguém online'}${nl ? `, ${nl} ${nl === 1 ? 'mensagem nova' : 'mensagens novas'}` : ''}${ped ? `, ${ped} ${ped === 1 ? 'pedido' : 'pedidos'} de contato` : ''}${inv ? ', você está invisível' : ''}`,
    )
    b.title = 'Set: quem está online e as conversas'
  }

  renderLista() {
    const col = this.r.querySelector('.col-lista')
    const colunas = this.r.querySelector('.colunas')
    if (!col) return
    colunas.toggleAttribute('data-conversa', !!this.s.conv)
    // no modo folha, com uma conversa aberta, a lista dá lugar a ela
    col.hidden = !this.pagina && !!this.s.conv
    if (col.hidden) return
    const s = this.s
    const e = s.estado
    const nl = e?.naoLidas ?? 0
    const ped = e?.pedidos ?? 0
    const inv = e?.eu.preferencias.invisivel
    const cab = `<header class="cab"><h2>Set</h2>
        <button class="ico" data-a="invisivel" aria-pressed="${!!inv}" title="${inv ? 'Você está invisível' : 'Ficar invisível'}" aria-label="Invisível">${I.olho}</button>
        ${this.pagina ? '' : `<button class="ico" data-a="fechar" aria-label="Fechar" title="Fechar">${I.fechar}</button>`}</header>
      <div class="abas" role="tablist">
        <button role="tab" data-a="aba" data-aba="online" aria-selected="${s.aba === 'online'}">Online</button>
        <button role="tab" data-a="aba" data-aba="conversas" aria-selected="${s.aba === 'conversas'}">Conversas${nl ? ` <b>${nl > 99 ? '99+' : nl}</b>` : ''}</button>
        <button role="tab" data-a="aba" data-aba="ajustes" aria-selected="${s.aba === 'ajustes'}" aria-label="Contatos e ajustes" title="Contatos e ajustes">${I.ajustes}${ped ? ` <b>${ped}</b>` : ''}</button>
      </div>`
    // o aviso fica 5 s (as releituras que vêm logo depois não o apagam)
    if (s.retorno && Date.now() > s.retornoAte) s.retorno = ''
    const retorno = s.retorno ? `<p class="aviso" role="status">${esc(s.retorno)}</p>` : ''
    let corpo = ''
    if (s.semLogin) corpo = `<div class="vazio"><span class="sinal">${I.pessoas}</span><p>Entre de novo para ver o Set.</p></div>`
    else if (!e) corpo = '<div class="carregando" aria-busy="true"><i></i><i></i><i></i></div>'
    else if (s.aba === 'online') corpo = this.htmlOnline(e)
    else if (s.aba === 'conversas') corpo = this.htmlConversas()
    else corpo = this.htmlAjustes(e)
    const rolar = col.querySelector('.rolar')
    const topo = rolar?.scrollTop ?? 0
    const foco = this.r.activeElement
    const valor = foco?.matches?.('.add input') ? foco.value : null
    col.innerHTML = `${cab}${retorno}<div class="rolar vista" data-aba="${s.aba}">${corpo}</div>`
    const r2 = col.querySelector('.rolar')
    if (rolar && rolar.dataset?.aba === s.aba) {
      r2.scrollTop = topo
      r2.classList.remove('vista')
    }
    if (valor !== null) {
      const i = col.querySelector('.add input')
      if (i) {
        i.value = valor
        i.focus()
      }
    }
  }

  htmlOnline(e) {
    const on = e.pessoas.filter((p) => p.estado !== 'offline')
    const off = e.pessoas.filter((p) => p.estado === 'offline').slice(0, 60)
    const linha = (p) =>
      `<li><button class="linha" data-a="pessoa" data-id="${esc(p.id)}"${p.estado === 'offline' ? ' data-off' : ''}>${avComPonto(p)}<span class="txt"><span class="nome">${esc(p.nome)}</span>${subDaPessoa(p) ? `<span class="sub">${esc(subDaPessoa(p))}</span>` : ''}</span></button></li>`
    if (!e.pessoas.length)
      return `<div class="vazio"><span class="sinal">${I.pessoas}</span><p>Sua equipe e seus contatos aparecem aqui.</p><button class="btn" data-a="aba" data-aba="ajustes">Adicionar pelo @</button></div>`
    return `${on.length ? `<p class="grupo">Agora</p><ul class="lista">${on.map(linha).join('')}</ul>` : `<div class="vazio"><p>Ninguém online agora.</p></div>`}${off.length ? `<p class="grupo">Equipe e contatos</p><ul class="lista">${off.map(linha).join('')}</ul>` : ''}`
  }

  htmlConversas() {
    const s = this.s
    if (!s.conversas) {
      if (!this.carregandoConversas) {
        this.carregandoConversas = true
        this.carregarConversas().finally(() => (this.carregandoConversas = false))
      }
      return '<div class="carregando" aria-busy="true"><i></i><i></i><i></i></div>'
    }
    const atual = this.getAttribute('projeto')
    const doProjeto = atual && !s.conversas.some((c) => c.projeto?.id === atual) ? s.projetos.find((p) => p.id === atual) : null
    const linha = (c) => {
      const prev = c.previa === null ? (c.ultima ? 'Mensagem apagada' : 'Nova conversa') : `${c.previaMinha ? 'Você: ' : ''}${c.previa}`
      return `<li><button class="linha" data-a="conversa" data-id="${esc(c.id)}"${s.conv?.id === c.id ? ' aria-current="true"' : ''}>${c.tipo === 'projeto' ? av({ titulo: c.titulo }, { proj: true }) : av(c.pessoa || { nome: c.titulo })}<span class="txt"><span class="nome">${esc(c.titulo)}</span><span class="sub">${esc(prev)}</span></span><span class="lado"><time>${esc(quando(c.ultimaEm))}</time>${c.naoLidas ? `<b${c.silenciada ? ' data-mudo' : ''}>${c.naoLidas > 99 ? '99+' : c.naoLidas}</b>` : c.silenciada ? I.mudo : ''}</span></button></li>`
    }
    const projetos = (doProjeto ? [doProjeto, ...s.projetos.filter((p) => p.id !== atual)] : s.projetos).slice(0, 6)
    const novos = projetos.length
      ? `<p class="grupo">Projetos</p><ul class="lista">${projetos.map((p) => `<li><button class="linha" data-a="projeto" data-id="${esc(p.id)}">${av({ titulo: p.titulo }, { proj: true })}<span class="txt"><span class="nome">${esc(p.titulo)}</span><span class="sub">${p.id === atual ? 'Este projeto · começar conversa' : 'Começar conversa'}</span></span></button></li>`).join('')}</ul>`
      : ''
    if (!s.conversas.length) return `<div class="vazio"><span class="sinal">${I.pessoas}</span><p>Toque em alguém online para conversar.</p></div>${novos}`
    return `<ul class="lista">${s.conversas.map(linha).join('')}</ul>${novos}`
  }

  htmlAjustes(e) {
    const p = e.eu.preferencias
    const c = this.s.contatos
    const pessoa = (x, botoes) =>
      `<li class="linha">${av(x)}<span class="txt"><span class="nome">${esc(x.nome)}</span>${x.arroba ? `<span class="sub">@${esc(x.arroba)}</span>` : ''}</span><span class="lado" style="display:flex;gap:6px">${botoes}</span></li>`
    const bloco = (titulo, lista, botoes) =>
      lista?.length ? `<p class="grupo">${titulo}</p><ul class="lista">${lista.map((x) => pessoa(x, botoes(x))).join('')}</ul>` : ''
    return `<div class="secao">
        <div class="opcao"><span>Invisível<small>Ninguém vê você online.</small></span><button class="chave" role="switch" aria-checked="${p.invisivel}" data-a="invisivel" aria-label="Invisível"></button></div>
      </div>
      <p class="grupo">Quem vê você online</p>
      <div class="secao"><div class="escolhas" role="radiogroup" aria-label="Quem vê você online">${QUEM.map(([k, t]) => `<button role="radio" aria-checked="${p.quemVe === k}" data-a="quem" data-v="${k}">${t}</button>`).join('')}</div>
        <div class="opcao"><span>Mostrar “visto há”</span><button class="chave" role="switch" aria-checked="${p.mostrarVisto}" data-a="visto" aria-label="Mostrar visto há"></button></div>
      </div>
      <p class="grupo">Adicionar pelo @</p>
      <form class="add secao"><input name="arroba" placeholder="@fulano" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="@ da pessoa"><button class="btn" data-tinta type="submit">Pedir</button></form>
      ${
        !c
          ? '<div class="carregando" aria-busy="true"><i></i></div>'
          : `${bloco('Pedidos', c.recebidos, (x) => `<button class="btn btn-p" data-tinta data-a="aceitar" data-id="${esc(x.id)}">Aceitar</button><button class="btn btn-p" data-a="recusar" data-id="${esc(x.id)}">Recusar</button>`)}
        ${bloco('Contatos', c.contatos, (x) => `<button class="btn btn-p" data-a="pessoa" data-id="${esc(x.id)}">Conversar</button><button class="btn btn-p" data-a="remover" data-id="${esc(x.id)}" aria-label="Remover ${esc(x.nome)}">Remover</button>`)}
        ${bloco('Enviados', c.enviados, (x) => `<button class="btn btn-p" data-a="remover" data-id="${esc(x.id)}">Cancelar</button>`)}
        ${bloco('Bloqueados', c.bloqueados, (x) => `<button class="btn btn-p" data-a="desbloquear" data-id="${esc(x.id)}">Desbloquear</button>`)}`
      }`
  }

  renderConversa(rolarAoFim) {
    const col = this.r.querySelector('.col-conv')
    if (!col) return
    const c = this.s.conv
    col.hidden = !this.pagina && !c
    if (!c) {
      if (this.pagina) col.innerHTML = `<div class="vazio-conv"><b>O <strong>Set</strong> da sua equipe.</b><span>Escolha alguém ou uma conversa.</span></div>`
      else col.innerHTML = ''
      return
    }
    let cab = col.querySelector('.conv-cab')
    if (!cab || col.dataset.id !== c.id) {
      col.dataset.id = c.id
      col.innerHTML = `<header class="conv-cab"></header><div class="msgs" role="log" aria-live="polite" aria-label="Mensagens"></div>
        <form class="compor"><div class="campo"><div class="editando" hidden></div><textarea rows="1" maxlength="4000" placeholder="Mensagem" aria-label="Mensagem"></textarea></div><button class="enviar" type="submit" aria-label="Enviar">${I.seta}</button></form>`
      cab = col.querySelector('.conv-cab')
      rolarAoFim = true
    }
    const pessoaNoSet = c.pessoa && this.s.estado?.pessoas.find((p) => p.id === c.pessoa.id)
    const sub = c.tipo === 'projeto' ? 'Conversa do projeto' : pessoaNoSet ? subDaPessoa(pessoaNoSet) : c.pessoa?.arroba ? `@${c.pessoa.arroba}` : ''
    cab.innerHTML = `${this.pagina && !matchMedia('(max-width: 720px)').matches ? '' : `<button class="ico" data-a="voltar" aria-label="Voltar">${I.voltar}</button>`}${c.tipo === 'projeto' ? av({ titulo: c.titulo }, { proj: true }) : pessoaNoSet ? avComPonto(pessoaNoSet) : av(c.pessoa || { nome: c.titulo })}
      <span class="txt"><span class="nome">${esc(c.titulo)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span>
      <button class="ico" data-a="menu-conversa" aria-label="Opções da conversa">${I.mais}</button>`
    const lista = col.querySelector('.msgs')
    const noFim = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80
    let html = this.s.mais ? `<button class="btn btn-p mais" data-a="antigas">Mensagens anteriores</button>` : ''
    let diaAnterior = ''
    let autorAnterior = ''
    for (const m of this.s.msgs) {
      const d = new Date(m.criadaEm)
      const dia = d.toDateString()
      if (dia !== diaAnterior) {
        html += `<p class="dia">${new Date().toDateString() === dia ? 'Hoje' : esc(DIA_LONGO.format(d))}</p>`
        diaAnterior = dia
        autorAnterior = ''
      }
      const quem = c.tipo === 'projeto' && !m.minha && autorAnterior !== m.autor.id ? `<span class="quem">${esc(m.autor.nome)}</span>` : ''
      autorAnterior = m.autor.id
      const op = m.apagada ? '' : `<button class="op" data-a="msg" data-id="${esc(m.id)}" aria-label="Opções da mensagem">${I.mais}</button>`
      html += `<div class="msg"${m.minha ? ' data-minha' : ''}${m.apagada ? ' data-apagada' : ''}>${quem}<div class="linha-msg"><div class="bolha" data-a="msg" data-id="${esc(m.id)}" title="${esc(HORA.format(d))}${m.editadaEm ? ' · editada' : ''}">${m.apagada ? 'Mensagem apagada' : comLinks(m.texto)}</div>${op}</div>${m.editadaEm && !m.apagada ? '<span class="meta">editada</span>' : ''}</div>`
    }
    if (!this.s.msgs.length) html += `<div class="vazio"><p>${c.tipo === 'projeto' ? 'A conversa do projeto começa aqui.' : 'Diga oi.'}</p></div>`
    lista.innerHTML = html
    if (rolarAoFim || noFim) lista.scrollTop = lista.scrollHeight
    const form = col.querySelector('.compor')
    const ta = form.querySelector('textarea')
    const ed = form.querySelector('.editando')
    ed.hidden = !this.s.editando
    ed.innerHTML = this.s.editando ? `<span>Editando</span><button type="button" data-a="cancelar-edicao">Cancelar</button>` : ''
    const pode = c.podeEscrever !== false
    ta.disabled = !pode
    ta.placeholder = pode ? 'Mensagem' : 'Você não pode escrever aqui.'
    form.querySelector('.enviar').disabled = !pode
  }

  // propriedades úteis para os apps
  abrirSet() {
    this.abrir()
  }
}

if (!customElements.get('zro-set')) customElements.define('zro-set', ZroSet)
