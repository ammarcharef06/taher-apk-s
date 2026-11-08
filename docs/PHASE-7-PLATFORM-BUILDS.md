# Phase 7 — Android, Windows, and Web delivery

Phase 7 adds build wrappers and GitHub Actions workflows around the existing Vue/Vite workspace. It does not change database schemas, migrations, business rules, or the synchronization engine.

## Prerequisites

- Node.js 20.19+ (the workflows use Node.js 22).
- pnpm 10.4.1.
- GitHub repository secrets:
  - `VITE_SUPABASE_URL`: the project's Supabase URL.
  - `VITE_SUPABASE_ANON_KEY`: the Supabase publishable/anon key. This is a browser client key, not a service-role key.
- For local Android builds: Android Studio and Android SDK, plus JDK 21.
- For local Windows builds: Windows 10/11, Rust stable, Microsoft C++ Build Tools, and WebView2.

The public Supabase anon/publishable key is compiled into the client bundle by design. Never put a Supabase service-role key in a `VITE_*` variable or GitHub Actions build secret.

## Install

From the repository root:

```bash
pnpm install
```

The repository currently has no committed `pnpm-lock.yaml`. Until a lockfile is generated and committed, the three workflows use `pnpm install --no-frozen-lockfile`; dependency resolution is therefore not yet fully reproducible. Generate and commit the lockfile after a successful local install before switching the workflows to frozen installs.

## Android APK

The Capacitor wrapper is in `apps/mobile`. The native Android project is generated from the Capacitor 7 platform during CI and is intentionally ignored by Git; the web app remains in `apps/web`.

Local first-time setup:

```bash
pnpm android:add
pnpm --dir apps/web build:relative
pnpm --dir apps/mobile exec cap sync android
```

Build a debug APK locally from `apps/mobile/android`:

```bash
./gradlew assembleDebug
```

The GitHub Actions workflow `.github/workflows/build-android.yml` creates the Android project, runs typecheck/tests, builds the web assets with a relative asset base, syncs Capacitor, and uploads an installable debug APK as the `taher-accounting-android-debug` artifact. Download it from the successful workflow run's Artifacts section.

This workflow creates a debug-signed APK for verification. A store/distribution release should use a separately configured release keystore and signing secrets; no signing key is stored in this repository.

## Windows EXE

The Tauri 2 wrapper is in `apps/desktop/src-tauri`. It embeds the built Vue assets from `apps/web/dist` and opens a native 1280×850 window.

Local development:

```bash
pnpm --dir apps/desktop dev
```

Build the Windows NSIS installer:

```bash
pnpm --dir apps/desktop build
```

The GitHub Actions workflow `.github/workflows/build-desktop.yml` runs on Windows, installs Rust, runs typecheck/tests, and builds the NSIS installer. The generated setup executable is uploaded as the `taher-accounting-windows-exe` artifact. The expected output is under `apps/desktop/src-tauri/target/release/bundle/nsis/*-setup.exe`.

## Web deployment

The workflow `.github/workflows/deploy-web.yml` builds the Vue application for the repository's GitHub Pages subpath, adds a `404.html` fallback for Vue Router history mode, and deploys the artifact.

In GitHub repository settings, open **Settings → Pages** and set the build/deployment source to **GitHub Actions**. The deployed project site URL is:

`https://ammarcharef06.github.io/taher-apk-s/`

## Workflows

| Workflow | Trigger | Output |
| --- | --- | --- |
| `build-android.yml` | Push to main, pull request to main, manual | Debug APK artifact |
| `build-desktop.yml` | Push to main, pull request to main, manual | Windows NSIS setup EXE artifact |
| `deploy-web.yml` | Push to main, manual | GitHub Pages deployment |

All three workflows require the two Supabase repository secrets above and run the existing workspace typecheck and core test suite before packaging.

## Scope and validation status

No migrations, database code, role checks, accounting logic, or sync-engine files are changed by Phase 7. CI workflows are configuration only until GitHub runs them. A successful commit does not mean APK/EXE generation or Pages deployment has passed; verify each workflow run and download/test its artifact.
