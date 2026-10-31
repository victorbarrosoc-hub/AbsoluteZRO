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
  soEstes(corpo, ['para', 'tipo', 'anuncio', 'dia', 'ini', 'fim', 'funcao', 'local', 'mensagem', 'valor_cents']);
  const tipo = corpo.tipo === undefined ? 'job' : corpo.tipo;
  if (tipo !== 'job' && tipo !== 'brecho') throw new Recusa('tipo', 'tipo');
  return {
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

module.exports = { guildaSemCampos, guildaDe, conviteDe, aceitarDe, verConviteDe, recusarDe, idConviteDe, removerDe, propostaDe, respostaDe, postDe, anuncioDe, situacaoDe, denunciaDe, diaDe, agendaDe, agendaSaida, janelaDe, pessoaSaida, FUNCOES, TIPOS, UFS, CATEGORIAS, VISIBILIDADES, TELEFONE, Recusa, perfilDe, itemDe, perfilSaida, itemSaida };
