plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Build = número da execução do CI (o Android só instala por cima um versionCode maior). Local: 1.
val build = (System.getenv("RADION_ANDROID_BUILD") ?: "1").toIntOrNull() ?: 1

// Chave de assinatura: só no CI, vinda dos secrets (nunca no repositório). Sem ela, o APK sai com a chave de
// depuração: instala, mas cada versão nova pede desinstalar a anterior.
val chave = System.getenv("RADION_ANDROID_KEYSTORE")?.takeIf { it.isNotBlank() && file(it).exists() }

android {
    namespace = "com.absolutezro.radion"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.absolutezro.radion"
        minSdk = 26
        targetSdk = 35
        versionCode = build
        versionName = "0.1.0"
    }

    signingConfigs {
        if (chave != null) {
            create("lancamento") {
                storeFile = file(chave)
                storePassword = System.getenv("RADION_ANDROID_KEYSTORE_SENHA")
                keyAlias = System.getenv("RADION_ANDROID_CHAVE")
                keyPassword = System.getenv("RADION_ANDROID_CHAVE_SENHA")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (chave != null) signingConfigs.getByName("lancamento") else signingConfigs.getByName("debug")
        }
    }

    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":nucleo"))
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
}
