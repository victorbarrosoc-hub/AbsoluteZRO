/**
 * IndexedDB de mentira, só o que o app do celular usa (public/app/lib/idb.js): open com versão e upgrade, stores com
 * keyPath, transação readonly/readwrite com get/put/delete/getAll e oncomplete. Os bancos ficam vivos entre aberturas,
 * como no navegador, para o teste "recarregar a página" e a migração v1 → v2.
 */
type Cb = ((ev?: unknown) => void) | null;

class Pedido {
  result: unknown = undefined;
  error: unknown = null;
  onsuccess: Cb = null;
  onerror: Cb = null;
  onupgradeneeded: Cb = null;
  onblocked: Cb = null;
}

class Banco {
  stores = new Map<string, { keyPath: string; dados: Map<unknown, unknown> }>();
  onversionchange: Cb = null;
  fechado = false;
  constructor(
    public name: string,
    public version: number,
  ) {}
  get objectStoreNames() {
    return { contains: (n: string) => this.stores.has(n), length: this.stores.size };
  }
  createObjectStore(nome: string, { keyPath }: { keyPath: string }) {
    if (this.stores.has(nome)) throw new Error(`ConstraintError: ${nome}`);
    this.stores.set(nome, { keyPath, dados: new Map() });
    return {};
  }
  transaction(nome: string, modo: string) {
    if (this.fechado) throw new Error("InvalidStateError");
    const store = this.stores.get(nome);
    if (!store) throw new Error(`NotFoundError: ${nome}`);
    const tx = { oncomplete: null as Cb, onerror: null as Cb, onabort: null as Cb, objectStore: () => os };
    const copia = (v: unknown) => (v === undefined ? undefined : structuredClone(v));
    const pedido = (fn: () => unknown) => {
      const r = new Pedido();
      r.result = fn();
      return r;
    };
    const escrever = () => {
      if (modo !== "readwrite") throw new Error("ReadOnlyError");
    };
    const os = {
      get: (k: unknown) => pedido(() => copia(store.dados.get(k))),
      getAll: () => pedido(() => [...store.dados.values()].map(copia)),
      put: (v: Record<string, unknown>) => {
        escrever();
        return pedido(() => {
          const k = v[store.keyPath];
          store.dados.set(k, structuredClone(v));
          return k;
        });
      },
      delete: (k: unknown) => {
        escrever();
        return pedido(() => store.dados.delete(k) && undefined);
      },
    };
    setTimeout(() => tx.oncomplete?.(), 0);
    return tx;
  }
  close() {
    this.fechado = true;
  }
}

export function criarIndexedDB() {
  const bancos = new Map<string, Banco>();
  const abertos: Banco[] = [];
  return {
    bancos,
    open(nome: string, versao = 1) {
      const req = new Pedido();
      setTimeout(() => {
        const atual = bancos.get(nome);
        if (atual && versao < atual.version) {
          req.error = new Error("VersionError");
          return req.onerror?.();
        }
        // conexões antigas recebem versionchange (como no navegador)
        if (atual && versao > atual.version) for (const b of abertos) if (b.name === nome && !b.fechado) b.onversionchange?.();
        const conexao = new Banco(nome, versao);
        if (atual) conexao.stores = atual.stores;
        const precisa = !atual || versao > atual.version;
        bancos.set(nome, conexao);
        abertos.push(conexao);
        req.result = conexao;
        if (precisa) req.onupgradeneeded?.({ oldVersion: atual?.version || 0, newVersion: versao });
        req.onsuccess?.();
      }, 0);
      return req;
    },
  };
}
