//! Tipo de cada arquivo, pela extensão. A interface pinta o anel com isto.
//!
//! Pacotes (`.app`, `.fcpbundle`, `.logicx`…) são pastas para o sistema e um arquivo só para quem usa: tudo dentro deles
//! herda o tipo do pacote.

pub const VIDEO: u8 = 0;
pub const AUDIO: u8 = 1;
pub const IMAGEM: u8 = 2;
pub const PROJETO: u8 = 3;
pub const APPS: u8 = 4;
pub const OUTROS: u8 = 5;
pub const QTD: usize = 6;


fn extensao(nome: &str) -> Option<String> {
    let i = nome.rfind('.')?;
    if i == 0 || i + 1 == nome.len() {
        return None;
    }
    Some(nome[i + 1..].to_ascii_lowercase())
}

pub fn de_arquivo(nome: &str) -> u8 {
    let Some(ext) = extensao(nome) else { return OUTROS };
    match ext.as_str() {
        "mp4" | "mov" | "mxf" | "mkv" | "avi" | "m4v" | "r3d" | "braw" | "ari" | "mts" | "m2ts" | "wmv" | "webm"
        | "crm" | "insv" | "lrv" | "3gp" | "mpg" | "mpeg" | "vob" | "dv" | "hevc" | "h264" => VIDEO,
        "wav" | "mp3" | "aac" | "m4a" | "aif" | "aiff" | "flac" | "ogg" | "caf" | "bwf" | "opus" | "wma" | "m4b"
        | "mid" | "midi" => AUDIO,
        "jpg" | "jpeg" | "png" | "heic" | "heif" | "tif" | "tiff" | "psd" | "psb" | "raw" | "cr2" | "cr3" | "nef"
        | "arw" | "dng" | "raf" | "orf" | "rw2" | "exr" | "dpx" | "gif" | "webp" | "svg" | "ai" | "bmp" | "avif"
        | "cube" | "lut" => IMAGEM,
        "prproj" | "aep" | "aet" | "drp" | "drt" | "dra" | "fcpxml" | "motn" | "moti" | "veg" | "als" | "ptx"
        | "sesx" | "aup3" | "blend" | "c4d" | "prel" | "edl" | "xml" | "otio" | "nk" | "hip" | "ma" | "mb" => {
            PROJETO
        }
        "dmg" | "pkg" | "iso" | "exe" | "msi" | "dll" | "dylib" | "so" | "kext" | "vmdk" | "vdi" | "qcow2"
        | "vmem" | "vhd" | "vhdx" | "appx" | "msix" | "ipsw" | "deb" | "rpm" | "appimage" => APPS,
        _ => OUTROS,
    }
}

/// Pasta que é um pacote: tudo dentro herda este tipo.
pub fn de_pacote(nome: &str) -> Option<u8> {
    let ext = extensao(nome)?;
    match ext.as_str() {
        "app" | "framework" | "bundle" | "plugin" | "appex" | "kext" | "pkg" | "mpkg" => Some(APPS),
        "fcpbundle" | "logicx" | "band" | "aplibrary" | "dvdproj" | "imovielibrary" | "fcpproject" => Some(PROJETO),
        "photoslibrary" | "lrlibrary" => Some(IMAGEM),
        "tvlibrary" => Some(VIDEO),
        _ => None,
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn extensoes() {
        assert_eq!(de_arquivo("A001_C002.R3D"), VIDEO);
        assert_eq!(de_arquivo("take 3.wav"), AUDIO);
        assert_eq!(de_arquivo("capa.HEIC"), IMAGEM);
        assert_eq!(de_arquivo("corte final.prproj"), PROJETO);
        assert_eq!(de_arquivo("Instalador.dmg"), APPS);
        assert_eq!(de_arquivo(".DS_Store"), OUTROS);
        assert_eq!(de_arquivo("sem-extensao"), OUTROS);
        assert_eq!(de_arquivo("ponto."), OUTROS);
    }

    #[test]
    fn pacotes() {
        assert_eq!(de_pacote("Final Cut Pro.app"), Some(APPS));
        assert_eq!(de_pacote("Cliente X.fcpbundle"), Some(PROJETO));
        assert_eq!(de_pacote("Fotos.photoslibrary"), Some(IMAGEM));
        assert_eq!(de_pacote("Projetos"), None);
    }
}
