//! A varredura: cada pasta vira uma tarefa no pool do rayon (roubo de trabalho), então todos os núcleos ficam ocupados
//! mesmo quando uma pasta tem milhões de arquivos e a vizinha tem três.
//!
//! O que conta e o que não conta:
//! - **Espaço ocupado de verdade** (blocos alocados), não o tamanho aparente: arquivo esparso, comprimido ou só na nuvem
//!   (iCloud, OneDrive) ocupa o que ocupa no disco.
//! - **Hard link conta uma vez.**
//! - **Atalhos (symlink, junção do Windows) não são seguidos**: nada de laço nem de contar outro disco.
//! - **Não atravessa para outro volume**, a não ser os de `Opcoes::devs` (no Mac, o volume de dados por trás do `/`).

use crate::tipos;
use rayon::prelude::*;
use std::collections::HashSet;
use std::fs::{self, Metadata};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

/// Um arquivo dentro de uma pasta varrida.
pub struct Arq {
    pub nome: Box<str>,
    pub bytes: u64,
    pub tamanho: u64,
    pub mtime: i64,
    pub tipo: u8,
}

/// Uma pasta varrida, com tudo o que tem dentro.
pub struct Pasta {
    pub nome: Box<str>,
    pub bytes: u64,
    pub arquivos: u64,
    pub mtime: i64,
    pub por_tipo: [u64; tipos::QTD],
    pub arqs: Vec<Arq>,
    pub subpastas: Vec<Pasta>,
}

#[derive(Default, Clone)]
pub struct Opcoes {
    /// Volumes aceitos (vazio: só o da raiz). No Windows não se usa: as junções já não são seguidas.
    pub devs: Vec<u64>,
    /// Caminhos que não entram (no Mac, `/System/Volumes/Data`, que já aparece pelo `/`).
    pub excluir: Vec<PathBuf>,
}

pub struct Contexto<'a> {
    pub op: &'a Opcoes,
    pub vistos: Mutex<HashSet<(u64, u64)>>,
    pub arquivos: AtomicU64,
    pub bytes: AtomicU64,
    pub pastas: AtomicU64,
    pub erros: AtomicU64,
    pub sem_acesso: Mutex<Vec<PathBuf>>,
    pub atual: Mutex<PathBuf>,
    pub cancelar: &'a AtomicBool,
    /// Chamado quando termina uma pasta até o 3º nível abaixo da raiz: (pasta, nível, caminho dela). A tela pinta
    /// o anel da varredura com isso, antes do fim.
    pub ao_terminar: Option<&'a (dyn Fn(&Pasta, u8, &Path) + Sync)>,
}

impl<'a> Contexto<'a> {
    pub fn novo(op: &'a Opcoes, cancelar: &'a AtomicBool) -> Self {
        Contexto {
            op,
            vistos: Mutex::new(HashSet::new()),
            arquivos: AtomicU64::new(0),
            bytes: AtomicU64::new(0),
            pastas: AtomicU64::new(0),
            erros: AtomicU64::new(0),
            sem_acesso: Mutex::new(Vec::new()),
            atual: Mutex::new(PathBuf::new()),
            cancelar,
            ao_terminar: None,
        }
    }
}

pub fn mtime(m: &Metadata) -> i64 {
    m.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(unix)]
mod plataforma {
    use std::fs::Metadata;
    use std::os::unix::fs::MetadataExt;
    pub fn ocupado(m: &Metadata) -> u64 {
        m.blocks() * 512
    }
    pub fn dispositivo(m: &Metadata) -> u64 {
        m.dev()
    }
    pub fn link(m: &Metadata) -> Option<(u64, u64)> {
        (m.nlink() > 1).then(|| (m.dev(), m.ino()))
    }
    pub const FILTRA_VOLUME: bool = true;
}

#[cfg(windows)]
mod plataforma {
    use std::fs::Metadata;
    use std::os::windows::fs::MetadataExt;
    // Arquivo só na nuvem (OneDrive "Arquivos sob demanda"): não ocupa o disco.
    const NA_NUVEM: u32 = 0x0040_0000 | 0x0004_0000 | 0x0000_1000;
    pub fn ocupado(m: &Metadata) -> u64 {
        if m.file_attributes() & NA_NUVEM != 0 {
            return 0;
        }
        // tamanho arredondado ao cluster padrão do NTFS (4 KB)
        m.len().div_ceil(4096) * 4096
    }
    pub fn dispositivo(_: &Metadata) -> u64 {
        0
    }
    pub fn link(_: &Metadata) -> Option<(u64, u64)> {
        None
    }
    pub const FILTRA_VOLUME: bool = false;
}

pub use plataforma::dispositivo;

fn anotar_sem_acesso(ctx: &Contexto, caminho: &Path) {
    ctx.erros.fetch_add(1, Ordering::Relaxed);
    if let Ok(mut v) = ctx.sem_acesso.lock() {
        if v.len() < 50 {
            v.push(caminho.to_path_buf());
        }
    }
}

/// Varre `caminho` (uma pasta) e tudo dentro. `herdado` é o tipo do pacote em que ela está, se estiver em um.
pub fn varrer_pasta(caminho: &Path, nome: Box<str>, proprio: u64, mt: i64, herdado: Option<u8>, ctx: &Contexto, nivel: u8) -> Pasta {
    let herdado = herdado.or_else(|| tipos::de_pacote(&nome));
    let mut p = Pasta { nome, bytes: proprio, arquivos: 0, mtime: mt, por_tipo: [0; tipos::QTD], arqs: Vec::new(), subpastas: Vec::new() };
    p.por_tipo[herdado.unwrap_or(tipos::OUTROS) as usize] += proprio;
    if ctx.cancelar.load(Ordering::Relaxed) {
        return p;
    }
    let n = ctx.pastas.fetch_add(1, Ordering::Relaxed);
    if n % 64 == 0 {
        if let Ok(mut a) = ctx.atual.try_lock() {
            *a = caminho.to_path_buf();
        }
    }
    let mut subs: Vec<(PathBuf, Box<str>, u64, i64)> = Vec::new();
    match fs::read_dir(caminho) {
        Ok(rd) => {
            for e in rd {
                let Ok(e) = e else {
                    ctx.erros.fetch_add(1, Ordering::Relaxed);
                    continue;
                };
                // DirEntry::metadata é o lstat relativo à pasta aberta: não segue atalho e não refaz o caminho inteiro
                let Ok(m) = e.metadata() else {
                    ctx.erros.fetch_add(1, Ordering::Relaxed);
                    continue;
                };
                let ft = m.file_type();
                if ft.is_symlink() {
                    continue;
                }
                let nome: Box<str> = e.file_name().to_string_lossy().into();
                if ft.is_dir() {
                    if plataforma::FILTRA_VOLUME && !ctx.op.devs.contains(&plataforma::dispositivo(&m)) {
                        continue;
                    }
                    let c = e.path();
                    if ctx.op.excluir.iter().any(|x| x == &c) {
                        continue;
                    }
                    subs.push((c, nome, plataforma::ocupado(&m), mtime(&m)));
                    continue;
                }
                if !ft.is_file() {
                    continue; // socket, fifo, dispositivo
                }
                if let Some(chave) = plataforma::link(&m) {
                    if !ctx.vistos.lock().map(|mut v| v.insert(chave)).unwrap_or(true) {
                        continue;
                    }
                }
                let bytes = plataforma::ocupado(&m);
                let tipo = herdado.unwrap_or_else(|| tipos::de_arquivo(&nome));
                p.bytes += bytes;
                p.arquivos += 1;
                p.por_tipo[tipo as usize] += bytes;
                p.arqs.push(Arq { nome, bytes, tamanho: m.len(), mtime: mtime(&m), tipo });
            }
        }
        Err(_) => anotar_sem_acesso(ctx, caminho),
    }
    ctx.arquivos.fetch_add(p.arquivos, Ordering::Relaxed);
    ctx.bytes.fetch_add(p.bytes, Ordering::Relaxed);
    let subpastas: Vec<Pasta> = subs
        .into_par_iter()
        .map(|(c, nome, proprio, mt)| {
            let s = varrer_pasta(&c, nome, proprio, mt, herdado, ctx, nivel.saturating_add(1));
            if nivel < 3 {
                if let Some(f) = ctx.ao_terminar {
                    f(&s, nivel + 1, &c);
                }
            }
            s
        })
        .collect();
    for s in &subpastas {
        p.bytes += s.bytes;
        p.arquivos += s.arquivos;
        for i in 0..tipos::QTD {
            p.por_tipo[i] += s.por_tipo[i];
        }
    }
    p.subpastas = subpastas;
    p
}

/// Varre a raiz. Devolve `None` se ela não existe ou não é pasta.
pub fn varrer(raiz: &Path, ctx: &Contexto, herdado: Option<u8>) -> Option<Pasta> {
    let m = fs::metadata(raiz).ok()?;
    if !m.is_dir() {
        return None;
    }
    let nome: Box<str> = raiz.to_string_lossy().into();
    Some(varrer_pasta(raiz, nome, plataforma::ocupado(&m), mtime(&m), herdado, ctx, 0))
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::io::Write;

    pub fn pasta_temporaria(nome: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("zera-teste-{}-{}", nome, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn escrever(p: &Path, bytes: usize) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        let mut f = fs::File::create(p).unwrap();
        f.write_all(&vec![7u8; bytes]).unwrap();
    }

    #[test]
    fn soma_tipos_e_hard_link() {
        let r = pasta_temporaria("soma");
        escrever(&r.join("a/clip.mov"), 100_000);
        escrever(&r.join("a/b/som.wav"), 50_000);
        escrever(&r.join("c/notas.txt"), 10);
        #[cfg(unix)]
        {
            fs::hard_link(r.join("a/clip.mov"), r.join("c/clip-link.mov")).unwrap();
            std::os::unix::fs::symlink(r.join("a"), r.join("atalho")).unwrap();
        }
        let m = fs::metadata(&r).unwrap();
        let op = Opcoes { devs: vec![dispositivo(&m)], excluir: vec![] };
        let c = AtomicBool::new(false);
        let ctx = Contexto::novo(&op, &c);
        let p = varrer(&r, &ctx, None).unwrap();
        // 3 arquivos: o hard link e o atalho não contam de novo
        assert_eq!(p.arquivos, 3);
        assert!(p.por_tipo[tipos::VIDEO as usize] >= 100_000);
        assert!(p.por_tipo[tipos::AUDIO as usize] >= 50_000);
        let soma: u64 = p.por_tipo.iter().sum();
        assert_eq!(soma, p.bytes);
        fs::remove_dir_all(&r).unwrap();
    }

    #[test]
    fn pacote_herda_tipo_e_excluir_funciona() {
        let r = pasta_temporaria("pacote");
        escrever(&r.join("Cliente.fcpbundle/Render Files/x.dat"), 20_000);
        escrever(&r.join("fora/y.dat"), 20_000);
        let m = fs::metadata(&r).unwrap();
        let op = Opcoes { devs: vec![dispositivo(&m)], excluir: vec![r.join("fora")] };
        let c = AtomicBool::new(false);
        let ctx = Contexto::novo(&op, &c);
        let p = varrer(&r, &ctx, None).unwrap();
        assert_eq!(p.arquivos, 1);
        assert!(p.por_tipo[tipos::PROJETO as usize] >= 20_000);
        fs::remove_dir_all(&r).unwrap();
    }

    #[test]
    fn cancelar_para_cedo() {
        let r = pasta_temporaria("cancelar");
        escrever(&r.join("a/b/c.txt"), 10);
        let m = fs::metadata(&r).unwrap();
        let op = Opcoes { devs: vec![dispositivo(&m)], excluir: vec![] };
        let c = AtomicBool::new(true);
        let ctx = Contexto::novo(&op, &c);
        let p = varrer(&r, &ctx, None).unwrap();
        assert_eq!(p.arquivos, 0);
        fs::remove_dir_all(&r).unwrap();
    }
}
