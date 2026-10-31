/**
 * AS REGRAS DO QUE ENTRA NO BANCO (28/out) — perfil e item de inventário,
 * conferidos à mão (o Carro não carrega zod), PUROS e testados.
 *
 * ⚠️ Estritos: campo que não está na lista é RECUSADO, nunca ignorado em
 * silêncio. Telefone, WhatsApp, CPF e e-mail têm recusa própria (`proibido`):
 * o contato fica pelo app (restrição nº 1 do CLAUDE.md). Texto livre com
 * sequência com jeito de telefone também é recusado (`telefone`), e o banco
 * confere de novo (carro_do_freela.tem_telefone).
 * ⚠️ Catálogos — ninguém digita: funções vêm da base (`src/crew.json`, as
 * mesmas do app) e nichos de `TIPOS` (o mesmo do template; a suíte confere).
 * ⚠️ Diária é OPCIONAL e só a pessoa escreve a dela: nenhum valor é sugerido.
 */
const CREW = require('../src/crew.json');

const FUNCOES = [...new Set(CREW.flatMap(c => c.func || []))].filter(f => f && f !== 'Não informado');
const TIPOS = [
  'Corporativo', 'Institucional', 'Publicidade', 'Conteúdo para redes',
  'Casamento', 'Festa e evento', 'Show / DVD', 'Clipe',
  'Documentário', 'Imobiliário', 'Moda', 'Esporte',
  'Gastronomia', 'Educacional', 'Cobertura de congresso',
];
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const CATEGORIAS = ['camera', 'lente', 'audio', 'luz', 'drone', 'estabilizador', 'monitor', 'acessorio', 'outro'];
const VISIBILIDADES = ['privado', 'contratantes'];
const DIARIA_MAX = 100000000000;

/* o mesmo padrão do banco (carro_do_freela.tem_telefone) e da varredura sem-nome-real */
const TELEFONE = /(\+?55[\s.-]*)?\(?[1-9][0-9]\)?[\s.-]*9?[\s.-]*[0-9]{4}[\s.-]*[0-9]{4}/;
const CAMPO_PROIBIDO = /tel|fone|phone|whats|zap|celular|cpf|cnpj|rg$|documento|e-?mail/i;
const CONTROLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

class Recusa extends Error {
  constructor(erro, campo) {
    super(erro + (campo ? ':' + campo : ''));
    this.erro = erro;
    this.campo = campo || null;
  }
}

function objeto(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Recusa('pedido');
  return v;
}
function soEstes(corpo, aceitos) {
  for (const k of Object.keys(corpo)) {
    if (aceitos.includes(k)) continue;
    throw new Recusa(CAMPO_PROIBIDO.test(k) ? 'proibido' : 'campo', k.slice(0, 40));
  }
}
/** texto: aparado, sem caractere de controle, sem telefone, no tamanho; vazio = null (se opcional) */
function texto(v, campo, max, { obrigatorio = false, linhas = false } = {}) {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
    if (obrigatorio) throw new Recusa('obrigatorio', campo);
    return null;
  }
  if (typeof v !== 'string') throw new Recusa('tipo', campo);
  const t = linhas ? v.replace(/\r\n?/g, '\n').trim() : v.replace(/\s+/g, ' ').trim();
  if (CONTROLE.test(t)) throw new Recusa('tipo', campo);
  if ([...t].length > max) throw new Recusa('tamanho', campo);
  if (TELEFONE.test(t)) throw new Recusa('telefone', campo);
  return t;
}
function doCatalogo(v, campo, catalogo, max) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) throw new Recusa(Array.isArray(v) ? 'tamanho' : 'tipo', campo);
  const saida = [];
  for (const x of v) {
    if (typeof x !== 'string' || !catalogo.includes(x)) throw new Recusa('catalogo', campo);
    if (!saida.includes(x)) saida.push(x);
  }
  return saida;
}

/** PUT /api/zro/perfil — o perfil inteiro (o que não vem volta ao vazio) */
function perfilDe(corpo) {
  corpo = objeto(corpo);
  soEstes(corpo, ['nome', 'cidade', 'uf', 'funcoes', 'nichos', 'bio', 'portfolio', 'visibilidade']);
  const uf = corpo.uf === undefined || corpo.uf === null || corpo.uf === '' ? null : String(corpo.uf).toUpperCase();
  if (uf !== null && (typeof corpo.uf !== 'string' || !UFS.includes(uf))) throw new Recusa('uf', 'uf');
  let portfolio = texto(corpo.portfolio, 'portfolio', 300);
  if (portfolio !== null) {
    let u;
    try { u = new URL(portfolio) } catch (e) { throw new Recusa('link', 'portfolio') }
    if (u.protocol !== 'https:' || !/\./.test(u.hostname) || u.username || u.password) throw new Recusa('link', 'portfolio');
    if (/(^|\.)(wa\.me|whatsapp\.com)$/i.test(u.hostname)) throw new Recusa('proibido', 'portfolio');
    portfolio = u.toString();
  }
  const visibilidade = corpo.visibilidade === undefined ? 'privado' : corpo.visibilidade;
  if (!VISIBILIDADES.includes(visibilidade)) throw new Recusa('visibilidade', 'visibilidade');
  return {
    nome_exibicao: texto(corpo.nome, 'nome', 80, { obrigatorio: true }),
    cidade: texto(corpo.cidade, 'cidade', 80),
    uf,
    funcoes: doCatalogo(corpo.funcoes, 'funcoes', FUNCOES, 12),
    nichos: doCatalogo(corpo.nichos, 'nichos', TIPOS, 12),
    bio: texto(corpo.bio, 'bio', 280, { linhas: true }),
    portfolio_url: portfolio,
    visibilidade,
  };
}

const CAMPOS_ITEM = ['categoria', 'marca', 'modelo', 'quantidade', 'observacao', 'diaria_cents', 'ativo'];
function inteiro(v, campo, min, max) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Recusa('numero', campo);
  return v;
}
/**
 * POST (novo = true: tudo, com padrões) ou PATCH (só o que veio) de um item.
 * Devolve só as colunas do banco que mudam.
 */
function itemDe(corpo, { novo }) {
  corpo = objeto(corpo);
  soEstes(corpo, CAMPOS_ITEM);
  const s = {};
  const tem = k => Object.prototype.hasOwnProperty.call(corpo, k);
  if (novo || tem('categoria')) {
    const c = corpo.categoria === undefined ? 'outro' : corpo.categoria;
    if (!CATEGORIAS.includes(c)) throw new Recusa('categoria', 'categoria');
    s.categoria = c;
  }
  if (novo || tem('modelo')) s.modelo = texto(corpo.modelo, 'modelo', 120, { obrigatorio: true });
  if (novo || tem('marca')) s.marca = texto(corpo.marca, 'marca', 60);
  if (novo || tem('observacao')) s.observacao = texto(corpo.observacao, 'observacao', 500, { linhas: true });
  if (novo || tem('quantidade')) s.quantidade = corpo.quantidade === undefined ? 1 : inteiro(corpo.quantidade, 'quantidade', 1, 999);
  if (novo || tem('diaria_cents')) s.diaria_cents = corpo.diaria_cents === undefined || corpo.diaria_cents === null ? null : inteiro(corpo.diaria_cents, 'diaria_cents', 0, DIARIA_MAX);
  if (novo || tem('ativo')) {
    if (corpo.ativo !== undefined && typeof corpo.ativo !== 'boolean') throw new Recusa('tipo', 'ativo');
    s.ativo = corpo.ativo === undefined ? true : corpo.ativo;
  }
  if (!novo && !Object.keys(s).length) throw new Recusa('vazio');
  return s;
}

const iso = d => (d instanceof Date ? d.toISOString() : d === null || d === undefined ? null : String(d));
/** linha do banco → o que a API devolve (nada além disso sai) */
function perfilSaida(l) {
  if (!l) return null;
  return {
    nome: l.nome_exibicao, cidade: l.cidade, uf: l.uf, funcoes: l.funcoes || [], nichos: l.nichos || [],
    bio: l.bio, portfolio: l.portfolio_url, visibilidade: l.visibilidade, arroba: l.arroba || null,
    atualizado_em: iso(l.atualizado_em),
  };
}
function itemSaida(l) {
  return {
    id: l.id, categoria: l.categoria, marca: l.marca, modelo: l.modelo, quantidade: l.quantidade,
    observacao: l.observacao, diaria_cents: l.diaria_cents === null || l.diaria_cents === undefined ? null : Number(l.diaria_cents),
    ativo: l.ativo, atualizado_em: iso(l.atualizado_em),
  };
}

/* ---------------- agenda ---------------- */

const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** 'YYYY-MM-DD' de verdade (nada de 2026-02-31) */
function diaDe(v, campo = 'dia') {
  if (typeof v !== 'string' || !DIA.test(v)) throw new Recusa('dia', campo);
  const d = new Date(v + 'T12:00:00Z');
  if (isNaN(d) || d.toISOString().slice(0, 10) !== v) throw new Recusa('dia', campo);
  return v;
}
/**
 * PUT /api/zro/agenda — UM dia declarado: { dia, estado: fechado|negociando, parte?: dia|manha|tarde, hora?: "HH:MM" }.
 * Livre não se declara: é o DELETE do dia (como `liberarDia()` no app). A hora só vale na meia diária.
 */
function agendaDe(corpo) {
  corpo = objeto(corpo);
  soEstes(corpo, ['dia', 'estado', 'parte', 'hora']);
  const dia = diaDe(corpo.dia);
  if (!['fechado', 'negociando'].includes(corpo.estado)) throw new Recusa('estado', 'estado');
  const parte = corpo.parte === undefined || corpo.parte === null ? 'dia' : corpo.parte;
  if (!['dia', 'manha', 'tarde'].includes(parte)) throw new Recusa('parte', 'parte');
  let hora = corpo.hora === undefined || corpo.hora === null || corpo.hora === '' ? null : corpo.hora;
  if (hora !== null) {
    if (typeof hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Recusa('hora', 'hora');
    if (parte === 'dia') throw new Recusa('hora', 'hora');
  }
  return { dia, estado: corpo.estado, parte, hora };
}
function agendaSaida(l) {
  const s = { e: l.estado, p: l.parte };
  if (l.hora) s.h = String(l.hora).slice(0, 5);
  return s;
}
/** a janela de leitura: de/ate em 'YYYY-MM-DD', até 62 dias; sem nada, hoje + 42 */
function janelaDe(de, ate, hoje = new Date()) {
  const base = hoje.toISOString().slice(0, 10);
  const d = de ? diaDe(de, 'de') : base;
  const a = ate ? diaDe(ate, 'ate') : new Date(Date.parse(d + 'T12:00:00Z') + 42 * 864e5).toISOString().slice(0, 10);
  const dias = (Date.parse(a) - Date.parse(d)) / 864e5;
  if (dias < 0 || dias > 62) throw new Recusa('janela', 'ate');
  return { de: d, ate: a };
}
/**
 * Uma pessoa da comunidade (o objeto do HUB) + o que o Carro tem dela (`carro`: linha de carro_do_freela.agendas, só
 * de quem consentiu) → o que a lista devolve. Nada de contato, diária ou inventário. `agenda: null` = não divulgada.
 */
function pessoaSaida(z, carro, funcaoDoHub = {}) {
  if (!z || typeof z.id !== 'string' || typeof z.arroba !== 'string') return null;
  const doHub = (Array.isArray(z.funcoes) ? z.funcoes : []).map(f => funcaoDoHub[f && f.chave]).filter(Boolean);
  const funcoes = carro && carro.funcoes && carro.funcoes.length ? carro.funcoes : [...new Set(doHub)];
  const foto = typeof z.foto === 'string' && /^https:\/\/[^\s]{1,290}$/.test(z.foto) ? z.foto : null;
  const portfolio = typeof z.portfolio === 'string' && /^https:\/\//.test(z.portfolio) ? z.portfolio.slice(0, 300) : null;
  return {
    id: z.id.toLowerCase(), arroba: z.arroba, nome: String(z.nome || '@' + z.arroba).slice(0, 120), foto,
    cidade: typeof z.cidade === 'string' ? z.cidade.slice(0, 80) : null, funcoes,
    nichos: carro && carro.nichos ? carro.nichos : [], bio: typeof z.bio === 'string' ? z.bio.slice(0, 280) : null, portfolio,
    agenda: carro ? carro.agenda || {} : null, agenda_atualizada_em: carro ? iso(carro.agenda_atualizada_em) : null,
  };
}

/* ───────────── propostas, feed, brechó e denúncia (0003) ───────────── */
const UUIDR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidDe(v, campo) {
  if (typeof v !== 'string' || !UUIDR.test(v)) throw new Recusa('tipo', campo);
  return v.toLowerCase();
}
function horaDe(v, campo) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Recusa('tipo', campo);
  return v;
}
function centavos(v, campo, obrigatorio) {
  if (v === undefined || v === null) { if (obrigatorio) throw new Recusa('obrigatorio', campo); return null }
  if (!Number.isInteger(v) || v < 0 || v > 100000000) throw new Recusa('tipo', campo);
  return v;
}
/** POST /api/zro/propostas — o contratante chama alguém (job) ou o comprador fala com o vendedor (brecho) */
function propostaDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['para', 'tipo', 'anuncio', 'dia', 'ini', 'fim', 'funcao', 'local', 'mensagem', 'valor_cents', 'missao']);
  const tipo = corpo.tipo === undefined ? 'job' : corpo.tipo;
  if (tipo !== 'job' && tipo !== 'brecho') throw new Recusa('tipo', 'tipo');
  /* a marca da guilda (0006, fase 2): a proposta nasce de uma missão da Sede. Opcional; o servidor recusa na fase 1. */
  const missao = corpo.missao === undefined || corpo.missao === null ? null : uuidDe(corpo.missao, 'missao');
  if (missao && tipo !== 'job') throw new Recusa('campo', 'missao');
  return {
    missao,
    para: uuidDe(corpo.para, 'para'), tipo,
    anuncio: tipo === 'brecho' ? uuidDe(corpo.anuncio, 'anuncio') : null,
    dia: corpo.dia === undefined || corpo.dia === null ? null : diaDe(corpo.dia),
    ini: horaDe(corpo.ini, 'ini'), fim: horaDe(corpo.fim, 'fim'),
    funcao: texto(corpo.funcao, 'funcao', 60), local: texto(corpo.local, 'local', 120),
    mensagem: texto(corpo.mensagem, 'mensagem', 1000, { linhas: true }),
    valor_cents: centavos(corpo.valor_cents, 'valor_cents', false),
  };
}
/** PATCH /api/zro/propostas?id= — aceitar, recusar (com motivo) ou cancelar */
function respostaDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['estado', 'motivo']);
  if (!['aceita', 'recusada', 'cancelada'].includes(corpo.estado)) throw new Recusa('tipo', 'estado');
  return { estado: corpo.estado, motivo: corpo.estado === 'recusada' ? texto(corpo.motivo, 'motivo', 200) : null };
}
const TIPOS_POST = ['nota', 'bastidor', 'entrega', 'procura'];
function postDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['texto', 'tipo']);
  const tipo = corpo.tipo === undefined ? 'nota' : corpo.tipo;
  if (!TIPOS_POST.includes(tipo)) throw new Recusa('tipo', 'tipo');
  return { tipo, texto: texto(corpo.texto, 'texto', 1000, { obrigatorio: true, linhas: true }) };
}
function anuncioDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['titulo', 'categoria', 'estado_item', 'descricao', 'cidade', 'preco_cents']);
  return {
    titulo: texto(corpo.titulo, 'titulo', 120, { obrigatorio: true }),
    categoria: texto(corpo.categoria, 'categoria', 40, { obrigatorio: true }),
    estado_item: texto(corpo.estado_item, 'estado_item', 40),
    descricao: texto(corpo.descricao, 'descricao', 1000, { linhas: true }),
    cidade: texto(corpo.cidade, 'cidade', 80),
    preco_cents: centavos(corpo.preco_cents, 'preco_cents', true),
  };
}
function situacaoDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['situacao']);
  if (!['disponivel', 'vendido'].includes(corpo.situacao)) throw new Recusa('tipo', 'situacao');
  return corpo.situacao;
}
function denunciaDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['alvo', 'id', 'motivo', 'detalhe']);
  if (corpo.alvo !== 'post' && corpo.alvo !== 'anuncio') throw new Recusa('tipo', 'alvo');
  return { alvo: corpo.alvo, id: uuidDe(corpo.id, 'id'), motivo: texto(corpo.motivo, 'motivo', 80, { obrigatorio: true }),
    detalhe: texto(corpo.detalhe, 'detalhe', 500, { linhas: true }) };
}

/* ───────────── guilda (0004) ───────────── */
const TOKEN_GUILDA = /^[A-Za-z0-9_-]{20,64}$/;
function guildaDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'nome', 'tag', 'cor', 'sobre']);
  const tag = typeof corpo.tag === 'string' ? corpo.tag.trim().toUpperCase() : '';
  if (!/^[A-ZÀ-Ú]{2,3}$/.test(tag)) throw new Recusa('tipo', 'tag');
  const cor = corpo.cor === undefined || corpo.cor === null ? null : corpo.cor;
  if (cor !== null && !(typeof cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cor))) throw new Recusa('tipo', 'cor');
  const nome = texto(corpo.nome, 'nome', 24, { obrigatorio: true });
  if ([...nome].length < 3) throw new Recusa('tamanho', 'nome');
  return { nome, tag, cor, sobre: texto(corpo.sobre, 'sobre', 90) };
}
function conviteDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'para']);
  return { para: corpo.para === undefined || corpo.para === null ? null : uuidDe(corpo.para, 'para') };
}
function tokenDe(v) {
  if (typeof v !== 'string' || !TOKEN_GUILDA.test(v)) throw new Recusa('tipo', 'token');
  return v;
}
function aceitarDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'id', 'token']);
  if ((corpo.id === undefined) === (corpo.token === undefined)) throw new Recusa('pedido');
  return corpo.id !== undefined ? { id: uuidDe(corpo.id, 'id'), token: null } : { id: null, token: tokenDe(corpo.token) };
}
function verConviteDe(corpo) { objeto(corpo); soEstes(corpo, ['acao', 'token']); return tokenDe(corpo.token) }
function recusarDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'id', 'bloquear']);
  if (corpo.bloquear !== undefined && typeof corpo.bloquear !== 'boolean') throw new Recusa('tipo', 'bloquear');
  return { id: uuidDe(corpo.id, 'id'), bloquear: corpo.bloquear === true };
}
function idConviteDe(corpo) { objeto(corpo); soEstes(corpo, ['acao', 'id']); return uuidDe(corpo.id, 'id') }
function guildaSemCampos(corpo) { objeto(corpo); soEstes(corpo, ['acao']) }
function removerDe(corpo) { objeto(corpo); soEstes(corpo, ['acao', 'sub']); return uuidDe(corpo.sub, 'sub') }

/* ───────────── a Sede (0005) ─────────────
 * As 5 paletas aprovadas pelo titular (31/10/2026; Gel magenta é a padrão) e a cor própria com a guarda de contraste:
 * o tom do escuro passa 4,5:1 sobre o cartão mais claro do escuro (#1E1E22) e o do claro passa 4,5:1 sobre o fundo do
 * claro (#F5F5F7). ⚠️ O template tem a MESMA conta (sdPaleta); a suíte guilda-real confere que as duas batem. */
const PALETAS = {
  'gel-magenta': { nome: 'Gel magenta', d: '#F062B8', l: '#B0307A', ink: '#1F0716' },
  tungstenio: { nome: 'Tungstênio', d: '#F0A85E', l: '#B8691E', ink: '#1A1208' },
  'luz-do-dia': { nome: 'Luz do dia', d: '#7CC4FF', l: '#1F6FB8', ink: '#06121F' },
  bordo: { nome: 'Bordô', d: '#E8697D', l: '#A8283D', ink: '#1F0609' },
  jade: { nome: 'Jade', d: '#3FD3B0', l: '#0F7D66', ink: '#04150F' },
};
const HEX = /^#[0-9a-fA-F]{6}$/;
const rgbDe = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hexDe = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const misturar = (a, b, t) => hexDe(rgbDe(a).map((v, i) => v * t + rgbDe(b)[i] * (1 - t)));
function luminancia(h) {
  const [r, g, b] = rgbDe(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** a cor própria nos dois temas: clareia (escuro) ou escurece (claro) até passar 4,5:1; a tinta é a que mais contrasta */
function corPropria(hex) {
  const base = String(hex).toUpperCase();
  let d = base, l = base;
  for (let i = 1; i <= 40 && contraste(d, '#1E1E22') < 4.5; i++) d = misturar(base, '#FFFFFF', 1 - i * 0.025);
  for (let i = 1; i <= 40 && contraste(l, '#F5F5F7') < 4.5; i++) l = misturar(base, '#000000', 1 - i * 0.025);
  const ink = contraste(d, '#0E0E10') >= contraste(d, '#FFFFFF') ? '#0E0E10' : '#FFFFFF';
  return { d, l, ink };
}
/** as cores que a sede veste: { id, nome, d, l, ink } (paleta aprovada ou a própria, já com a guarda) */
function paletaDe(id, propria) {
  if (id === 'propria' && HEX.test(String(propria || ''))) return Object.assign({ id: 'propria', nome: 'Cor própria' }, corPropria(propria));
  const p = PALETAS[id] || PALETAS['gel-magenta'];
  return Object.assign({ id: PALETAS[id] ? id : 'gel-magenta' }, p);
}
const EMOJIS = ['👍', '🔥', '❤️', '🙌', '🙏', '😂', '👏', '🎬'];
const TIPOS_MURAL = ['aviso', 'vitoria', 'vaga', 'set', 'equipamento'];
function booleano(v, campo, padrao) {
  if (v === undefined) return padrao;
  if (typeof v !== 'boolean') throw new Recusa('tipo', campo);
  return v;
}
function personalizarDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'paleta', 'cor', 'sobre', 'praca']);
  const paleta = corpo.paleta;
  if (paleta !== 'propria' && !PALETAS[paleta]) throw new Recusa('tipo', 'paleta');
  let cor = null;
  if (paleta === 'propria') {
    if (typeof corpo.cor !== 'string' || !HEX.test(corpo.cor)) throw new Recusa('tipo', 'cor');
    cor = corpo.cor.toUpperCase();
  } else if (corpo.cor !== undefined && corpo.cor !== null) throw new Recusa('campo', 'cor');
  const praca = texto(corpo.praca, 'praca', 40);
  if (praca !== null && [...praca].length < 2) throw new Recusa('tamanho', 'praca');
  return { paleta, cor, sobre: texto(corpo.sobre, 'sobre', 90), praca };
}
function mensagemDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'canal', 'texto', 'imagem']);
  const t = texto(corpo.texto, 'texto', 2000, { linhas: true });
  const imagem = corpo.imagem === undefined || corpo.imagem === null ? null : uuidDe(corpo.imagem, 'imagem');
  if (t === null && imagem === null) throw new Recusa('obrigatorio', 'texto');
  return { canal: uuidDe(corpo.canal, 'canal'), texto: t, imagem };
}
function chamadaDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'canal', 'titulo', 'dia', 'hora', 'local', 'obs', 'equipe']);
  const equipe = corpo.equipe === undefined ? [] : corpo.equipe;
  if (!Array.isArray(equipe) || equipe.length > 40) throw new Recusa('tipo', 'equipe');
  const titulo = texto(corpo.titulo, 'titulo', 80, { obrigatorio: true });
  return {
    canal: uuidDe(corpo.canal, 'canal'), titulo, dia: diaDe(corpo.dia), hora: horaDe(corpo.hora, 'hora'),
    local: texto(corpo.local, 'local', 80, { obrigatorio: true }), obs: texto(corpo.obs, 'obs', 200),
    equipe: [...new Set(equipe.map(x => uuidDe(x, 'equipe').toLowerCase()))],
  };
}
function reagirDe(corpo, emojis = EMOJIS) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'id', 'emoji', 'ligar']);
  if (!emojis.includes(corpo.emoji)) throw new Recusa('tipo', 'emoji');
  return { id: uuidDe(corpo.id, 'id'), emoji: corpo.emoji, ligar: booleano(corpo.ligar, 'ligar', true) };
}
function sedeIdDe(corpo) { objeto(corpo); soEstes(corpo, ['acao', 'id']); return uuidDe(corpo.id, 'id') }
function fixarDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'id', 'fixar']);
  return { id: uuidDe(corpo.id, 'id'), fixar: booleano(corpo.fixar, 'fixar', true) };
}
function responderChamadaDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'id', 'resposta']);
  if (corpo.resposta !== 'vou' && corpo.resposta !== 'nao') throw new Recusa('tipo', 'resposta');
  return { id: uuidDe(corpo.id, 'id'), resposta: corpo.resposta };
}
function presencaDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'id', 'sub', 'presente']);
  return { id: uuidDe(corpo.id, 'id'), sub: uuidDe(corpo.sub, 'sub').toLowerCase(), presente: booleano(corpo.presente, 'presente', true) };
}
function jobDe(corpo) { objeto(corpo); soEstes(corpo, ['acao', 'job']); return uuidDe(corpo.job, 'job') }
function nomearDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'job', 'titulo', 'tipo']);
  const titulo = texto(corpo.titulo, 'titulo', 60, { obrigatorio: true });
  if ([...titulo].length < 2) throw new Recusa('tamanho', 'titulo');
  const tipo = corpo.tipo === undefined || corpo.tipo === null ? null : corpo.tipo;
  if (tipo !== null && !TIPOS.includes(tipo)) throw new Recusa('catalogo', 'tipo');
  return { job: uuidDe(corpo.job, 'job'), titulo, tipo };
}
function lidoDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'canal', 'seq']);
  if (!Number.isInteger(corpo.seq) || corpo.seq < 0) throw new Recusa('tipo', 'seq');
  return { canal: uuidDe(corpo.canal, 'canal'), seq: corpo.seq };
}
function digitandoDe(corpo) { objeto(corpo); soEstes(corpo, ['acao', 'canal']); return uuidDe(corpo.canal, 'canal') }
function linkDe(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || v.length > 300) throw new Recusa('link', 'link');
  let u;
  try { u = new URL(v.trim()) } catch (e) { throw new Recusa('link', 'link') }
  if (u.protocol !== 'https:' || !/\./.test(u.hostname) || u.username || u.password) throw new Recusa('link', 'link');
  if (/(^|\.)(wa\.me|whatsapp\.com)$/i.test(u.hostname)) throw new Recusa('proibido', 'link');
  if (TELEFONE.test(u.href)) throw new Recusa('telefone', 'link');
  return u.href;
}
function muralDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'tipo', 'titulo', 'texto', 'link', 'imagem', 'dia', 'funcao', 'diaria_cents']);
  if (!TIPOS_MURAL.includes(corpo.tipo)) throw new Recusa('tipo', 'tipo');
  const titulo = texto(corpo.titulo, 'titulo', 120, { obrigatorio: true });
  if ([...titulo].length < 2) throw new Recusa('tamanho', 'titulo');
  const vaga = corpo.tipo === 'vaga';
  if (!vaga && (corpo.dia !== undefined || corpo.funcao !== undefined || corpo.diaria_cents !== undefined)) throw new Recusa('campo', 'dia');
  const dados = vaga ? {
    dia: corpo.dia === undefined || corpo.dia === null ? null : diaDe(corpo.dia),
    funcao: texto(corpo.funcao, 'funcao', 60),
    diaria_cents: centavos(corpo.diaria_cents, 'diaria_cents', false),
  } : null;
  if (dados) for (const k of Object.keys(dados)) if (dados[k] === null) delete dados[k];
  return {
    tipo: corpo.tipo, titulo, texto: texto(corpo.texto, 'texto', 600, { linhas: true }), link: linkDe(corpo.link),
    imagem: corpo.imagem === undefined || corpo.imagem === null ? null : uuidDe(corpo.imagem, 'imagem'), dados,
  };
}

/* ---------------- o quadro de missões (0006, fase 2) ---------------- */
/** POST /api/zro/sede {acao:"missao"} — montar o job com gente da guilda: título, contratante, dia, horário, local e a
 *  função de cada escolhido (do catálogo: ninguém digita). Sem valor (o quadro não tem preço) e sem telefone. */
function missaoDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'titulo', 'contratante', 'cliente', 'dia', 'ini', 'fim', 'local', 'equipe', 'chamada']);
  const titulo = texto(corpo.titulo, 'titulo', 60, { obrigatorio: true });
  if ([...titulo].length < 2) throw new Recusa('tamanho', 'titulo');
  const contratante = corpo.contratante === undefined || corpo.contratante === null ? 'casa' : corpo.contratante;
  if (contratante !== 'casa' && contratante !== 'fora') throw new Recusa('tipo', 'contratante');
  const cliente = texto(corpo.cliente, 'cliente', 60);
  if (cliente !== null && contratante !== 'fora') throw new Recusa('campo', 'cliente');
  if (cliente !== null && [...cliente].length < 2) throw new Recusa('tamanho', 'cliente');
  if (!Array.isArray(corpo.equipe) || corpo.equipe.length < 1 || corpo.equipe.length > 30) throw new Recusa('tipo', 'equipe');
  const vistos = new Set();
  const equipe = corpo.equipe.map(x => {
    objeto(x);
    soEstes(x, ['sub', 'funcao']);
    const sub = uuidDe(x.sub, 'equipe');
    if (vistos.has(sub)) throw new Recusa('repetido', 'equipe');
    vistos.add(sub);
    const funcao = texto(x.funcao, 'funcao', 60);
    if (funcao !== null && !FUNCOES.includes(funcao)) throw new Recusa('catalogo', 'funcao');
    return { sub, funcao };
  });
  const local = texto(corpo.local, 'local', 120);
  let chamada = null;
  if (corpo.chamada !== undefined && corpo.chamada !== null) {
    objeto(corpo.chamada);
    soEstes(corpo.chamada, ['hora', 'obs']);
    const hora = horaDe(corpo.chamada.hora, 'hora');
    if (!hora) throw new Recusa('obrigatorio', 'hora');
    if (local === null) throw new Recusa('obrigatorio', 'local');
    chamada = { hora, obs: texto(corpo.chamada.obs, 'obs', 200) };
  }
  return { titulo, contratante, cliente, dia: diaDe(corpo.dia), ini: horaDe(corpo.ini, 'ini'), fim: horaDe(corpo.fim, 'fim'), local, equipe, chamada };
}
/** {acao:"missao_trocar"} — quem não vai (ou ficou sem proposta) dá lugar a outra pessoa da guilda */
function missaoTrocarDe(corpo) {
  objeto(corpo);
  soEstes(corpo, ['acao', 'missao', 'sai', 'entra', 'funcao']);
  const funcao = texto(corpo.funcao, 'funcao', 60);
  if (funcao !== null && !FUNCOES.includes(funcao)) throw new Recusa('catalogo', 'funcao');
  return { missao: uuidDe(corpo.missao, 'missao'), sai: uuidDe(corpo.sai, 'sai'), entra: uuidDe(corpo.entra, 'entra'), funcao };
}
function missaoIdDe(corpo) { objeto(corpo); soEstes(corpo, ['acao', 'missao']); return uuidDe(corpo.missao, 'missao') }

module.exports = { missaoDe, missaoTrocarDe, missaoIdDe, PALETAS, paletaDe, corPropria, contraste, EMOJIS, TIPOS_MURAL, personalizarDe, mensagemDe, chamadaDe, reagirDe,
  sedeIdDe, fixarDe, responderChamadaDe, presencaDe, jobDe, nomearDe, lidoDe, digitandoDe, muralDe, linkDe,
  guildaSemCampos, guildaDe, conviteDe, aceitarDe, verConviteDe, recusarDe, idConviteDe, removerDe, propostaDe, respostaDe, postDe, anuncioDe, situacaoDe, denunciaDe, diaDe, agendaDe, agendaSaida, janelaDe, pessoaSaida, FUNCOES, TIPOS, UFS, CATEGORIAS, VISIBILIDADES, TELEFONE, Recusa, perfilDe, itemDe, perfilSaida, itemSaida };
