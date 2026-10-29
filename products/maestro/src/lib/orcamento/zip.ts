/**
 * Leitor mínimo de .zip (o .xlsx da ANP é um zip): lê o diretório central e abre só os arquivos pedidos, guardados
 * (método 0) ou comprimidos (8, deflate), com o zlib do Node. Sem dependência nova. Limita tamanho e quantidade.
 */
import { inflateRawSync } from "node:zlib";

const MAX_ARQUIVO = 20 * 1024 * 1024;

export function lerZip(buf: Buffer, quer: (nome: string) => boolean): Record<string, string> {
  let fimDir = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fimDir = i;
      break;
    }
  }
  if (fimDir < 0) throw new Error("zip sem diretório central");
  const total = buf.readUInt16LE(fimDir + 10);
  let p = buf.readUInt32LE(fimDir + 16);
  const out: Record<string, string> = {};
  for (let n = 0; n < total && n < 5000; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip com diretório inválido");
    const metodo = buf.readUInt16LE(p + 10);
    const tamanho = buf.readUInt32LE(p + 20);
    const original = buf.readUInt32LE(p + 24);
    const lNome = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lComent = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + lNome);
    p += 46 + lNome + lExtra + lComent;
    if (!quer(nome)) continue;
    if (original > MAX_ARQUIVO || tamanho > MAX_ARQUIVO) throw new Error(`arquivo grande demais no zip: ${nome}`);
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error("zip com cabeçalho local inválido");
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(inicio, inicio + tamanho);
    if (metodo === 0) out[nome] = dados.toString("utf8");
    else if (metodo === 8) out[nome] = inflateRawSync(dados, { maxOutputLength: MAX_ARQUIVO }).toString("utf8");
  }
  return out;
}
