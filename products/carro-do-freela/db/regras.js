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

module.exports = { diaDe, agendaDe, agendaSaida, janelaDe, pessoaSaida, FUNCOES, TIPOS, UFS, CATEGORIAS, VISIBILIDADES, TELEFONE, Recusa, perfilDe, itemDe, perfilSaida, itemSaida };
