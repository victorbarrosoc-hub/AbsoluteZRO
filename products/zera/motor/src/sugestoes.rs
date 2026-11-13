//! O que dá para tirar, em grupos. Uma passada só pela árvore: o primeiro grupo que reconhece uma pasta fica com ela
//! inteira (os de dentro não entram em outro grupo), então os totais não contam o mesmo byte duas vezes.
//!
//! Segurança de cada grupo (a interface mostra e decide o texto):
//! - `volta`: o programa que criou refaz sozinho (cache de edição, cache de app, dependências de código).
//! - `confira`: pode ser trabalho de alguém; a pessoa olha antes (proxies, instaladores, downloads antigos, backups).
//! - `lixo`: já está no Lixo; o ZERA só mostra (esvaziar é com o sistema).

use crate::arvore::Arvore;
use serde_json::{json, Value};

const DIA: i64 = 86_400;
const MB: u64 = 1_000_000;
const GB: u64 = 1_000_000_000;
const MAX_ITENS: usize = 300;

pub struct Grupo {
    pub id: &'static str,
    pub seguranca: &'static str,
    pub itens: Vec<u32>,
}

/// Pastas que os programas de edição recriam sozinhos.
const CACHE_EDICAO: &[&str] = &[
    "Media Cache Files",
    "Media Cache",
    "Peak Files",
    "CacheClip",
    "Render Files",
    "Analysis Files",
    "Previews.lrdata",
    "Thumbnail Media",
];
/// Proxies e mídia otimizada: refazem, mas leva tempo e pede o original.
const PROXIES: &[&str] = &["Proxy", "Proxies", "Proxy Media", "ProxyMedia", "Transcoded Media", "OptimizedMedia", "Optimized Media"];
const DEV: &[&str] = &["node_modules", "DerivedData", "_cacache"];
const LIXEIRAS: &[&str] = &[".Trash", ".Trashes", "$Recycle.Bin", "$RECYCLE.BIN"];
const INSTALADORES: &[&str] = &["dmg", "pkg", "iso", "msi", "ipsw", "exe", "appimage", "deb", "rpm"];

fn termina_com(trilha: &[&str], fim: &[&str]) -> bool {
    trilha.len() >= fim.len() && trilha[trilha.len() - fim.len()..].iter().zip(fim).all(|(a, b)| a.eq_ignore_ascii_case(b))
}

/// Pasta cujos filhos (cada um) são o que se tira: caches de apps, backups de celular.
fn grupo_dos_filhos(trilha: &[&str]) -> Option<usize> {
    if termina_com(trilha, &["Library", "Caches"]) || termina_com(trilha, &["AppData", "Local", "Temp"]) || termina_com(trilha, &["Local", "Microsoft", "Windows", "INetCache"]) {
        return Some(G_CACHES);
    }
    // ~/.cache no Linux (só na pasta da pessoa: /home/<nome>/.cache)
    if trilha.len() >= 3 && trilha[trilha.len() - 1] == ".cache" && trilha[trilha.len() - 3] == "home" {
        return Some(G_CACHES);
    }
    if termina_com(trilha, &["MobileSync", "Backup"]) {
        return Some(G_BACKUPS);
    }
    None
}

const G_EDICAO: usize = 0;
const G_PROXIES: usize = 1;
const G_CACHES: usize = 2;
const G_DEV: usize = 3;
const G_BACKUPS: usize = 4;
const G_INSTALADORES: usize = 5;
const G_DOWNLOADS: usize = 6;
const G_ESQUECIDOS: usize = 7;
const G_LIXEIRA: usize = 8;

fn grupos_vazios() -> Vec<Grupo> {
    [
        ("cache-edicao", "volta"),
        ("proxies", "confira"),
        ("caches", "volta"),
        ("dev", "volta"),
        ("backups", "confira"),
        ("instaladores", "confira"),
        ("downloads", "confira"),
        ("esquecidos", "confira"),
        ("lixeira", "lixo"),
    ]
    .into_iter()
    .map(|(id, seguranca)| Grupo { id, seguranca, itens: Vec::new() })
    .collect()
}

fn extensao(nome: &str) -> Option<String> {
    nome.rfind('.').filter(|i| *i > 0).map(|i| nome[i + 1..].to_ascii_lowercase())
}

pub fn calcular(a: &Arvore, agora: i64) -> Vec<Grupo> {
    let mut g = grupos_vazios();
    if a.nos.is_empty() {
        return g;
    }
    // A trilha começa com as partes do caminho da raiz, para as regras que olham "Library/Caches" etc.
    let base: Vec<String> = a.raiz.components().filter_map(|c| match c {
        std::path::Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
        _ => None,
    }).collect();
    let mut trilha: Vec<&str> = base.iter().map(|s| s.as_str()).collect();
    // pilha: (id, profundidade da trilha ao entrar, grupo dos filhos herdado do pai, dentro de pacote .app)
    visitar(a, 0, &mut trilha, None, false, agora, &mut g);
    for grupo in &mut g {
        grupo.itens.sort_unstable_by(|x, y| a.nos[*y as usize].bytes.cmp(&a.nos[*x as usize].bytes));
    }
    g
}

fn visitar<'a>(a: &'a Arvore, id: u32, trilha: &mut Vec<&'a str>, dos_filhos: Option<usize>, em_app: bool, agora: i64, g: &mut Vec<Grupo>) {
    let n = &a.nos[id as usize];
    if !n.vivo {
        return;
    }
    if id != 0 {
        trilha.push(&n.nome);
    }
    let nome: &str = &n.nome;
    let fim = |trilha: &mut Vec<&str>| {
        if id != 0 {
            trilha.pop();
        }
    };

    // 1. filho de uma pasta "cada filho é um item" (Caches, backups)
    if let Some(gi) = dos_filhos {
        if n.bytes >= MB {
            g[gi].itens.push(id);
        }
        fim(trilha);
        return;
    }

    if n.pasta {
        let grupo = if CACHE_EDICAO.iter().any(|x| nome.eq_ignore_ascii_case(x)) || (nome.eq_ignore_ascii_case("Disk Cache") && trilha.iter().any(|t| t.contains("After Effects") || t.contains("Adobe"))) {
            Some(G_EDICAO)
        } else if PROXIES.iter().any(|x| nome.eq_ignore_ascii_case(x)) {
            Some(G_PROXIES)
        } else if DEV.iter().any(|x| nome == *x) {
            Some(G_DEV)
        } else if LIXEIRAS.iter().any(|x| nome == *x) {
            Some(G_LIXEIRA)
        } else {
            None
        };
        if let Some(gi) = grupo {
            if n.bytes > 0 {
                g[gi].itens.push(id);
            }
            fim(trilha);
            return;
        }
        // 2. filho de Downloads parado há 90 dias
        let em_downloads = trilha.len() >= 2 && trilha[trilha.len() - 2].eq_ignore_ascii_case("Downloads");
        if em_downloads && id != 0 && n.mtime > 0 && agora - n.mtime > 90 * DIA && n.bytes >= MB {
            g[G_DOWNLOADS].itens.push(id);
            fim(trilha);
            return;
        }
        let filhos_grupo = grupo_dos_filhos(trilha);
        let em_app = em_app || nome.ends_with(".app");
        for f in &n.filhos {
            visitar(a, *f, trilha, filhos_grupo, em_app, agora, g);
        }
        fim(trilha);
        return;
    }

    // arquivos
    let velho = |dias: i64| n.mtime > 0 && agora - n.mtime > dias * DIA;
    let em_downloads = trilha.len() >= 2 && trilha[trilha.len() - 2].eq_ignore_ascii_case("Downloads");
    let ext = extensao(nome);
    if !em_app && n.bytes >= 50 * MB && ext.as_deref().is_some_and(|e| INSTALADORES.contains(&e)) {
        g[G_INSTALADORES].itens.push(id);
    } else if em_downloads && velho(90) && n.bytes >= MB {
        g[G_DOWNLOADS].itens.push(id);
    } else if !em_app && n.bytes >= GB && velho(180) {
        g[G_ESQUECIDOS].itens.push(id);
    }
    fim(trilha);
}

pub fn para_json(a: &Arvore, grupos: &[Grupo]) -> Value {
    Value::Array(
        grupos
            .iter()
            .map(|g| {
                let total: u64 = g.itens.iter().map(|i| a.nos[*i as usize].bytes).sum();
                json!({
                    "id": g.id,
                    "seguranca": g.seguranca,
                    "b": total,
                    "qtd": g.itens.len(),
                    "itens": g.itens.iter().take(MAX_ITENS).map(|i| {
                        let mut v = a.info(*i);
                        v["c"] = json!(a.caminho_curto(*i));
                        v
                    }).collect::<Vec<_>>(),
                })
            })
            .collect(),
    )
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::tipos;
    use crate::varrer::{Arq, Pasta};
    use std::path::PathBuf;

    fn arq(nome: &str, bytes: u64, mtime: i64) -> Arq {
        Arq { nome: nome.into(), bytes, tamanho: bytes, mtime, tipo: tipos::de_arquivo(nome) }
    }
    fn pasta(nome: &str, mtime: i64, arqs: Vec<Arq>, subpastas: Vec<Pasta>) -> Pasta {
        let mut p = Pasta { nome: nome.into(), bytes: 0, arquivos: 0, mtime, por_tipo: [0; tipos::QTD], arqs: Vec::new(), subpastas: Vec::new() };
        for a in &arqs {
            p.bytes += a.bytes;
            p.arquivos += 1;
            p.por_tipo[a.tipo as usize] += a.bytes;
        }
        for s in &subpastas {
            p.bytes += s.bytes;
            p.arquivos += s.arquivos;
        }
        p.arqs = arqs;
        p.subpastas = subpastas;
        p
    }

    #[test]
    fn reconhece_os_grupos_sem_contar_duas_vezes() {
        let agora = 1_800_000_000;
        let velho = agora - 400 * DIA;
        let p = pasta("/Users/ana", agora, vec![], vec![
            pasta("Library", agora, vec![], vec![
                pasta("Caches", agora, vec![], vec![
                    pasta("com.app.um", agora, vec![arq("x", 5 * MB, agora)], vec![]),
                    pasta("pequeno", agora, vec![arq("y", 10, agora)], vec![]),
                ]),
                pasta("Application Support", agora, vec![], vec![pasta("Adobe", agora, vec![], vec![pasta("Common", agora, vec![], vec![
                    pasta("Media Cache Files", agora, vec![arq("a.cfa", 80 * MB, agora)], vec![]),
                ])])]),
            ]),
            pasta("Downloads", agora, vec![arq("Instalador.dmg", 600 * MB, agora), arq("velho.zip", 3 * MB, velho)], vec![
                pasta("projeto-antigo", velho, vec![], vec![pasta("node_modules", velho, vec![arq("m.js", 2 * MB, velho)], vec![])]),
            ]),
            pasta("Filmes", agora, vec![arq("bruto.mov", 2 * GB, velho)], vec![pasta("Proxies", agora, vec![arq("p.mov", 9 * MB, agora)], vec![])]),
            pasta(".Trash", agora, vec![arq("apagado.mov", 7 * MB, agora)], vec![]),
        ]);
        let a = Arvore::de_varredura(PathBuf::from("/Users/ana"), p);
        let g = calcular(&a, agora);
        let nomes = |gi: usize| g[gi].itens.iter().map(|i| a.nos[*i as usize].nome.to_string()).collect::<Vec<_>>();
        assert_eq!(nomes(G_CACHES), vec!["com.app.um"]);
        assert_eq!(nomes(G_EDICAO), vec!["Media Cache Files"]);
        assert_eq!(nomes(G_INSTALADORES), vec!["Instalador.dmg"]);
        // a pasta antiga em Downloads fica inteira em "downloads": o node_modules de dentro não conta de novo
        assert_eq!(nomes(G_DOWNLOADS), vec!["velho.zip", "projeto-antigo"]);
        assert!(nomes(G_DEV).is_empty());
        assert_eq!(nomes(G_PROXIES), vec!["Proxies"]);
        assert_eq!(nomes(G_ESQUECIDOS), vec!["bruto.mov"]);
        assert_eq!(nomes(G_LIXEIRA), vec![".Trash"]);
        let j = para_json(&a, &g);
        assert_eq!(j[G_EDICAO]["seguranca"], "volta");
        assert_eq!(j[G_INSTALADORES]["itens"][0]["c"], "Downloads/Instalador.dmg");
    }
}
