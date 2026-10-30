/**
 * Um .zip simples, montado no servidor e enviado aos pedaços (o pacote do Fluxo, Criação F6): arquivo por arquivo,
 * cabeçalho local + bytes, e no fim o diretório central. Texto vai comprimido (deflate); imagem WebP vai guardada como
 * está (já é comprimida). Nomes em UTF-8 (bit 11). Sem ZIP64: o pacote fica muito abaixo de 4 GB (a cota de imagens é
 * de 200 MB por produtora). `lerZip` existe para os testes conferirem o que saiu.
 */
import { deflateRawSync, inflateRawSync } from "node:zlib";

export type ArquivoZip = { nome: string; dados: Uint8Array; comprimir?: boolean };

const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABELA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Hora e data no formato do DOS (hora local do servidor; o zip não tem fuso). */
function dos(d: Date): { hora: number; data: number } {
  const ano = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    data: ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const UTF8 = 0x0800;

class Montador {
  private offset = 0;
  private centrais: Buffer[] = [];
  private n = 0;
  private readonly quando: { hora: number; data: number };

  constructor(data: Date) {
    this.quando = dos(data);
  }

  arquivo(a: ArquivoZip): Buffer {
    const nome = Buffer.from(a.nome.replace(/^\/+/, ""), "utf8");
    if (!nome.length || nome.length > 0xffff) throw new Error("nome de arquivo inválido no zip");
    const dados = Buffer.from(a.dados.buffer, a.dados.byteOffset, a.dados.byteLength);
    const crc = crc32(dados);
    const comprimido = a.comprimir ? deflateRawSync(dados, { level: 6 }) : null;
    const usar = comprimido && comprimido.length < dados.length ? comprimido : dados;
    const metodo = usar === dados ? 0 : 8;
    if (this.offset + 30 + nome.length + usar.length > 0xffffffff) throw new Error("zip grande demais");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(this.quando.hora, 10);
    local.writeUInt16LE(this.quando.data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(usar.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(this.quando.hora, 12);
    central.writeUInt16LE(this.quando.data, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(usar.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(this.offset, 42);
    this.centrais.push(Buffer.concat([central, nome]));
    this.n++;

    const parte = Buffer.concat([local, nome, usar]);
    this.offset += parte.length;
    return parte;
  }

  fim(): Buffer {
    const dir = Buffer.concat(this.centrais);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(this.n, 8);
    eocd.writeUInt16LE(this.n, 10);
    eocd.writeUInt32LE(dir.length, 12);
    eocd.writeUInt32LE(this.offset, 16);
    return Buffer.concat([dir, eocd]);
  }
}

/** O zip aos pedaços: puxa o próximo arquivo só quando o navegador pede mais (as imagens vêm do banco aos poucos). */
export function zipEmPartes(arquivos: AsyncIterable<ArquivoZip>, data = new Date()): ReadableStream<Uint8Array> {
  const m = new Montador(data);
  const it = arquivos[Symbol.asyncIterator]();
  let acabou = false;
  return new ReadableStream<Uint8Array>({
    async pull(controle) {
      if (acabou) return;
      try {
        const r = await it.next();
        if (r.done) {
          acabou = true;
          controle.enqueue(new Uint8Array(m.fim()));
          controle.close();
          return;
        }
        controle.enqueue(new Uint8Array(m.arquivo(r.value)));
      } catch (e) {
        acabou = true;
        controle.error(e);
      }
    },
    async cancel() {
      acabou = true;
      await it.return?.();
    },
  });
}

/** O zip inteiro de uma vez (testes e pacotes pequenos). */
export function zipInteiro(arquivos: readonly ArquivoZip[], data = new Date()): Uint8Array {
  const m = new Montador(data);
  return new Uint8Array(Buffer.concat([...arquivos.map((a) => m.arquivo(a)), m.fim()]));
}

/** Lê um zip feito aqui (pelo diretório central): nome → bytes. Confere o CRC de cada arquivo. */
export function lerZip(zip: Uint8Array): Map<string, Buffer> {
  const b = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  const fim = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fim < 0) throw new Error("zip sem fim");
  const n = b.readUInt16LE(fim + 10);
  let p = b.readUInt32LE(fim + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < n; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error("diretório central quebrado");
    const metodo = b.readUInt16LE(p + 10);
    const crc = b.readUInt32LE(p + 16);
    const tam = b.readUInt32LE(p + 20);
    const nomeLen = b.readUInt16LE(p + 28);
    const extra = b.readUInt16LE(p + 30);
    const coment = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const nome = b.subarray(p + 46, p + 46 + nomeLen).toString("utf8");
    const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const bruto = b.subarray(inicio, inicio + tam);
    const dados = metodo === 8 ? inflateRawSync(bruto) : Buffer.from(bruto);
    if (crc32(dados) !== crc) throw new Error(`CRC errado em ${nome}`);
    out.set(nome, dados);
    p += 46 + nomeLen + extra + coment;
  }
  return out;
}
