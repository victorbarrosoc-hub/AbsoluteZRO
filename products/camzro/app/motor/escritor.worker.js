// CAMZRO · escritor de arquivo num worker, direto no armazenamento do site (OPFS) com createSyncAccessHandle.
//
// Por que num worker: o acesso síncrono grava no lugar, sem arquivo temporário. Se o app fechar, o telefone tocar ou
// a bateria acabar no meio do take, o que já foi escrito fica no arquivo (com os fragmentos do MP4, dá para abrir até
// o último segundo). O createWritable() da página só confirma no close(): perderia o take inteiro.
//
// Mensagens: { id, tipo: 'abrir', caminho: ['clipes', 'A001C001….mp4'] } · { id, tipo: 'escrever', pos, dados }
// · { id, tipo: 'descarregar' } · { id, tipo: 'fechar' }. Resposta: { id, ok, erro?, tamanho? }.

let alca = null
let escritos = 0
let ultimoFlush = 0

async function arquivo(caminho) {
  let dir = await navigator.storage.getDirectory()
  for (const parte of caminho.slice(0, -1)) dir = await dir.getDirectoryHandle(parte, { create: true })
  return dir.getFileHandle(caminho[caminho.length - 1], { create: true })
}

self.onmessage = async ({ data: m }) => {
  try {
    if (m.tipo === 'abrir') {
      if (alca) throw new Error('já tem um arquivo aberto')
      const h = await arquivo(m.caminho)
      if (typeof h.createSyncAccessHandle !== 'function') throw new Error('sem-acesso-sincrono')
      alca = await h.createSyncAccessHandle()
      alca.truncate(0)
      escritos = 0
      ultimoFlush = performance.now()
      return self.postMessage({ id: m.id, ok: true })
    }
    if (m.tipo === 'escrever') {
      if (!alca) throw new Error('nenhum arquivo aberto')
      const dados = new Uint8Array(m.dados)
      let feito = 0
      while (feito < dados.byteLength) feito += alca.write(dados.subarray(feito), { at: m.pos + feito })
      escritos += dados.byteLength
      // a cada ~1 s o que foi escrito vai para o disco de verdade (sobrevive a desligar o telefone)
      if (performance.now() - ultimoFlush > 1000) {
        alca.flush()
        ultimoFlush = performance.now()
      }
      return self.postMessage({ id: m.id, ok: true, escritos })
    }
    if (m.tipo === 'descarregar') {
      alca?.flush()
      return self.postMessage({ id: m.id, ok: true })
    }
    if (m.tipo === 'fechar') {
      let tamanho = 0
      if (alca) {
        alca.flush()
        tamanho = alca.getSize()
        alca.close()
      }
      alca = null
      return self.postMessage({ id: m.id, ok: true, tamanho })
    }
    throw new Error(`mensagem desconhecida: ${m.tipo}`)
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, erro: String(e?.message || e) })
  }
}
