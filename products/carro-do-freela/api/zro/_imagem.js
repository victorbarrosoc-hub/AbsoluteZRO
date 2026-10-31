/**
 * AS IMAGENS DA SEDE (0005) — logo da guilda e foto do set, no molde da capa do Quadro do Maestro
 * (products/maestro/src/lib/quadro/capa.ts): só PNG, JPEG ou WebP conferidos pelos PRIMEIROS BYTES (nunca SVG nem o
 * que o navegador disser). O sharp decodifica, gira pela orientação, tira TODOS os metadados (EXIF, GPS, XMP) e
 * reencoda em WebP: o logo até 512 px e 64 KB, a foto até 1600 px e 256 KB. O que vai ao banco é sempre essa versão
 * limpa, com o sha256 conferido também por check no banco.
 *
 *   POST   /api/zro/sede-imagem?tipo=logo|foto   (corpo = os bytes da imagem; até 4 MB)  → 201 { imagem: { id, url, ... } }
 *   DELETE /api/zro/sede-imagem?tipo=logo                                                 → 204 (volta o emblema de iniciais)
 *   GET    /api/zro/sede-imagem?id=<uuid>&sha=<hex>  → os bytes, só para quem é da guilda (porta guilda_imagem)
 *
 * O logo só o dono troca; a foto qualquer membro manda (para o quadro ou o chat). Cota por guilda: COTA_IMAGENS, igual a
 * carro_do_freela.guilda_imagens_cota() (o teste confere). ⚠️ 404 até a fase 2 (db/fase.js).
 */
const crypto = require('crypto');
const { UUID } = require('../../db/banco.js');
const { json, preparar, responderErro, semConteudo, protegido, FASES } = require('./_dados.js')._comum;

const COTA_IMAGENS = 50 * 1024 * 1024;
const ENTRADA_MAX = 4 * 1024 * 1024; /* a Vercel recusa corpo acima de 4,5 MB; a tela já reduz a foto antes de mandar */
const PIXELS_MAX = 40000000;
const ALVO = {
  logo: { degraus: [[512, 82], [512, 70], [384, 66], [256, 60]], max: 64 * 1024 },
  foto: { degraus: [[1600, 78], [1600, 66], [1280, 62], [1024, 58], [800, 52]], max: 256 * 1024 },
};

/** o tipo pelos primeiros bytes (o cabeçalho do pedido não vale) */
function tipoPelosBytes(b) {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** decodifica, limpa e reencoda; devolve { ok, webp, sha256, largura, altura } ou { ok:false, erro } */
async function prepararImagem(bytes, tipo) {
  const alvo = ALVO[tipo];
  if (!alvo) return { ok: false, erro: 'tipo' };
  if (!bytes.length) return { ok: false, erro: 'vazio' };
  if (bytes.length > ENTRADA_MAX) return { ok: false, erro: 'grande' };
  const formato = tipoPelosBytes(bytes);
  if (!formato) return { ok: false, erro: 'formato' };
  const sharp = require('sharp');
  try {
    const meta = await sharp(bytes, { limitInputPixels: PIXELS_MAX, failOn: 'error', pages: 1 }).metadata();
    if (meta.format !== formato) return { ok: false, erro: 'invalida' };
    for (const [lado, qualidade] of alvo.degraus) {
      const { data, info } = await sharp(bytes, { limitInputPixels: PIXELS_MAX, failOn: 'error', pages: 1 })
        .rotate()
        .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: qualidade, alphaQuality: 90, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= alvo.max)
        return { ok: true, webp: data, sha256: crypto.createHash('sha256').update(data).digest('hex'), largura: info.width, altura: info.height };
    }
    return { ok: false, erro: 'grande' };
  } catch (e) {
    return { ok: false, erro: 'invalida' };
  }
}

async function lerBytes(req, max) {
  let n = 0;
  const partes = [];
  for await (const c of req) {
    n += c.length;
    if (n > max) throw new Error('grande');
    partes.push(c);
  }
  return Buffer.concat(partes);
}

async function sedeImagem(req, res) {
  if (!FASES.guildaNoAr()) return json(res, 404, { erro: 'nao_encontrado' });
  const escrita = req.method !== 'GET';
  const p = await preparar(req, res, { metodos: ['GET', 'POST', 'DELETE'], escrita, formato: /^image\/(png|jpeg|webp)\b/ });
  if (!p) return;
  const { db, sub, extra } = p;
  const q = new URL(req.url, 'http://x').searchParams;
  try {
    if (req.method === 'GET') {
      const id = q.get('id'), sha = q.get('sha');
      if (!UUID.test(String(id)) || !/^[0-9a-f]{64}$/.test(String(sha))) return json(res, 400, { erro: 'pedido' }, extra);
      const b = await db.asUser(sub, async c => (await c.query('select carro_do_freela.guilda_imagem($1, $2) as b', [id.toLowerCase(), sha])).rows[0].b);
      if (!b) return json(res, 404, { erro: 'nao_achado' }, extra);
      res.writeHead(200, Object.assign({
        'Content-Type': 'image/webp', 'Content-Length': b.length, 'X-Content-Type-Options': 'nosniff',
        /* o endereço leva o sha256: o conteúdo nunca muda; só o navegador desta pessoa guarda */
        'Cache-Control': 'private, max-age=31536000, immutable', ETag: '"' + sha + '"',
        'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin',
      }, extra));
      return res.end(b);
    }
    const tipo = q.get('tipo');
    if (tipo !== 'logo' && tipo !== 'foto') return json(res, 400, { erro: 'tipo', campo: 'tipo' }, extra);
    if (req.method === 'DELETE') {
      if (tipo !== 'logo') return json(res, 400, { erro: 'tipo', campo: 'tipo' }, extra);
      await db.asUser(sub, async c => c.query('select carro_do_freela.guilda_logo_tirar()'));
      return semConteudo(res, extra);
    }
    let bytes;
    try { bytes = await lerBytes(req, ENTRADA_MAX) } catch (e) { return json(res, 413, { erro: 'grande' }, extra) }
    const im = await prepararImagem(bytes, tipo);
    if (!im.ok) return json(res, im.erro === 'grande' ? 413 : 415, { erro: im.erro }, extra);
    const id = await db.asUser(sub, async c =>
      (await c.query('select carro_do_freela.guilda_imagem_guardar($1, $2, $3, $4, $5) as id', [tipo, im.webp, im.sha256, im.largura, im.altura])).rows[0].id);
    return json(res, 201, { imagem: { id, sha: im.sha256, largura: im.largura, altura: im.altura, bytes: im.webp.length,
      url: '/api/zro/sede-imagem?id=' + id + '&sha=' + im.sha256 } }, extra);
  } catch (e) {
    return responderErro(res, e, extra);
  }
}

module.exports = { sedeImagem: protegido(sedeImagem), prepararImagem, tipoPelosBytes, COTA_IMAGENS };
