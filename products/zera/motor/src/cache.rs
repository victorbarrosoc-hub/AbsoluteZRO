//! A última varredura guardada no computador: ao abrir o ZERA de novo, o mapa aparece na hora e a varredura nova roda
//! por trás. Formato binário simples (pequeno e rápido de ler); só nós vivos, em pré-ordem, com o índice do pai.
//! Versão no cabeçalho: arquivo de outra versão é ignorado (varre de novo).

use crate::arvore::{Arvore, No, SEM_PAI};
use crate::tipos;
use std::fs::File;
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

const MAGICO: &[u8; 6] = b"ZERA\x00\x01";

fn w_u8(w: &mut impl Write, v: u8) -> io::Result<()> {
    w.write_all(&[v])
}
fn w_u32(w: &mut impl Write, v: u32) -> io::Result<()> {
    w.write_all(&v.to_le_bytes())
}
fn w_u64(w: &mut impl Write, v: u64) -> io::Result<()> {
    w.write_all(&v.to_le_bytes())
}
fn w_str(w: &mut impl Write, s: &str) -> io::Result<()> {
    w_u32(w, s.len() as u32)?;
    w.write_all(s.as_bytes())
}
fn r_u8(r: &mut impl Read) -> io::Result<u8> {
    let mut b = [0; 1];
    r.read_exact(&mut b)?;
    Ok(b[0])
}
fn r_u32(r: &mut impl Read) -> io::Result<u32> {
    let mut b = [0; 4];
    r.read_exact(&mut b)?;
    Ok(u32::from_le_bytes(b))
}
fn r_u64(r: &mut impl Read) -> io::Result<u64> {
    let mut b = [0; 8];
    r.read_exact(&mut b)?;
    Ok(u64::from_le_bytes(b))
}
fn r_str(r: &mut impl Read) -> io::Result<Box<str>> {
    let n = r_u32(r)? as usize;
    if n > 1 << 20 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "nome grande demais"));
    }
    let mut b = vec![0; n];
    r.read_exact(&mut b)?;
    Ok(String::from_utf8_lossy(&b).into())
}

pub fn salvar(a: &Arvore, arquivo: &Path) -> io::Result<()> {
    let tmp = arquivo.with_extension("tmp");
    {
        let mut w = BufWriter::with_capacity(1 << 20, File::create(&tmp)?);
        w.write_all(MAGICO)?;
        w_u64(&mut w, a.quando as u64)?;
        w_str(&mut w, &a.raiz.to_string_lossy())?;
        let vivos = a.nos.len() - a.mortos;
        w_u32(&mut w, vivos as u32)?;
        // pré-ordem com índices novos (compacta os mortos)
        let mut novo = vec![SEM_PAI; a.nos.len()];
        let mut pilha = vec![0u32];
        let mut prox = 0u32;
        while let Some(id) = pilha.pop() {
            let n = &a.nos[id as usize];
            if !n.vivo {
                continue;
            }
            novo[id as usize] = prox;
            prox += 1;
            let pai = if n.pai == SEM_PAI { SEM_PAI } else { novo[n.pai as usize] };
            w_u32(&mut w, pai)?;
            w_u8(&mut w, n.pasta as u8)?;
            w_u8(&mut w, n.tipo)?;
            w_u64(&mut w, n.bytes)?;
            w_u64(&mut w, n.tamanho)?;
            w_u64(&mut w, n.arquivos)?;
            w_u64(&mut w, n.mtime as u64)?;
            if let Some(pt) = &n.por_tipo {
                for x in pt.iter() {
                    w_u64(&mut w, *x)?;
                }
            }
            w_str(&mut w, &n.nome)?;
            pilha.extend(n.filhos.iter().rev());
        }
        if prox as usize != vivos {
            return Err(io::Error::other("contagem de nós não confere"));
        }
        w.flush()?;
    }
    std::fs::rename(tmp, arquivo)
}

pub fn carregar(arquivo: &Path) -> io::Result<Arvore> {
    let mut r = BufReader::with_capacity(1 << 20, File::open(arquivo)?);
    let mut m = [0u8; 6];
    r.read_exact(&mut m)?;
    if &m != MAGICO {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "outra versão"));
    }
    let quando = r_u64(&mut r)? as i64;
    let raiz = PathBuf::from(&*r_str(&mut r)?);
    let qtd = r_u32(&mut r)? as usize;
    let mut nos: Vec<No> = Vec::with_capacity(qtd);
    for i in 0..qtd {
        let pai = r_u32(&mut r)?;
        if (i == 0) != (pai == SEM_PAI) || (pai != SEM_PAI && pai as usize >= i) {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "pai inválido"));
        }
        let pasta = r_u8(&mut r)? == 1;
        let tipo = r_u8(&mut r)?.min(tipos::OUTROS);
        let bytes = r_u64(&mut r)?;
        let tamanho = r_u64(&mut r)?;
        let arquivos = r_u64(&mut r)?;
        let mtime = r_u64(&mut r)? as i64;
        let por_tipo = if pasta {
            let mut pt = [0u64; tipos::QTD];
            for x in pt.iter_mut() {
                *x = r_u64(&mut r)?;
            }
            Some(Box::new(pt))
        } else {
            None
        };
        let nome = r_str(&mut r)?;
        if pai != SEM_PAI {
            if !nos[pai as usize].pasta {
                return Err(io::Error::new(io::ErrorKind::InvalidData, "pai não é pasta"));
            }
            nos[pai as usize].filhos.push(i as u32);
        }
        nos.push(No { nome, pai, filhos: Vec::new(), bytes, tamanho, arquivos, mtime, pasta, vivo: true, tipo, por_tipo });
    }
    if nos.is_empty() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "vazio"));
    }
    Ok(Arvore { nos, raiz, quando, mortos: 0 })
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::varrer::{Arq, Pasta};

    #[test]
    fn ida_e_volta() {
        let filho = Pasta { nome: "Filmes".into(), bytes: 100, arquivos: 1, mtime: 5, por_tipo: [100, 0, 0, 0, 0, 0], arqs: vec![Arq { nome: "a.mov".into(), bytes: 100, tamanho: 99, mtime: 5, tipo: 0 }], subpastas: vec![] };
        let p = Pasta { nome: "/r".into(), bytes: 110, arquivos: 2, mtime: 1, por_tipo: [100, 0, 0, 0, 0, 10], arqs: vec![Arq { nome: "x.txt".into(), bytes: 10, tamanho: 10, mtime: 1, tipo: 5 }], subpastas: vec![filho] };
        let mut a = Arvore::de_varredura(PathBuf::from("/r"), p);
        // um morto não vai para o arquivo
        let (x, _) = a.achar(Path::new("/r/x.txt")).unwrap();
        a.remover(x);
        let arq = std::env::temp_dir().join(format!("zera-cache-{}.bin", std::process::id()));
        salvar(&a, &arq).unwrap();
        let b = carregar(&arq).unwrap();
        assert_eq!(b.nos.len(), 3);
        assert_eq!(b.nos[0].bytes, 100);
        assert_eq!(b.raiz, PathBuf::from("/r"));
        let (id, inteiro) = b.achar(Path::new("/r/Filmes/a.mov")).unwrap();
        assert!(inteiro);
        assert_eq!(b.nos[id as usize].tamanho, 99);
        std::fs::write(&arq, b"lixo").unwrap();
        assert!(carregar(&arq).is_err());
        std::fs::remove_file(&arq).unwrap();
    }
}
