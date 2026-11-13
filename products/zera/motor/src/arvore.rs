//! A árvore em memória: um vetor de nós (arena), cada um com o índice do pai e dos filhos. A interface só pede o que
//! mostra (uma pasta, três anéis), então nunca passa a árvore inteira pela ponte.
//!
//! Mudanças depois da varredura (o vigia do app viu uma pasta mudar, ou um item foi para o Lixo) trocam só o trecho
//! afetado e corrigem os ancestrais pela diferença, sem varrer de novo o resto.

use crate::tipos;
use crate::varrer::{Arq, Pasta};
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};

pub const SEM_PAI: u32 = u32::MAX;

pub struct No {
    pub nome: Box<str>,
    pub pai: u32,
    pub filhos: Vec<u32>,
    /// espaço ocupado no disco
    pub bytes: u64,
    /// tamanho lógico (arquivos; serve aos duplicados)
    pub tamanho: u64,
    pub arquivos: u64,
    pub mtime: i64,
    pub pasta: bool,
    pub vivo: bool,
    /// arquivo: o tipo; pasta: o tipo que mais ocupa dentro dela
    pub tipo: u8,
    /// só pastas: bytes por tipo
    pub por_tipo: Option<Box<[u64; tipos::QTD]>>,
}

pub struct Arvore {
    pub nos: Vec<No>,
    pub raiz: PathBuf,
    /// quando foi varrida (segundos desde 1970)
    pub quando: i64,
    pub mortos: usize,
}

fn dominante(v: &[u64; tipos::QTD]) -> u8 {
    let mut m = tipos::OUTROS;
    let mut b = 0;
    for (i, x) in v.iter().enumerate() {
        if *x > b {
            b = *x;
            m = i as u8;
        }
    }
    m
}

pub fn agora() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

impl Arvore {
    pub fn de_varredura(raiz: PathBuf, p: Pasta) -> Arvore {
        let mut a = Arvore { nos: Vec::with_capacity((p.arquivos as usize) + 1024), raiz, quando: agora(), mortos: 0 };
        a.anexar(p, SEM_PAI);
        a
    }

    fn no_arquivo(arq: Arq, pai: u32) -> No {
        No {
            nome: arq.nome,
            pai,
            filhos: Vec::new(),
            bytes: arq.bytes,
            tamanho: arq.tamanho,
            arquivos: 1,
            mtime: arq.mtime,
            pasta: false,
            vivo: true,
            tipo: arq.tipo,
            por_tipo: None,
        }
    }

    /// Põe a pasta varrida (e tudo dentro) como filha de `pai`. Devolve o id dela.
    pub fn anexar(&mut self, p: Pasta, pai: u32) -> u32 {
        let id = self.nos.len() as u32;
        self.nos.push(No {
            nome: p.nome,
            pai,
            filhos: Vec::new(),
            bytes: p.bytes,
            tamanho: 0,
            arquivos: p.arquivos,
            mtime: p.mtime,
            pasta: true,
            vivo: true,
            tipo: dominante(&p.por_tipo),
            por_tipo: Some(Box::new(p.por_tipo)),
        });
        let filhos = self.anexar_conteudo(id, p.arqs, p.subpastas);
        self.nos[id as usize].filhos = filhos;
        id
    }

    fn anexar_conteudo(&mut self, id: u32, arqs: Vec<Arq>, subpastas: Vec<Pasta>) -> Vec<u32> {
        let mut filhos = Vec::with_capacity(arqs.len() + subpastas.len());
        for a in arqs {
            filhos.push(self.nos.len() as u32);
            self.nos.push(Self::no_arquivo(a, id));
        }
        for s in subpastas {
            filhos.push(self.anexar(s, id));
        }
        filhos
    }

    pub fn no(&self, id: u32) -> Option<&No> {
        self.nos.get(id as usize).filter(|n| n.vivo)
    }

    pub fn caminho(&self, id: u32) -> PathBuf {
        let mut nomes = Vec::new();
        let mut i = id;
        while i != 0 && i != SEM_PAI {
            let n = &self.nos[i as usize];
            nomes.push(&*n.nome);
            i = n.pai;
        }
        let mut c = self.raiz.clone();
        for n in nomes.iter().rev() {
            c.push(n);
        }
        c
    }

    /// Caminho mostrado na tela: relativo à raiz.
    pub fn caminho_curto(&self, id: u32) -> String {
        let c = self.caminho(id);
        c.strip_prefix(&self.raiz).map(|r| r.to_string_lossy().into_owned()).unwrap_or_default()
    }

    /// Acha o nó de um caminho absoluto. Devolve o nó mais fundo que existe e se achou o caminho inteiro.
    pub fn achar(&self, caminho: &Path) -> Option<(u32, bool)> {
        let resto = caminho.strip_prefix(&self.raiz).ok()?;
        let mut atual = 0u32;
        for comp in resto.components() {
            let Component::Normal(nome) = comp else { continue };
            let nome = nome.to_string_lossy();
            let achado = self.nos[atual as usize].filhos.iter().copied().find(|f| {
                let n = &self.nos[*f as usize];
                n.vivo && *n.nome == *nome
            });
            match achado {
                Some(f) => atual = f,
                None => return Some((atual, false)),
            }
        }
        Some((atual, true))
    }

    /// Tipo herdado de um pacote acima do nó (para revarrer o trecho com o mesmo tipo).
    pub fn herdado(&self, id: u32) -> Option<u8> {
        let mut i = id;
        let mut achado = None;
        while i != SEM_PAI {
            let n = &self.nos[i as usize];
            if i != 0 {
                if let Some(t) = tipos::de_pacote(&n.nome) {
                    achado = Some(t);
                }
            }
            i = n.pai;
        }
        achado
    }

    fn matar(&mut self, id: u32) {
        let mut pilha = vec![id];
        while let Some(i) = pilha.pop() {
            let n = &mut self.nos[i as usize];
            if n.vivo {
                n.vivo = false;
                self.mortos += 1;
            }
            pilha.extend(std::mem::take(&mut n.filhos));
        }
    }

    /// Soma `d` (bytes, arquivos, por tipo) em `id` e em todos os ancestrais.
    fn ajustar(&mut self, mut id: u32, db: i128, da: i128, dt: &[i128; tipos::QTD]) {
        while id != SEM_PAI {
            let n = &mut self.nos[id as usize];
            n.bytes = (n.bytes as i128 + db).max(0) as u64;
            n.arquivos = (n.arquivos as i128 + da).max(0) as u64;
            if let Some(pt) = n.por_tipo.as_mut() {
                for i in 0..tipos::QTD {
                    pt[i] = (pt[i] as i128 + dt[i]).max(0) as u64;
                }
                n.tipo = dominante(pt);
            }
            id = n.pai;
        }
    }

    fn por_tipo_de(&self, id: u32) -> [u64; tipos::QTD] {
        let n = &self.nos[id as usize];
        match &n.por_tipo {
            Some(p) => **p,
            None => {
                let mut v = [0; tipos::QTD];
                v[n.tipo as usize] = n.bytes;
                v
            }
        }
    }

    /// Tira o nó da árvore (foi para o Lixo ou sumiu do disco). Não mexe no disco.
    pub fn remover(&mut self, id: u32) -> bool {
        if id == 0 || self.no(id).is_none() {
            return false;
        }
        let n = &self.nos[id as usize];
        let (pai, db, da) = (n.pai, -(n.bytes as i128), -(n.arquivos as i128));
        let pt = self.por_tipo_de(id);
        let dt = pt.map(|x| -(x as i128));
        self.nos[pai as usize].filhos.retain(|f| *f != id);
        self.matar(id);
        self.ajustar(pai, db, da, &dt);
        true
    }

    /// Troca o conteúdo da pasta `id` pelo que acabou de ser varrido no mesmo caminho.
    pub fn substituir(&mut self, id: u32, p: Pasta) {
        let antes = self.por_tipo_de(id);
        let n = &self.nos[id as usize];
        let (db, da, pai) = (p.bytes as i128 - n.bytes as i128, p.arquivos as i128 - n.arquivos as i128, n.pai);
        let mut dt = [0i128; tipos::QTD];
        for i in 0..tipos::QTD {
            dt[i] = p.por_tipo[i] as i128 - antes[i] as i128;
        }
        for f in std::mem::take(&mut self.nos[id as usize].filhos) {
            self.matar(f);
        }
        let novos = self.anexar_conteudo(id, p.arqs, p.subpastas);
        let n = &mut self.nos[id as usize];
        n.filhos = novos;
        n.bytes = p.bytes;
        n.arquivos = p.arquivos;
        n.mtime = p.mtime;
        n.tipo = dominante(&p.por_tipo);
        n.por_tipo = Some(Box::new(p.por_tipo));
        if pai != SEM_PAI {
            self.ajustar(pai, db, da, &dt);
        }
    }

    pub fn info(&self, id: u32) -> Value {
        let n = &self.nos[id as usize];
        let mut v = json!({
            "id": id, "n": &*n.nome, "b": n.bytes, "a": n.arquivos, "p": n.pasta, "k": n.tipo, "m": n.mtime,
        });
        if n.pasta {
            v["q"] = json!(n.filhos.len());
            if let Some(pt) = &n.por_tipo {
                v["pt"] = json!(pt.as_slice());
            }
        }
        v
    }

    fn filhos_ordenados(&self, id: u32) -> Vec<u32> {
        let mut f: Vec<u32> = self.nos[id as usize].filhos.iter().copied().filter(|f| self.nos[*f as usize].vivo).collect();
        f.sort_unstable_by(|a, b| self.nos[*b as usize].bytes.cmp(&self.nos[*a as usize].bytes));
        f
    }

    /// Uma pasta: ela, o caminho até ela e os filhos do maior para o menor (até `max`; o resto vira um total).
    pub fn abrir(&self, id: u32, max: usize) -> Option<Value> {
        self.no(id)?;
        let mut trilha = Vec::new();
        let mut i = id;
        while i != SEM_PAI {
            trilha.push(json!({"id": i, "n": if i == 0 { self.raiz.to_string_lossy().into_owned() } else { self.nos[i as usize].nome.to_string() }}));
            i = self.nos[i as usize].pai;
        }
        trilha.reverse();
        let f = self.filhos_ordenados(id);
        let (mostrar, resto) = f.split_at(f.len().min(max));
        let resto_b: u64 = resto.iter().map(|x| self.nos[*x as usize].bytes).sum();
        Some(json!({
            "no": self.info(id),
            "trilha": trilha,
            "filhos": mostrar.iter().map(|x| self.info(*x)).collect::<Vec<_>>(),
            "resto": {"qtd": resto.len(), "b": resto_b},
            "raiz": self.raiz.to_string_lossy(),
            "quando": self.quando,
        }))
    }

    /// Os anéis em volta de `id`: `niveis` camadas; fatia menor que `min` do total vira "outros" (cinza).
    pub fn anel(&self, id: u32, niveis: u32, min: f64) -> Option<Value> {
        let total = self.no(id)?.bytes.max(1) as f64;
        Some(self.anel_de(id, niveis, (min * total) as u64))
    }

    fn anel_de(&self, id: u32, niveis: u32, corte: u64) -> Value {
        let n = &self.nos[id as usize];
        let mut v = json!({"id": id, "n": &*n.nome, "b": n.bytes, "k": n.tipo, "p": n.pasta});
        if n.pasta && niveis > 0 {
            let mut filhos = Vec::new();
            let (mut ob, mut oq) = (0u64, 0u64);
            for f in self.filhos_ordenados(id) {
                let b = self.nos[f as usize].bytes;
                if b >= corte && b > 0 {
                    filhos.push(self.anel_de(f, niveis - 1, corte));
                } else {
                    ob += b;
                    oq += 1;
                }
            }
            if ob > 0 {
                filhos.push(json!({"id": null, "n": "", "b": ob, "o": oq, "k": tipos::OUTROS}));
            }
            v["f"] = Value::Array(filhos);
        }
        v
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::varrer::{Arq, Pasta};

    fn arq(nome: &str, bytes: u64, tipo: u8) -> Arq {
        Arq { nome: nome.into(), bytes, tamanho: bytes, mtime: 0, tipo }
    }

    fn pasta(nome: &str, arqs: Vec<Arq>, subpastas: Vec<Pasta>) -> Pasta {
        let mut p = Pasta { nome: nome.into(), bytes: 0, arquivos: 0, mtime: 0, por_tipo: [0; tipos::QTD], arqs: Vec::new(), subpastas: Vec::new() };
        for a in &arqs {
            p.bytes += a.bytes;
            p.arquivos += 1;
            p.por_tipo[a.tipo as usize] += a.bytes;
        }
        for s in &subpastas {
            p.bytes += s.bytes;
            p.arquivos += s.arquivos;
            for i in 0..tipos::QTD {
                p.por_tipo[i] += s.por_tipo[i];
            }
        }
        p.arqs = arqs;
        p.subpastas = subpastas;
        p
    }

    fn exemplo() -> Arvore {
        let p = pasta(
            "/r",
            vec![arq("solto.txt", 10, tipos::OUTROS)],
            vec![
                pasta("Filmes", vec![arq("a.mov", 1000, tipos::VIDEO), arq("b.mov", 500, tipos::VIDEO)], vec![]),
                pasta("Som", vec![arq("c.wav", 300, tipos::AUDIO)], vec![pasta("Velho", vec![arq("d.wav", 200, tipos::AUDIO)], vec![])]),
            ],
        );
        Arvore::de_varredura(PathBuf::from("/r"), p)
    }

    #[test]
    fn caminho_e_achar() {
        let a = exemplo();
        let (id, inteiro) = a.achar(Path::new("/r/Som/Velho/d.wav")).unwrap();
        assert!(inteiro);
        assert_eq!(a.caminho(id), PathBuf::from("/r/Som/Velho/d.wav"));
        assert_eq!(a.caminho_curto(id), "Som/Velho/d.wav");
        let (perto, inteiro) = a.achar(Path::new("/r/Som/Novo/x")).unwrap();
        assert!(!inteiro);
        assert_eq!(&*a.nos[perto as usize].nome, "Som");
        assert!(a.achar(Path::new("/outro")).is_none());
    }

    #[test]
    fn remover_corrige_ancestrais() {
        let mut a = exemplo();
        assert_eq!(a.nos[0].bytes, 2010);
        let (velho, _) = a.achar(Path::new("/r/Som/Velho")).unwrap();
        assert!(a.remover(velho));
        assert_eq!(a.nos[0].bytes, 1810);
        assert_eq!(a.nos[0].arquivos, 4);
        assert_eq!(a.nos[0].por_tipo.as_ref().unwrap()[tipos::AUDIO as usize], 300);
        assert!(!a.remover(velho), "não remove duas vezes");
        assert!(!a.remover(0), "a raiz não sai");
    }

    #[test]
    fn substituir_troca_so_o_trecho() {
        let mut a = exemplo();
        let (filmes, _) = a.achar(Path::new("/r/Filmes")).unwrap();
        a.substituir(filmes, pasta("Filmes", vec![arq("a.mov", 1000, tipos::VIDEO), arq("novo.mov", 4000, tipos::VIDEO)], vec![]));
        assert_eq!(a.nos[0].bytes, 2010 - 500 + 4000);
        assert!(a.achar(Path::new("/r/Filmes/novo.mov")).unwrap().1);
        assert!(!a.achar(Path::new("/r/Filmes/b.mov")).unwrap().1);
        assert_eq!(a.nos[filmes as usize].tipo, tipos::VIDEO);
    }

    #[test]
    fn abrir_ordena_e_resume() {
        let a = exemplo();
        let v = a.abrir(0, 2).unwrap();
        let f = v["filhos"].as_array().unwrap();
        assert_eq!(f[0]["n"], "Filmes");
        assert_eq!(f[1]["n"], "Som");
        assert_eq!(v["resto"]["qtd"], 1);
        assert_eq!(v["resto"]["b"], 10);
    }

    #[test]
    fn anel_junta_o_pequeno() {
        let a = exemplo();
        let v = a.anel(0, 2, 0.05).unwrap();
        let f = v["f"].as_array().unwrap();
        // solto.txt (10 de 2010) vira "outros"
        assert!(f.iter().any(|x| x["id"].is_null() && x["b"] == 10));
    }
}
