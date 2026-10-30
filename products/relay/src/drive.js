// Relay · "Escolher no Drive" (pedido do titular, 30/10/2026): o SOBEDESCE embutido num quadro
// (https://sobedesce.absolutezro.com/app/?no=relay&modo=escolher&tema=claro|escuro) escolhe o vídeo no Drive da pessoa;
// o Relay lê o arquivo aos pedaços pelo quadro e, pronto, pode mandar o resultado de volta para o Drive. O token do
// Google nunca sai do SOBEDESCE; o arquivo não passa por servidor (vai do Google direto para este aparelho).
//
// Protocolo (postMessage só entre as duas origens; aqui só a conta pura, a tela em app/drive.js):
//   quadro → Relay  { fonte: 'sobedesce', tipo: 'pronto' }
//   Relay → quadro  { fonte: 'relay', tipo: 'canal' } + MessagePort (transfer): os pedidos andam por ele
//   quadro → Relay  { fonte: 'sobedesce', tipo: 'escolhido', arquivos: [{ id, nome, tamanho, mime, pasta }] }
//   Relay → quadro  { fonte: 'relay', tipo: 'tema', tema: 'claro' | 'escuro' }
//   pelo canal:
//     { pedido, tipo: 'ler', id, de, ate }                 → { pedido, ok: true, dados: ArrayBuffer (transfer) }
//     { pedido, tipo: 'enviar', nome, mime, dados: Blob, pasta } → { pedido, ok: true, envio }   (entrou na fila)
//     (do quadro, sem pedido) { tipo: 'envio', envio, estado: 'enviando' | 'conferido' | 'erro', erro? }
//     qualquer erro: { pedido, ok: false, erro: 'texto curto' }

export const ORIGEM_SOBEDESCE = 'https://sobedesce.absolutezro.com'
export const LER_MAX = 32 * 1024 * 1024 // um pedido de leitura (o Mediabunny pede bem menos)
const ID = /^[A-Za-z0-9_-]{10,120}$/

/** Endereço do quadro do SOBEDESCE para escolher no Drive. */
export function enderecoDoQuadro(origem = ORIGEM_SOBEDESCE, tema = 'claro') {
  return `${origem}/app/?no=relay&modo=escolher&tema=${tema === 'escuro' ? 'escuro' : 'claro'}`
}

/** Os arquivos escolhidos, conferidos (id do Drive, nome, tamanho > 0). O que não vale fica de fora. */
export function arquivosEscolhidos(d) {
  if (!d || typeof d !== 'object' || d.fonte !== 'sobedesce' || d.tipo !== 'escolhido' || !Array.isArray(d.arquivos)) return []
  return d.arquivos
    .slice(0, 50)
    .filter((a) => a && typeof a === 'object' && ID.test(String(a.id)) && typeof a.nome === 'string' && a.nome.trim() && Number.isSafeInteger(a.tamanho) && a.tamanho > 0)
    .map((a) => ({
      id: a.id,
      nome: a.nome.trim().slice(0, 255),
      tamanho: a.tamanho,
      mime: typeof a.mime === 'string' ? a.mime.slice(0, 100) : '',
      pasta: typeof a.pasta === 'string' && ID.test(a.pasta) ? a.pasta : null,
    }))
}

/** Os intervalos [de, ate) que um pedido de leitura pode ter, dentro do arquivo e do limite por pedido. */
export function intervaloValido(de, ate, tamanho) {
  return Number.isSafeInteger(de) && Number.isSafeInteger(ate) && de >= 0 && ate > de && ate <= tamanho && ate - de <= LER_MAX
}
