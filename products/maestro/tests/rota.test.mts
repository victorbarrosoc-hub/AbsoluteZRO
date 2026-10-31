// Lugares (Photon) e km de carro (OSRM) da calculadora de deslocamento, com os serviços de mentira
// (tests/rota-fixture.mts): ligados por padrão (o titular pediu o km medido sozinho, 29/10/2026) e MAESTRO_SERVICOS_ABERTOS=0
// desliga; a busca vai presa ao Brasil e com o nome do Maestro; a mesma pergunta não sai duas vezes; serviço fora do
// ar lança (a ação diz "Digite os km" e a tela segue aberta). Sem banco e sem rede de verdade.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { melhorLugar, nomeDoLugar } from "../src/lib/orcamento/deslocamento";
import { iniciarRotaFalsa } from "./rota-fixture.mts";

const falso = await iniciarRotaFalsa();
process.env.MAESTRO_PHOTON_URL = falso.photon;
process.env.MAESTRO_OSRM_URL = falso.osrm;
const servicos = await import("../src/lib/orcamento/servicos");

after(async () => {
  delete process.env.MAESTRO_PHOTON_URL;
  delete process.env.MAESTRO_OSRM_URL;
  delete process.env.MAESTRO_SERVICOS_ABERTOS;
  await falso.fechar();
});

describe("Photon e OSRM", () => {
  test("ligados por padrão: São Paulo → Natal digitados viram lugar e km", async () => {
    delete process.env.MAESTRO_SERVICOS_ABERTOS;
    assert.equal(servicos.servicosAbertos(), true);
    const de = melhorLugar(await servicos.buscarLugares("sao paulo"), "sao paulo");
    const para = melhorLugar(await servicos.buscarLugares("Natal", { lat: de!.lat, lon: de!.lon }), "Natal");
    assert.deepEqual([nomeDoLugar(de!), nomeDoLugar(para!)], ["São Paulo/SP", "Natal/RN"]);
    assert.deepEqual(await servicos.medirRota(de!, para!), { km: 2923.1, minutos: 2445 });
    const busca = new URLSearchParams(falso.estado.pedidos.find((p) => p.includes("Natal"))!.split("?")[1]);
    assert.equal(busca.get("bbox"), "-74.1,-34.0,-28.6,5.4", "só o Brasil");
    assert.deepEqual([busca.get("lat"), busca.get("lon")], ["-23.55", "-46.63"], "perto da saída, sem a coordenada exata");
  });

  test("a mesma pergunta não sai duas vezes (uso justo)", async () => {
    const antes = falso.estado.pedidos.length;
    await servicos.buscarLugares("sao paulo");
    await servicos.buscarLugares("  SAO   paulo ");
    await servicos.medirRota({ lat: -23.5505, lon: -46.633 }, { lat: -5.8054, lon: -35.2081 });
    assert.equal(falso.estado.pedidos.length, antes);
    assert.deepEqual(await servicos.buscarLugares("x"), [], "texto curto nem pergunta");
  });

  test("fora do ar: lança (a tela pede os km); desligados: nada sai", async () => {
    falso.estado.fora = true;
    await assert.rejects(servicos.buscarLugares("Campinas"), /503/);
    await assert.rejects(servicos.medirRota({ lat: -22.9, lon: -47.06 }, { lat: -5.8, lon: -35.2 }), /503/);
    falso.estado.fora = false;
    process.env.MAESTRO_SERVICOS_ABERTOS = "0";
    const antes = falso.estado.pedidos.length;
    assert.equal(servicos.servicosAbertos(), false);
    assert.deepEqual(await servicos.buscarLugares("Campinas"), []);
    assert.equal(await servicos.medirRota({ lat: -22.9, lon: -47.06 }, { lat: -5.8, lon: -35.2 }), null);
    assert.equal(falso.estado.pedidos.length, antes);
  });
});
