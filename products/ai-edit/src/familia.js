// A família Absolute ZRO vista do AEON: onde cada app mora e o que ele faz no caminho do vídeo. O app e o site usam
// a mesma lista (menu recolhível, Entrega e a seção do fluxo na página inicial). Ícone de cada produto é o dele.

export const FAMILIA = [
  { id: 'hub', nome: 'Absolute ZRO', href: 'https://absolutezro.com', icone: 'absolute-zro', papel: 'Sua conta e seus projetos' },
  { id: 'sobedesce', nome: 'SOBEDESCE', href: 'https://sobedesce.vercel.app', icone: 'sobedesce.svg', papel: 'Descarga e subida conferidas' },
  { id: 'synquei', nome: 'Synquei', href: 'https://synquei.vercel.app', icone: 'synquei.svg', papel: 'Câmeras sincronizadas pelo som' },
  { id: 'nossom', nome: 'NOSSOM', href: 'https://nossom.absolutezro.com', icone: 'nossom.svg', papel: 'Voz limpa, mix e master' },
  { id: 'finishing', nome: 'Revela', href: 'https://revela.absolutezro.com', icone: 'revela.svg', papel: 'Cor, LUT e entrega' },
  { id: 'tpeasy', nome: 'TPeasy', href: 'https://tpeasy.vercel.app', icone: 'tpeasy.svg', papel: 'Teleprompter com o roteiro' },
  { id: 'carro-do-freela', nome: 'Carro do Freela', href: 'https://carrodofreela.com.br', icone: 'carro-do-freela.png', papel: 'Escala de freelas' },
]

/** Depois do AEON: os próximos passos que abrem o app certo (Entrega). */
export const DEPOIS = [
  { id: 'finishing', titulo: 'Cor na Revela', texto: 'LUT do seu frame de referência.', href: 'https://revela.absolutezro.com/lut' },
  { id: 'nossom', titulo: 'Som no NOSSOM', texto: 'Voz limpa, mix e master.', href: 'https://nossom.absolutezro.com' },
  { id: 'sobedesce', titulo: 'Entregar com o SOBEDESCE', texto: 'Sobe conferido, com MD5.', href: 'https://sobedesce.vercel.app' },
]

export const CONTA = { entrar: 'https://absolutezro.com/entrar', criar: 'https://absolutezro.com/criar-conta', ferramentas: 'https://absolutezro.com/ferramentas' }

/** Caminho do ícone a partir de uma página na raiz do produto ('') ou em app/ ('../'). */
export const iconeDe = (f, base = '') => (f.icone === 'absolute-zro' ? `${base}vendor/marca/absolute-zro-simbolo-branco.svg` : `${base}marca/familia/${f.icone}`)
