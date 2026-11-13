//! zera-motor: o motor do ZERA.
//!
//! - `zera-motor` (ou `zera-motor servir`): conversa com o app por linhas JSON (pedido na entrada, resposta e eventos na
//!   saída). Cada pedido tem `id`; a resposta volta com o mesmo `id`. Eventos (`t`) não têm `id`.
//! - `zera-motor varrer <pasta> [núcleos]`: varre e imprime o resumo (para medir).
//!
//! O motor só lê o disco. Ele nunca apaga, move nem renomeia nada: quem manda para o Lixo é o app, depois da
//! confirmação da pessoa, e só então avisa o motor (`remover`) para tirar da árvore.

mod arvore;
mod cache;
mod duplicados;
mod sugestoes;
mod tipos;
mod varrer;

use arvore::Arvore;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

fn emitir(v: &Value) {
    let s = v.to_string();
    let mut o = io::stdout().lock();
    let _ = writeln!(o, "{s}");
    let _ = o.flush();
}

struct Estado {
    arvore: Mutex<Option<Arvore>>,
    ocupado: AtomicBool,
    cancelar: AtomicBool,
}

fn erro(id: &Value, msg: &str) -> Value {
    json!({"id": id, "ok": false, "erro": msg})
}

fn caminhos(v: &Value) -> Vec<PathBuf> {
    v.as_array().map(|a| a.iter().filter_map(|x| x.as_str()).map(PathBuf::from).collect()).unwrap_or_default()
}

/// Opções de volume: a raiz e os caminhos extras (`devs_de`) definem os volumes aceitos.
fn opcoes(raiz: &Path, devs_de: &[PathBuf], excluir: Vec<PathBuf>) -> Option<varrer::Opcoes> {
    let m = std::fs::metadata(raiz).ok()?;
    let mut devs = vec![varrer::dispositivo(&m)];
    for p in devs_de {
        if let Ok(m) = std::fs::metadata(p) {
            devs.push(varrer::dispositivo(&m));
        }
    }
    Some(varrer::Opcoes { devs, excluir })
}

fn cmd_varrer(e: &Estado, id: &Value, p: &Value) -> Value {
    let Some(raiz) = p["raiz"].as_str().map(PathBuf::from) else { return erro(id, "raiz") };
    let Some(op) = opcoes(&raiz, &caminhos(&p["volumes"]), caminhos(&p["excluir"])) else { return erro(id, "raiz_inexistente") };
    let ctx = varrer::Contexto::novo(&op, &e.cancelar);
    let raiz_txt = raiz.clone();
    // `rel`: o caminho abaixo da raiz, com "/" (a tela desconta das pastas de cima o que as de dentro já mostraram)
    let parcial = move |s: &varrer::Pasta, nivel: u8, c: &Path| {
        let rel: Vec<String> = c.strip_prefix(&raiz_txt).map(|r| r.components().map(|x| x.as_os_str().to_string_lossy().into_owned()).collect()).unwrap_or_default();
        emitir(&json!({"t": "parcial", "n": &*s.nome, "b": s.bytes, "pt": s.por_tipo, "nivel": nivel, "rel": rel.join("/")}));
    };
    let ctx = varrer::Contexto { ao_terminar: Some(&parcial), ..ctx };
    let inicio = Instant::now();
    let feito = AtomicBool::new(false);
    let resultado = std::thread::scope(|s| {
        s.spawn(|| {
            while !feito.load(Ordering::Relaxed) {
                let atual = ctx.atual.lock().map(|a| a.to_string_lossy().into_owned()).unwrap_or_default();
                emitir(&json!({
                    "t": "progresso",
                    "arquivos": ctx.arquivos.load(Ordering::Relaxed),
                    "pastas": ctx.pastas.load(Ordering::Relaxed),
                    "b": ctx.bytes.load(Ordering::Relaxed),
                    "atual": atual,
                }));
                std::thread::sleep(Duration::from_millis(90));
            }
        });
        let r = varrer::varrer(&raiz, &ctx, None);
        feito.store(true, Ordering::Relaxed);
        r
    });
    let Some(pasta) = resultado else { return erro(id, "raiz_inexistente") };
    if e.cancelar.load(Ordering::Relaxed) {
        return erro(id, "cancelado");
    }
    let ms = inicio.elapsed().as_millis() as u64;
    let a = Arvore::de_varredura(raiz, pasta);
    let sem_acesso: Vec<String> = ctx.sem_acesso.lock().map(|v| v.iter().map(|p| p.to_string_lossy().into_owned()).collect()).unwrap_or_default();
    let resp = json!({
        "id": id, "ok": true, "ms": ms, "erros": ctx.erros.load(Ordering::Relaxed), "sem_acesso": sem_acesso,
        "raiz": a.info(0),
    });
    if let Some(arq) = p["cache"].as_str() {
        let _ = cache::salvar(&a, Path::new(arq));
    }
    *e.arvore.lock().unwrap() = Some(a);
    resp
}

/// Pastas que mudaram (o vigia do app avisou): varre só elas e troca na árvore.
fn cmd_revarrer(e: &Estado, id: &Value, p: &Value) -> Value {
    let pedidos = caminhos(&p["pastas"]);
    // 1. resolver cada caminho para o nó mais fundo que existe na árvore, sem segurar a árvore enquanto varre
    let alvos: Vec<(PathBuf, Option<u8>)> = {
        let g = e.arvore.lock().unwrap();
        let Some(a) = g.as_ref() else { return erro(id, "sem_arvore") };
        let mut v: Vec<(PathBuf, Option<u8>)> = Vec::new();
        for c in pedidos {
            let Some((no, _)) = a.achar(&c) else { continue };
            let no = if a.nos[no as usize].pasta { no } else { a.nos[no as usize].pai };
            v.push((a.caminho(no), a.herdado(no)));
        }
        v.sort();
        v.dedup_by(|x, y| x.0.starts_with(&y.0));
        v
    };
    let (raiz, devs) = {
        let g = e.arvore.lock().unwrap();
        let a = g.as_ref().unwrap();
        (a.raiz.clone(), caminhos(&p["volumes"]))
    };
    let Some(op) = opcoes(&raiz, &devs, caminhos(&p["excluir"])) else { return erro(id, "raiz_inexistente") };
    let ctx = varrer::Contexto::novo(&op, &e.cancelar);
    // 2. varrer cada trecho (em paralelo, pelo rayon de dentro)
    let novos: Vec<(PathBuf, Option<varrer::Pasta>)> = alvos
        .into_iter()
        .map(|(c, herdado)| {
            let r = varrer::varrer(&c, &ctx, herdado).map(|mut s| {
                if let Some(n) = c.file_name() {
                    s.nome = n.to_string_lossy().into();
                }
                s
            });
            (c, r)
        })
        .collect();
    // 3. trocar na árvore
    let mut g = e.arvore.lock().unwrap();
    let Some(a) = g.as_mut() else { return erro(id, "sem_arvore") };
    let mut mudou = Vec::new();
    for (c, r) in novos {
        let Some((no, inteiro)) = a.achar(&c) else { continue };
        if !inteiro {
            continue;
        }
        match r {
            Some(s) if no == 0 => {
                let nome = a.nos[0].nome.clone();
                a.substituir(0, varrer::Pasta { nome, ..s });
                mudou.push(0);
            }
            Some(s) => {
                a.substituir(no, s);
                mudou.push(no);
            }
            None => {
                let pai = a.nos[no as usize].pai;
                if a.remover(no) {
                    mudou.push(pai);
                }
            }
        }
    }
    json!({"id": id, "ok": true, "mudou": mudou, "raiz": a.info(0)})
}

fn cmd_duplicados(e: &Estado, id: &Value, p: &Value) -> Value {
    let min = p["min"].as_u64().unwrap_or(1_000_000);
    let cands: Vec<duplicados::Candidato> = {
        let g = e.arvore.lock().unwrap();
        let Some(a) = g.as_ref() else { return erro(id, "sem_arvore") };
        a.nos
            .iter()
            .enumerate()
            .filter(|(_, n)| n.vivo && !n.pasta && n.tamanho >= min && n.bytes > 0)
            .map(|(i, n)| duplicados::Candidato { id: i as u32, caminho: a.caminho(i as u32), tamanho: n.tamanho, mtime: n.mtime })
            .collect()
    };
    let progresso = |lidos: u64, total: u64| emitir(&json!({"t": "duplicados", "lidos": lidos, "total": total}));
    let grupos = duplicados::achar(cands, &e.cancelar, &progresso);
    if e.cancelar.load(Ordering::Relaxed) {
        return erro(id, "cancelado");
    }
    let g = e.arvore.lock().unwrap();
    let Some(a) = g.as_ref() else { return erro(id, "sem_arvore") };
    let desperdicio: u64 = grupos.iter().map(|g| g.tamanho * (g.itens.len() as u64 - 1)).sum();
    let lista: Vec<Value> = grupos
        .iter()
        .filter(|g| g.itens.iter().all(|c| a.no(c.id).is_some()))
        .take(500)
        .map(|g| {
            json!({
                "tamanho": g.tamanho,
                "itens": g.itens.iter().map(|c| { let mut v = a.info(c.id); v["c"] = json!(a.caminho_curto(c.id)); v }).collect::<Vec<_>>(),
            })
        })
        .collect();
    json!({"id": id, "ok": true, "grupos": lista, "desperdicio": desperdicio, "qtd": grupos.len()})
}

fn com_arvore(e: &Estado, id: &Value, f: impl FnOnce(&mut Arvore) -> Value) -> Value {
    let mut g = e.arvore.lock().unwrap();
    match g.as_mut() {
        Some(a) => f(a),
        None => erro(id, "sem_arvore"),
    }
}

fn no_param(p: &Value) -> u32 {
    p["no"].as_u64().unwrap_or(0) as u32
}

fn rapido(e: &Estado, id: &Value, cmd: &str, p: &Value) -> Value {
    match cmd {
        "abrir" => com_arvore(e, id, |a| match a.abrir(no_param(p), p["max"].as_u64().unwrap_or(400) as usize) {
            Some(v) => json!({"id": id, "ok": true, "pasta": v}),
            None => erro(id, "nao_existe"),
        }),
        "anel" => com_arvore(e, id, |a| {
            let niveis = p["niveis"].as_u64().unwrap_or(3).min(6) as u32;
            match a.anel(no_param(p), niveis, p["min"].as_f64().unwrap_or(0.004)) {
                Some(v) => json!({"id": id, "ok": true, "anel": v}),
                None => erro(id, "nao_existe"),
            }
        }),
        "sugestoes" => com_arvore(e, id, |a| {
            let g = sugestoes::calcular(a, arvore::agora());
            json!({"id": id, "ok": true, "grupos": sugestoes::para_json(a, &g)})
        }),
        // caminhos absolutos dos nós (o app confere antes de mandar para o Lixo ou mostrar no Finder)
        "caminhos" => com_arvore(e, id, |a| {
            let nos: Vec<u32> = p["nos"].as_array().map(|v| v.iter().filter_map(|x| x.as_u64()).map(|x| x as u32).collect()).unwrap_or_default();
            let lista: Vec<Value> = nos
                .iter()
                .filter_map(|n| a.no(*n).map(|no| json!({"id": n, "c": a.caminho(*n).to_string_lossy(), "b": no.bytes, "p": no.pasta})))
                .collect();
            json!({"id": id, "ok": true, "caminhos": lista, "raiz": a.raiz.to_string_lossy()})
        }),
        "remover" => com_arvore(e, id, |a| {
            let nos: Vec<u32> = p["nos"].as_array().map(|v| v.iter().filter_map(|x| x.as_u64()).map(|x| x as u32).collect()).unwrap_or_default();
            let tirados: Vec<u32> = nos.into_iter().filter(|n| a.remover(*n)).collect();
            json!({"id": id, "ok": true, "tirados": tirados, "raiz": a.info(0)})
        }),
        "achar" => com_arvore(e, id, |a| {
            let Some(c) = p["caminho"].as_str() else { return erro(id, "caminho") };
            match a.achar(Path::new(c)) {
                Some((no, true)) => json!({"id": id, "ok": true, "no": no}),
                _ => erro(id, "nao_existe"),
            }
        }),
        "salvar" => com_arvore(e, id, |a| {
            let Some(arq) = p["arquivo"].as_str() else { return erro(id, "arquivo") };
            match cache::salvar(a, Path::new(arq)) {
                Ok(()) => json!({"id": id, "ok": true}),
                Err(_) => erro(id, "nao_salvou"),
            }
        }),
        "carregar" => {
            let Some(arq) = p["arquivo"].as_str() else { return erro(id, "arquivo") };
            match cache::carregar(Path::new(arq)) {
                Ok(a) => {
                    let r = json!({"id": id, "ok": true, "raiz": a.info(0), "caminho": a.raiz.to_string_lossy(), "quando": a.quando});
                    *e.arvore.lock().unwrap() = Some(a);
                    r
                }
                Err(_) => erro(id, "sem_cache"),
            }
        }
        "versao" => json!({"id": id, "ok": true, "versao": env!("CARGO_PKG_VERSION"), "nucleos": rayon::current_num_threads()}),
        _ => erro(id, "comando_desconhecido"),
    }
}

fn servir() {
    let e = Arc::new(Estado { arvore: Mutex::new(None), ocupado: AtomicBool::new(false), cancelar: AtomicBool::new(false) });
    let entrada = io::stdin();
    for linha in entrada.lock().lines() {
        let Ok(linha) = linha else { break };
        if linha.trim().is_empty() {
            continue;
        }
        let Ok(p) = serde_json::from_str::<Value>(&linha) else {
            emitir(&json!({"ok": false, "erro": "json"}));
            continue;
        };
        let id = p["id"].clone();
        let cmd = p["cmd"].as_str().unwrap_or("").to_string();
        match cmd.as_str() {
            "cancelar" => {
                e.cancelar.store(true, Ordering::Relaxed);
                emitir(&json!({"id": id, "ok": true}));
            }
            "varrer" | "revarrer" | "duplicados" => {
                if e.ocupado.swap(true, Ordering::SeqCst) {
                    emitir(&erro(&id, "ocupado"));
                    continue;
                }
                e.cancelar.store(false, Ordering::Relaxed);
                let e = Arc::clone(&e);
                std::thread::spawn(move || {
                    let r = match cmd.as_str() {
                        "varrer" => cmd_varrer(&e, &id, &p),
                        "revarrer" => cmd_revarrer(&e, &id, &p),
                        _ => cmd_duplicados(&e, &id, &p),
                    };
                    e.ocupado.store(false, Ordering::SeqCst);
                    emitir(&r);
                });
            }
            _ => emitir(&rapido(&e, &id, &cmd, &p)),
        }
    }
}

fn medir(raiz: &str, nucleos: usize) {
    if nucleos > 0 {
        let _ = rayon::ThreadPoolBuilder::new().num_threads(nucleos).build_global();
    }
    let raiz = PathBuf::from(raiz);
    let Some(op) = opcoes(&raiz, &[], vec![]) else {
        eprintln!("pasta não encontrada");
        std::process::exit(2);
    };
    let c = AtomicBool::new(false);
    let ctx = varrer::Contexto::novo(&op, &c);
    let t = Instant::now();
    let p = varrer::varrer(&raiz, &ctx, None).expect("raiz");
    let ms = t.elapsed().as_millis();
    let a = Arvore::de_varredura(raiz, p);
    println!("{} bytes  {} arquivos  {} ms  {} núcleos", a.nos[0].bytes, a.nos[0].arquivos, ms, rayon::current_num_threads());
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        None | Some("servir") => servir(),
        Some("varrer") => medir(args.get(2).map(|s| s.as_str()).unwrap_or("."), args.get(3).and_then(|s| s.parse().ok()).unwrap_or(0)),
        Some("--versao") => println!("{}", env!("CARGO_PKG_VERSION")),
        _ => {
            eprintln!("uso: zera-motor [servir | varrer <pasta> [núcleos] | --versao]");
            std::process::exit(2);
        }
    }
}
