// RADION nativo · Android (products/radio/nativo/android). Dois módulos:
//   :nucleo  o rádio no Android sem login nem banco (serviço em primeiro plano, notificação com Falar/Parar, botão do
//            fone, saída de som): reaproveitável por outro app (o DEICHECK, depois de 14/11).
//   :app     o RADION: a página de radion.absolutezro.com numa WebView, o login pelo navegador e a ponte com o núcleo.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "radion-android"
include(":nucleo", ":app")
