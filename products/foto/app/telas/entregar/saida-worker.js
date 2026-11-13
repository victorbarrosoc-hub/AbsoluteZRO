// Worker da saída (pool de app/trabalho/pool.js): recebe os pixels que o motor revelou (app/motor/motor-worker.js,
// tarefa `exportar`, 16 bits, já no espaço da receita) e devolve o arquivo pronto, fora da tela.
//
//   gerar    { largura, altura, dados: Uint16Array RGB, receita, contexto, mascara? }
//            → { bytes, tipo, extensao, largura, altura, crc }                  (src/exportar/fila.js, gerarSaida)
//   galeria  { largura, altura, dados, mascara?, marca? }
//            → { previa: { bytes, largura, altura, sha256 }, mini: { … } }      (JPEG sRGB, marca gravada, sem metadados)
//
// A marca-d'água chega como máscara alfa já desenhada pela tela (texto ou PNG, num canvas): aqui não há fonte.

import { comTransferencia, servir } from '../../trabalho/servir.js'
import { gerarSaida } from '../../../src/exportar/fila.js'
import { limparJpeg } from '../../../src/exportar/jpeg.js'
import { crc32 } from '../../../src/exportar/png.js'

/** A prévia que vai para o cliente e a miniatura da grade dele (docs/API.md: até 4 MB e 512 KB). */
export const PREVIA = { lado: 2048, qualidade: 82 }
export const MINI = { lado: 480, qualidade: 72 }

function paraFlutuante({ largura, altura, dados }) {
  const f = new Float32Array(largura * altura * 3)
  const k = dados instanceof Uint16Array ? 1 / 65535 : 1 / 255
  if (dados.length === f.length) for (let i = 0; i < f.length; i++) f[i] = dados[i] * k
  else for (let p = 0, i = 0, j = 0; p < largura * altura; p++, i += 3, j += 4) [f[i], f[i + 1], f[i + 2]] = [dados[j] * k, dados[j + 1] * k, dados[j + 2] * k]
  return { largura, altura, dados: f }
}

// o codificador do navegador: WebP só existe por ele; JPEG abaixo de 90 também passa por aqui (gerarSaida decide)
async function codificar({ formato, largura, altura, rgba, qualidade }) {
  const tela = new OffscreenCanvas(largura, altura)
  tela.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), largura, altura), 0, 0)
  const blob = await tela.convertToBlob({ type: formato === 'webp' ? 'image/webp' : 'image/jpeg', quality: qualidade / 100 })
  return new Uint8Array(await blob.arrayBuffer())
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const sha256 = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes))

servir({
  async gerar({ largura, altura, dados, receita, contexto = {}, mascara = null }, { cancelado }) {
    if (cancelado()) return null
    const saida = await gerarSaida(paraFlutuante({ largura, altura, dados }), receita, { ...contexto, mascara, codificar })
    const bytes = saida.bytes
    // o CRC-32 sai daqui (o .zip precisa dele) para a tela não varrer 100 MB de TIFF
    const crc = crc32(bytes)
    return comTransferencia({ bytes, tipo: saida.tipo, extensao: saida.extensao, largura: saida.largura, altura: saida.altura, crc }, [bytes.buffer])
  },

  async galeria({ largura, altura, dados, mascara = null, marca = null }, { cancelado }) {
    const imagem = paraFlutuante({ largura, altura, dados })
    const uma = async ({ lado, qualidade }) => {
      if (cancelado()) throw new DOMException('Cancelado.', 'AbortError')
      const receita = {
        formato: 'jpeg',
        qualidade,
        espaco: 'srgb',
        tamanho: { tipo: 'lado', px: lado },
        nitidez: { destino: 'tela', intensidade: 'padrao' },
        metadados: 'nenhum',
        marcaDagua: marca && mascara ? marca : null,
      }
      const r = await gerarSaida(imagem, receita, { mascara, codificar })
      // sem metadados nenhum: só o perfil sRGB fica (a cor certa no celular do cliente)
      const bytes = limparJpeg(r.bytes, { manterIcc: true, manterOrientacao: false })
      return { bytes, largura: r.largura, altura: r.altura, sha256: await sha256(bytes) }
    }
    const previa = await uma(PREVIA)
    const mini = await uma(MINI)
    return comTransferencia({ previa, mini }, [previa.bytes.buffer, mini.bytes.buffer])
  },
})
