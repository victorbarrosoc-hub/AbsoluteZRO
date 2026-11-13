// Nome do arquivo exportado: um modelo com fichas vira um nome que vale em Windows, macOS e Linux, e que nunca cai em
// cima de um arquivo que já existe.
//
// Fichas:
//   {nome}          nome do arquivo original, sem a extensão
//   {seq}  {seq:4}  número de sequência; `:4` completa com zeros à esquerda até 4 dígitos
//   {data}          data da captura, AAAA-MM-DD (do exif; vazio quando a foto não tem data)
//   {trabalho}      nome do trabalho (a pasta ou o projeto)
//   {estrelas}      0 a 5
//   {predefinicao}  nome da predefinição aplicada
// Ficha desconhecida some (e `fichasDoModelo` avisa qual é), para um modelo digitado errado não virar "{nmoe}.jpg".
//
// O que não pode num nome de arquivo:
//   Windows (Microsoft, "Naming Files, Paths, and Namespaces"): < > : " / \ | ? * e os caracteres de controle 0–31;
//   nome que termina em ponto ou espaço; os nomes reservados CON, PRN, AUX, NUL, COM1–9 e LPT1–9, com ou sem extensão.
//   macOS: ":" (é a barra do Finder) e "/".      Todos: 255 bytes em UTF-8 por nome (APFS, NTFS, ext4).
// O nome sai em Unicode NFC (o macOS antigo guardava em NFD: "é" composto e decomposto seriam dois arquivos).
// Colisão compara sem diferenciar maiúsculas (os discos do Windows e do macOS não diferenciam) e resolve com -2, -3…

export const FICHAS = ['nome', 'seq', 'data', 'trabalho', 'estrelas', 'predefinicao']
export const EXTENSOES = { jpeg: 'jpg', tiff: 'tif', png: 'png', webp: 'webp' }

const MODELO_PADRAO = '{nome}'
const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const LIMITE = 255
const FICHA = /\{([^{}:]*)(?::([^{}]*))?\}/g

const bytesUtf8 = (s) => new TextEncoder().encode(s).length

/** Tira a extensão (o último ponto que não é o primeiro caractere) e qualquer caminho antes do nome. */
export function semExtensao(arquivo) {
  const base = String(arquivo ?? '')
    .split(/[\\/]/)
    .pop()
  const ponto = base.lastIndexOf('.')
  return ponto > 0 ? base.slice(0, ponto) : base
}

/** As fichas de um modelo: { conhecidas: ['nome', …], desconhecidas: ['nmoe', …] }. */
export function fichasDoModelo(modelo) {
  const conhecidas = []
  const desconhecidas = []
  for (const m of String(modelo ?? '').matchAll(FICHA)) {
    const lista = FICHAS.includes(m[1].trim()) ? conhecidas : desconhecidas
    if (!lista.includes(m[1].trim())) lista.push(m[1].trim())
  }
  return { conhecidas, desconhecidas }
}

/**
 * Um pedaço de nome (sem extensão) que vale em qualquer sistema. Caractere proibido vira hífen; espaços repetidos
 * viram um; pontos e espaços das pontas saem (ponto na frente esconderia o arquivo no macOS e no Linux). Nome vazio
 * ou reservado ganha `reserva` (padrão 'foto').
 */
export function sanear(texto, { reserva = 'foto', limite = LIMITE } = {}) {
  let s = String(texto ?? '').normalize('NFC')
  let limpo = ''
  for (const c of s) {
    const codigo = c.codePointAt(0)
    if (c === '\t' || c === '\n' || c === '\r') {
      limpo += ' ' // quebra de linha e tabulação separam palavras: viram espaço
      continue
    }
    if (codigo < 32 || codigo === 127) continue
    limpo += '<>:"/\\|?*'.includes(c) ? '-' : c
  }
  s = limpo
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  if (!s) s = reserva
  // CON.jpg é tão reservado quanto CON: confere a parte antes do primeiro ponto
  if (RESERVADOS.test(s.split('.')[0].trim())) s = `_${s}`
  // corta por caractere inteiro (nunca no meio de um par substituto) até caber no limite de bytes
  while (bytesUtf8(s) > limite) s = Array.from(s).slice(0, -1).join('')
  return s.replace(/[\s.]+$/g, '') || reserva
}

const dataDe = (data) => /^(\d{4}-\d\d-\d\d)/.exec(typeof data === 'string' ? data : '')?.[1] ?? ''

// Troca as fichas pelos valores, sem sanear ainda
function substituir(modelo, contexto) {
  const valores = {
    nome: semExtensao(contexto.nome),
    data: dataDe(contexto.data),
    trabalho: contexto.trabalho ?? '',
    estrelas: Number.isFinite(contexto.estrelas) ? String(Math.max(0, Math.min(5, Math.round(contexto.estrelas)))) : '',
    predefinicao: contexto.predefinicao ?? '',
  }
  return String(modelo).replace(FICHA, (tudo, ficha, parametro) => {
    const f = ficha.trim()
    if (f === 'seq') {
      const n = Number.isFinite(contexto.seq) ? Math.max(0, Math.round(contexto.seq)) : 1
      const casas = Math.max(1, Math.min(12, parseInt(parametro, 10) || 1))
      return String(n).padStart(casas, '0')
    }
    // o valor de uma ficha não pode trazer barra: "Casamento/Igreja" no trabalho viraria pasta
    return f in valores ? String(valores[f]).replace(/[\\/]/g, '-') : ''
  })
}

/**
 * Preenche o modelo e devolve o nome SEM extensão, já saneado.
 *   contexto   { nome (arquivo original, com ou sem extensão), seq, data ('AAAA-MM-DD…'), trabalho, estrelas, predefinicao }
 * Modelo vazio ou que não gera nada vira o nome original.
 */
export function preencherModelo(modelo, contexto = {}) {
  return sanear(substituir(modelo || MODELO_PADRAO, contexto), { reserva: sanear(semExtensao(contexto.nome)) })
}

const chave = (nome) => nome.normalize('NFC').toLowerCase()

/**
 * Gerador de nomes de um lote: cada chamada devolve um nome completo (com extensão) que não bate com nenhum arquivo
 * existente nem com outro nome já entregue neste lote. Nunca sobrescreve: havendo "IMG_0001.jpg", o próximo é
 * "IMG_0001-2.jpg", depois "-3".
 *   existentes   nomes que já estão na pasta de destino (lista ou Set), com extensão
 *   modelo       o modelo de nome       extensao   'jpg' | 'tif' | … (ou o formato: 'jpeg', 'tiff')
 *   inicio       primeiro número da sequência (padrão 1)
 */
export function criarNomes({ modelo = MODELO_PADRAO, extensao = 'jpg', existentes = [], inicio = 1 } = {}) {
  const ext = sanear(EXTENSOES[extensao] ?? String(extensao).replace(/^\./, ''), { reserva: 'jpg' }).toLowerCase()
  const usados = new Set(Array.from(existentes, chave))
  let seq = inicio
  return {
    /** O nome para esta foto. `contexto.seq` vale se vier; senão a sequência do lote anda sozinha. */
    proximo(contexto = {}) {
      const base = preencherModelo(modelo, { ...contexto, seq: contexto.seq ?? seq })
      seq++
      const sufixoMaximo = `-${Number.MAX_SAFE_INTEGER}.${ext}`.length
      const raiz = sanear(base, { limite: LIMITE - sufixoMaximo })
      let nome = `${raiz}.${ext}`
      for (let n = 2; usados.has(chave(nome)); n++) nome = `${raiz}-${n}.${ext}`
      usados.add(chave(nome))
      return nome
    },
    /** Avisa que um nome passou a existir na pasta (gravado por fora deste gerador). */
    reservar(nome) {
      usados.add(chave(nome))
    },
    tem: (nome) => usados.has(chave(nome)),
  }
}

/** Nome completo de uma foto só, sem lote: modelo preenchido + extensão, desviando dos `existentes`. */
export function nomeDeSaida(modelo, contexto, { extensao = 'jpg', existentes = [] } = {}) {
  return criarNomes({ modelo, extensao, existentes, inicio: contexto?.seq ?? 1 }).proximo(contexto)
}

/**
 * A pasta de destino como lista de segmentos saneados (para criar um por um com a API de arquivos do navegador).
 * Aceita fichas, barra ou barra invertida; ignora '.', '..' e segmentos vazios: o destino nunca sobe de pasta.
 */
export function segmentosDaPasta(pasta, contexto = {}) {
  return String(pasta ?? '')
    .split(/[\\/]+/)
    .map((s) => sanear(substituir(s, contexto), { reserva: '' }))
    .filter((s) => s && s !== '..')
}
