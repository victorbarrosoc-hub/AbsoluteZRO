// Lê o texto de uma DCTL de cor (transformação por pixel, sem textura) e devolve a mesma conta em JavaScript, para o
// teste comparar com o motor. Não é um compilador de C: cobre só o jeito como a Revela escreve DCTL (src/cor/dctl-lab.js):
// funções __DEVICE__ numa linha de assinatura, float/int/float3, make_float3 sem mexer nos membros depois, literais com
// "f", as funções de conta do Resolve (_powf, _log2f…) e DEFINE_UI_PARAMS.

// com `f32`, o resultado de cada função de conta é arredondado para 32 bits (como na placa de vídeo) e precisa ser um
// número: estouro de exponencial ou raiz de negativo aparecem aqui, não só no Resolve
const CONTAS = `
const R = F32 ? (v) => { const x = Math.fround(v); if (!Number.isFinite(x)) throw new Error('conta sem número na DCTL: ' + v); return x } : (v) => v
const _powf = (a, b) => R(Math.pow(a, b)), _expf = (x) => R(Math.exp(x)), _exp2f = (x) => R(2 ** x), _logf = (x) => R(Math.log(x)), _log2f = (x) => R(Math.log2(x)), _log10f = (x) => R(Math.log10(x))
const _sqrtf = (x) => R(Math.sqrt(x)), _fabs = Math.abs, _fmaxf = Math.max, _fminf = Math.min, _tanhf = (x) => R(Math.tanh(x))
const _cosf = (x) => R(Math.cos(x)), _sinf = (x) => R(Math.sin(x)), _atan2f = (a, b) => R(Math.atan2(a, b)), _hypotf = (a, b) => R(Math.hypot(a, b))
const _clampf = (v, a, b) => Math.min(b, Math.max(a, v)), _fmod = (a, b) => R(a % b)
const mk3 = (x, y, z) => ({ x: R(x), y: R(y), z: R(z) })
`

/** As funções de conta do Resolve que a tradução conhece. */
export const CONTAS_DO_RESOLVE = ['_powf', '_expf', '_exp2f', '_logf', '_log2f', '_log10f', '_sqrtf', '_fabs', '_fmaxf', '_fminf', '_tanhf', '_cosf', '_sinf', '_atan2f', '_hypotf', '_clampf', '_fmod']

/**
 * `texto`: a DCTL. Devolve { parametros: { p_Nome: { valor, tipo } }, aplicar(r, g, b, trocas) }: `trocas` muda
 * parâmetros da interface (por nome) só naquela chamada, como a pessoa mexendo no nó. `f32`: arredonda como a placa.
 */
export function lerDctl(texto, { f32 = false } = {}) {
  const parametros = {}
  let corpo = texto
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .filter((l) => {
      const m = /^DEFINE_UI_PARAMS\((\w+),\s*[^,]+,\s*(DCTLUI_\w+),\s*([-+0-9.e]+)/.exec(l.trim())
      if (!m) return true
      parametros[m[1]] = { tipo: m[2], valor: Number(m[3]) }
      return false
    })
    .join('\n')
  if (/DEFINE_UI_PARAMS/.test(corpo)) throw new Error('DEFINE_UI_PARAMS fora do formato esperado')

  corpo = corpo
    .replace(/__CONSTANT__ (?:float|int) /g, 'const ')
    .replace(/__DEVICE__ (?:float3|float|int) (\w+)\(([^)]*)\)/g, (_, nome, args) => `function ${nome}(${args.split(',').map((a) => a.trim().split(/\s+/).pop()).join(', ')})`)
    .replace(/\(float\)\(/g, '(')
    .replace(/\(int\)\(/g, 'Math.trunc(')
    .replace(/\b(?:float3|float|int) (?=[A-Za-z_]\w*\s*(?:=|;|,))/g, 'let ')
    .replace(/(?<![A-Za-z_\d])(\d+\.\d*(?:e[+-]?\d+)?|\d+e[+-]?\d+)f\b/g, '$1')
    .replace(/\bmake_float3\(/g, 'mk3(')
  for (const resto of ['__DEVICE__', '__CONSTANT__', 'float3 ', 'float ']) if (corpo.includes(resto)) throw new Error(`Sobrou "${resto.trim()}" sem tradução na DCTL`)

  const nomes = Object.keys(parametros)
  const fabrica = new Function('P', 'F32', `"use strict"\n${CONTAS}\nlet ${nomes.map((n) => `${n} = P.${n}`).join(', ')}\n${corpo}\nreturn (r, g, b, T) => {\n${nomes.map((n) => `  ${n} = T && T.${n} !== undefined ? T.${n} : P.${n}`).join('\n')}\n  const o = transform(1920, 1080, 0, 0, r, g, b)\n  return [o.x, o.y, o.z]\n}`)
  const padrao = Object.fromEntries(nomes.map((n) => [n, parametros[n].valor]))
  return { parametros, aplicar: fabrica(padrao, f32) }
}
