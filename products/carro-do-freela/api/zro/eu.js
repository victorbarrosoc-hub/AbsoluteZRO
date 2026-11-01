/* GET /api/zro/eu — quem está na sessão (JSON), { entrou: false } para quem não entrou, ou 401 (sessão que não vale). O app pergunta isto ao abrir. Miolo em _zro.js. */
module.exports = require('./_zro.js').eu;
