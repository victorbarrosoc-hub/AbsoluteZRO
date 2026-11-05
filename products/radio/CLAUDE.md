# Rádio do set — regras para Claude Code

Plataforma nova (ADR 0042, nome a definir). As regras do `CLAUDE.md` da raiz valem aqui; este arquivo só acrescenta.

- **Não lançado**: a página e os scripts só saem por `api/pagina.js` e `api/recurso.js` depois do gate (claim
  `zro_release` com `radio`). Nada do app no site estático, no OG, no robots ou em lista de outro app.
- **Sem integração** com as outras plataformas por enquanto (titular, 05/11/2026). Integração nova = contrato em
  `docs/integration-contracts/` antes do código.
- **Voz nunca no servidor**: nem gravação, nem transcrição, nem amostra de teste no repositório (testes usam o
  microfone falso do Chromium).
- Toda tabela com RLS e teste de isolamento em `test/banco.test.js`; rotas só por `comoPessoa`.
- O modo local (`RADIO_LOCAL=1`) é só para desenvolver: nunca ligar em produção.
- Antes de entregar: `npm test` nesta pasta (Postgres e Chromium de verdade).
