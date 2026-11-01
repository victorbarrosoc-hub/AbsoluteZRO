// Criar com IA (a Higgsfield das Conexões da Absolute ZRO, pelo HUB): as contas puras da folha. O preço de cada coisa,
// o saldo e o andamento vêm sempre da Higgsfield (pelo HUB); daqui só sai a leitura para a tela: o formato mais perto
// do projeto, o medidor de créditos, o nome do arquivo, o que cabe no saldo e a frase de cada estado.

import { dividir, linhaInicial, localizar } from './linha.js'

export const PROPORCOES = ['16:9', '9:16', '1:1', '4:5']
export const QUANTIDADES = [1, 2, 4]
export const DURACOES = ['curto', 'longo']
/** Uma imagem entra na Mídia como um clipe parado deste tamanho (a Mídia do editor é de vídeo e som). */
export const SEGUNDOS_PARADA = 5
/** Onde os resultados moram (a CDN e o envio da Higgsfield); o resto nem é pedido. */
const HOSTS = [/^upload\.higgsfield\.ai$/, /^cdn\.higgsfield\.ai$/, /^[a-z0-9-]+\.cloudfront\.net$/, /^[a-z0-9.-]+\.amazonaws\.com$/]

/** O formato da Higgsfield mais perto do projeto (largura × altura). */
export function proporcaoDo(p) {
  const r = (p?.largura || 1920) / (p?.altura || 1080)
  let melhor = PROPORCOES[0]
  let dist = Infinity
  for (const x of PROPORCOES) {
    const [a, b] = x.split(':').map(Number)
    const d = Math.abs(Math.log(r / (a / b)))
    if (d < dist) [melhor, dist] = [x, d]
  }
  return melhor
}

/** 1234.5 → "1.234,5" */
export const creditos = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }))

/**
 * O medidor da folha: o saldo de agora e o que o AEON já usou neste mês (registrado no HUB), como fração do que havia
 * no começo (saldo + usado). usoMes é o gasto do mês na Higgsfield inteira (de qualquer lugar), quando ela informa.
 */
export function medidor(painel) {
  const saldo = painel?.saldo ?? null
  const usado = Number(painel?.usoApp?.mes) || 0
  const total = (saldo ?? 0) + usado
  return {
    saldo,
    usado,
    pedidos: Number(painel?.usoApp?.pedidos) || 0,
    usoMes: painel?.usoMes ?? null,
    frac: total > 0 ? Math.min(1, usado / total) : 0,
    plano: painel?.plano || null,
  }
}

/** Dá para gastar isto agora? Sem preço ou sem saldo informados, não. */
export const cabe = (custo, saldo) => custo != null && saldo != null && custo <= saldo

/** O preço de uma escolha no painel: telas (quantidade) ou opção de vídeo (id). null = sem preço agora. */
export function precoDe(painel, { quantidade, opcao } = {}) {
  if (opcao) return painel?.opcoes?.find((o) => o.id === opcao)?.creditos ?? null
  return painel?.imagens?.find((i) => i.quantidade === quantidade)?.creditos ?? null
}

/** Nome do arquivo na Mídia: "IA · <começo do pedido> (n).ext", sem caracteres que atrapalham num sistema de arquivos. */
export function nomeDaCriacao(prompt, ext, n = 1) {
  const base =
    String(prompt || 'criação')
      .replace(/[\\/:*?"<>|\n\r\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40)
      .trim() || 'criação'
  return `IA · ${base}${n > 1 ? ` (${n})` : ''}.${ext}`
}

/** Só https e só os endereços da Higgsfield. */
export function urlPermitida(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

const ESTADOS = {
  na_fila: 'Na fila da Higgsfield',
  gerando: 'Gerando',
  pronto: 'Pronto',
  falhou: 'A Higgsfield não conseguiu gerar. Nenhum arquivo entrou.',
  recusado: 'A Higgsfield recusou este pedido. Mude a descrição e tente de novo.',
  cancelado: 'Cancelado na Higgsfield.',
}
/** A frase do estado que a Higgsfield informou (sem porcentagem inventada). */
export const estadoLegivel = (estado, erro) =>
  (estado === 'falhou' || estado === 'recusado') && erro ? `${ESTADOS[estado]} (${erro})` : ESTADOS[estado] || 'Esperando a Higgsfield'

/**
 * O erro da Absolute ZRO (ou do repasse) como estado da folha: 'entrar' (sem login ou login antigo), 'conectar' (sem a
 * Higgsfield nas Conexões, ou pediu para conectar de novo), 'desligado' (o AEON desligado nas Conexões), 'saldo',
 * 'limite' ou 'erro'.
 */
export function leituraDoErro(status, corpo = {}) {
  const codigo = corpo.error
  const d = corpo.details || {}
  if (status === 401) return { estado: 'entrar', texto: 'Entre de novo com a conta Absolute ZRO para criar com a Higgsfield.' }
  if (codigo === 'sem_conexao')
    return {
      estado: 'conectar',
      reconectar: d.motivo === 'reconectar',
      conectar: d.conectar || null,
      texto: d.motivo === 'reconectar' ? 'A Higgsfield pediu para conectar de novo.' : 'Conecte a Higgsfield na sua conta Absolute ZRO.',
    }
  if (codigo === 'app_desligado') return { estado: 'desligado', conectar: d.conectar || null, texto: 'O AEON está desligado na Higgsfield das suas Conexões.' }
  if (codigo === 'quota_exceeded') return { estado: 'saldo', texto: corpo.message || 'Faltam créditos na Higgsfield.' }
  if (codigo === 'rate_limited') return { estado: 'limite', texto: corpo.message || 'Muitos pedidos seguidos. Espere alguns minutos.' }
  return { estado: 'erro', texto: corpo.message || 'A Higgsfield não respondeu agora. Tente de novo.' }
}

/** Põe a mídia inteira na linha no quadro q: divide o clipe que passa ali e entra no meio; depois do fim, no fim. */
export function inserirNaLinha(linha, midia, q) {
  const [novo] = linhaInicial([midia]).clipes
  if (!novo) return linha
  const l = dividir(linha, q)
  const onde = localizar(l, q)
  const i = !onde ? l.clipes.length : onde.inicio === q ? onde.indice : onde.indice + 1
  return { ...l, clipes: [...l.clipes.slice(0, i), novo, ...l.clipes.slice(i)] }
}
