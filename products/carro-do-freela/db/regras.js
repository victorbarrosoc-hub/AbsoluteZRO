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
    bio: l.bio, portfolio: l.portfolio_url, visibilidade: l.visibilidade, atualizado_em: iso(l.atualizado_em),
  };
}
function itemSaida(l) {
  return {
    id: l.id, categoria: l.categoria, marca: l.marca, modelo: l.modelo, quantidade: l.quantidade,
    observacao: l.observacao, diaria_cents: l.diaria_cents === null || l.diaria_cents === undefined ? null : Number(l.diaria_cents),
    ativo: l.ativo, atualizado_em: iso(l.atualizado_em),
  };
}

module.exports = { FUNCOES, TIPOS, UFS, CATEGORIAS, VISIBILIDADES, TELEFONE, Recusa, perfilDe, itemDe, perfilSaida, itemSaida };
