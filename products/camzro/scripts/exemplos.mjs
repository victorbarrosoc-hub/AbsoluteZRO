// Gera o exemplo do contrato camzro.clip/1 (docs/integration-contracts/exemplos/camzro.clip.v1.json) com o próprio
// código do CAMZRO (nucleo/metadados.js). test/contrato.test.js confere que o arquivo do repositório é este.
import { writeFileSync } from 'node:fs'
import { sidecar } from '../app/nucleo/metadados.js'
import { CLAQUETE_INICIAL } from '../app/nucleo/claquete.js'

export function exemploSidecar() {
  return sidecar({
    arquivo: 'A001C007_261109_K3F2.mov',
    nome: 'A001C007_261109_K3F2',
    inicioMs: Date.UTC(2026, 10, 9, 13, 20, 4, 500),
    duracao: 12.5,
    quadros: 300,
    fps: 24,
    df: false,
    tcInicio: 24 * (10 * 3600 + 20 * 60 + 4) + 12,
    tcFonte: 'relogio-do-set',
    claquete: { ...CLAQUETE_INICIAL, projeto: 'Café Aurora', cena: '1', plano: 'A', take: 3, camera: 'A', rolo: 1, clipe: 7 },
    bom: true,
    notas: 'Melhor do drone; foco ok.',
    video: { codec: 'hevc', largura: 3840, altura: 2160, bitrate: 160_000_000, quadroChave: 1, perdidos: 0, motor: 'webcodecs' },
    audio: { codec: 'pcm-s24', taxa: 48000, canais: 2 },
    aparelho: 'K3F2',
    camera: { iso: 100, tempo: 1 / 50, angulo: 172.8, kelvin: 5600, zoom: 1, lente: '24 mm', anamorfico: 1, lut: 'Kodak 2383', nd: 0.9 },
    sincronia: { bip_s: 0.712, hz: 1000, ms: 160, assinatura: 'tpeasy' },
    maestro: { contrato: 'maestro.roteiro/1', roteiro_id: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f', versao: 3, cena_id: 'c1', plano_id: 'p1' },
  })
}

export const CAMINHO = new URL('../../../docs/integration-contracts/exemplos/camzro.clip.v1.json', import.meta.url)

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  writeFileSync(CAMINHO, `${JSON.stringify(exemploSidecar(), null, 2)}\n`)
  console.log('exemplo do camzro.clip/1 gravado')
}
