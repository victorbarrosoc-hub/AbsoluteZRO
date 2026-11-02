// A família Absolute ZRO vista do AEON: onde cada app mora e o que ele faz no caminho do vídeo. O app e o site usam
// a mesma lista (menu recolhível, Entrega e a seção do fluxo na página inicial). Ícone de cada produto é o dele.
// Endereços no subdomínio da Absolute ZRO (ADR 0025), todos no ar em 31/10/2026; o Maestro e o Relay saíram do Beta
// (migrations 0032 e 0039) e o Carro do Freela foi para carro.absolutezro.com (0037 e 0041).

// Maestro na família (docs/operations/lancamento-maestro.md): `node scripts/lancamento-maestro.mjs --fechar` tira.
const MAESTRO_NA_FAMILIA = true

export const FAMILIA = [
  { id: 'hub', nome: 'Absolute ZRO', href: 'https://absolutezro.com', icone: 'absolute-zro', papel: 'Sua conta e seus projetos' },
  { id: 'sobedesce', nome: 'SOBEDESCE', href: 'https://sobedesce.absolutezro.com', icone: 'sobedesce.svg', papel: 'Descarga e subida conferidas' },
  { id: 'synquei', nome: 'Synquei', href: 'https://synquei.absolutezro.com', icone: 'synquei.svg', papel: 'Câmeras sincronizadas pelo som' },
  { id: 'nossom', nome: 'Quasar Audio Lab', href: 'https://quasar.absolutezro.com', icone: 'nossom.svg', papel: 'Voz limpa, mix e master' },
  { id: 'finishing', nome: 'Revela', href: 'https://revela.absolutezro.com', icone: 'revela.svg', papel: 'Cor, LUT e entrega' },
  { id: 'relay', nome: 'Relay', href: 'https://relay.absolutezro.com', icone: 'relay.svg', papel: 'Versões para cada rede' },
  { id: 'tpeasy', nome: 'TPeasy', href: 'https://tpeasy.absolutezro.com', icone: 'tpeasy.svg', papel: 'Teleprompter com o roteiro' },
  { id: 'carro-do-freela', nome: 'Carro do Freela', href: 'https://carro.absolutezro.com', icone: 'carro-do-freela.png', papel: 'Escala de freelas' },
  ...(MAESTRO_NA_FAMILIA
    ? [{ id: 'maestro', nome: 'Maestro', href: 'https://maestro.absolutezro.com', icone: 'maestro.svg', papel: 'Gestão da produtora' }]
    : []),
]

/** Depois do AEON: os próximos passos que abrem o app certo (Entrega). */
export const DEPOIS = [
  { id: 'finishing', titulo: 'Cor na Revela', texto: 'LUT do seu frame de referência.', href: 'https://revela.absolutezro.com/lut' },
  { id: 'nossom', titulo: 'Som no Quasar', texto: 'Voz limpa, mix e master.', href: 'https://quasar.absolutezro.com' },
  { id: 'relay', titulo: 'Versões no Relay', texto: 'Do master ao feed de cada rede.', href: 'https://relay.absolutezro.com' },
  { id: 'sobedesce', titulo: 'Entregar com o SOBEDESCE', texto: 'Sobe conferido, com MD5.', href: 'https://sobedesce.absolutezro.com' },
]

export const CONTA = { entrar: 'https://absolutezro.com/entrar', criar: 'https://absolutezro.com/criar-conta', ferramentas: 'https://absolutezro.com/ferramentas' }

/** Caminho do ícone a partir de uma página na raiz do produto ('') ou em app/ ('../'). */
export const iconeDe = (f, base = '') => (f.icone === 'absolute-zro' ? `${base}vendor/marca/absolute-zro-simbolo-branco.svg` : `${base}marca/familia/${f.icone}`)
