//! Arquivos repetidos, em três peneiras para ler o mínimo do disco:
//! 1. mesmo tamanho exato (já está na árvore: não lê nada);
//! 2. mesmo começo e mesmo fim (16 KB de cada ponta);
//! 3. mesmo conteúdo inteiro (BLAKE3), só para quem passou nas duas.
//!
//! Tudo em paralelo. Hard links já não entram (a varredura conta cada um uma vez). No Mac, uma cópia feita pelo Finder
//! pode ser um clone do APFS e não ocupar espaço extra: a interface avisa.

use rayon::prelude::*;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

pub struct Candidato {
    pub id: u32,
    pub caminho: PathBuf,
    pub tamanho: u64,
    pub mtime: i64,
}

pub struct GrupoDup {
    pub tamanho: u64,
    pub itens: Vec<Candidato>,
}

const PONTA: u64 = 16 * 1024;

fn pontas(c: &Candidato) -> Option<[u8; 32]> {
    let mut f = File::open(&c.caminho).ok()?;
    let mut h = blake3::Hasher::new();
    let mut buf = vec![0u8; PONTA as usize];
    let n = f.read(&mut buf).ok()?;
    h.update(&buf[..n]);
    if c.tamanho > 2 * PONTA {
        f.seek(SeekFrom::End(-(PONTA as i64))).ok()?;
        let n = f.read(&mut buf).ok()?;
        h.update(&buf[..n]);
    }
    Some(*h.finalize().as_bytes())
}

fn inteiro(c: &Candidato, lidos: &AtomicU64, cancelar: &AtomicBool) -> Option<[u8; 32]> {
    let mut f = File::open(&c.caminho).ok()?;
    let mut h = blake3::Hasher::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        if cancelar.load(Ordering::Relaxed) {
            return None;
        }
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
        lidos.fetch_add(n as u64, Ordering::Relaxed);
    }
    Some(*h.finalize().as_bytes())
}

/// Nome com cara de cópia: "x cópia.mov", "x copy 2.mov", "x (1).mov", "Copy of x".
pub fn parece_copia(c: &std::path::Path) -> bool {
    let nome = c.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
    let tem_numero = nome.ends_with(')') && nome.rfind(" (").is_some_and(|i| nome[i + 2..nome.len() - 1].chars().all(|ch| ch.is_ascii_digit()));
    tem_numero || ["cópia", "copia", "copy", "kopie", "copie"].iter().any(|m| nome.contains(m))
}

/// Agrupa por chave e devolve só os grupos com 2 ou mais.
fn peneirar<K: std::hash::Hash + Eq + Send>(grupo: Vec<Candidato>, chave: impl Fn(&Candidato) -> Option<K> + Sync) -> Vec<Vec<Candidato>> {
    let com_chave: Vec<(Option<K>, Candidato)> = grupo.into_par_iter().map(|c| (chave(&c), c)).collect();
    let mut m: HashMap<K, Vec<Candidato>> = HashMap::new();
    for (k, c) in com_chave {
        if let Some(k) = k {
            m.entry(k).or_default().push(c);
        }
    }
    m.into_values().filter(|v| v.len() > 1).collect()
}

/// `progresso(lidos, total)` é chamado de outra thread enquanto lê.
pub fn achar(candidatos: Vec<Candidato>, cancelar: &AtomicBool, progresso: &(dyn Fn(u64, u64) + Sync)) -> Vec<GrupoDup> {
    let mut por_tamanho: HashMap<u64, Vec<Candidato>> = HashMap::new();
    for c in candidatos {
        por_tamanho.entry(c.tamanho).or_default().push(c);
    }
    let grupos: Vec<Vec<Candidato>> = por_tamanho.into_values().filter(|v| v.len() > 1).collect();
    // 2ª peneira: as pontas
    let grupos: Vec<Vec<Candidato>> = grupos.into_par_iter().flat_map(|g| peneirar(g, pontas)).collect();
    if cancelar.load(Ordering::Relaxed) {
        return Vec::new();
    }
    // 3ª peneira: o conteúdo inteiro
    let total: u64 = grupos.iter().flat_map(|g| g.iter()).map(|c| c.tamanho).sum();
    let lidos = AtomicU64::new(0);
    let feito = AtomicBool::new(false);
    let mut fim = Vec::new();
    std::thread::scope(|s| {
        s.spawn(|| {
            while !feito.load(Ordering::Relaxed) {
                progresso(lidos.load(Ordering::Relaxed), total);
                std::thread::sleep(std::time::Duration::from_millis(150));
            }
        });
        fim = grupos.into_par_iter().flat_map(|g| peneirar(g, |c| inteiro(c, &lidos, cancelar))).collect();
        feito.store(true, Ordering::Relaxed);
    });
    if cancelar.load(Ordering::Relaxed) {
        return Vec::new();
    }
    let mut res: Vec<GrupoDup> = fim
        .into_iter()
        .map(|mut itens| {
            // o que fica primeiro: o que não parece cópia ("cópia", "copy", " (2)"), depois o mais antigo, depois o caminho
            // mais curto (o original costuma estar mais perto da pasta do projeto)
            itens.sort_by_key(|c| (parece_copia(&c.caminho), c.mtime, c.caminho.as_os_str().len(), c.caminho.clone()));
            GrupoDup { tamanho: itens[0].tamanho, itens }
        })
        .collect();
    res.sort_by(|a, b| (b.tamanho * (b.itens.len() as u64 - 1)).cmp(&(a.tamanho * (a.itens.len() as u64 - 1))));
    res
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::fs;

    #[test]
    fn acha_so_os_iguais_de_verdade() {
        let r = std::env::temp_dir().join(format!("zera-dup-{}", std::process::id()));
        let _ = fs::remove_dir_all(&r);
        fs::create_dir_all(&r).unwrap();
        let mut grande = vec![1u8; 100_000];
        fs::write(r.join("a.mov"), &grande).unwrap();
        fs::write(r.join("b.mov"), &grande).unwrap();
        // mesmo tamanho, mesmas pontas, meio diferente: não é duplicado
        grande[50_000] = 9;
        fs::write(r.join("c.mov"), &grande).unwrap();
        fs::write(r.join("d.mov"), vec![2u8; 100_000]).unwrap();
        // "a copia.mov" é mais antiga, mas tem cara de cópia: fica a outra
        fs::write(r.join("a copia.mov"), vec![3u8; 50_000]).unwrap();
        fs::write(r.join("original.mov"), vec![3u8; 50_000]).unwrap();
        let mut cands: Vec<Candidato> = ["a.mov", "b.mov", "c.mov", "d.mov"]
            .iter()
            .enumerate()
            .map(|(i, n)| Candidato { id: i as u32, caminho: r.join(n), tamanho: 100_000, mtime: 10 - i as i64 })
            .collect();
        cands.push(Candidato { id: 8, caminho: r.join("a copia.mov"), tamanho: 50_000, mtime: 1 });
        cands.push(Candidato { id: 9, caminho: r.join("original.mov"), tamanho: 50_000, mtime: 5 });
        let c = AtomicBool::new(false);
        let g = achar(cands, &c, &|_, _| {});
        assert_eq!(g.len(), 2);
        let nomes = |i: usize| g[i].itens.iter().map(|c| c.caminho.file_name().unwrap().to_string_lossy().into_owned()).collect::<Vec<_>>();
        // o grupo que mais desperdiça vem primeiro; b.mov é o mais antigo (mtime 9)
        assert_eq!(nomes(0), vec!["b.mov", "a.mov"]);
        assert_eq!(nomes(1), vec!["original.mov", "a copia.mov"]);
        assert!(parece_copia(std::path::Path::new("/x/Clipe (2).mov")));
        assert!(parece_copia(std::path::Path::new("/x/entrega_final cópia.mp4")));
        assert!(!parece_copia(std::path::Path::new("/x/Clipe (versão final).mov")));
        fs::remove_dir_all(&r).unwrap();
    }
}
