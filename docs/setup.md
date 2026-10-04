# Development setup

This guide sets up a macOS, Linux or Windows machine to build the Wren phone app (React Native,
Expo development build, `llama.rn`). Teammates and coding agents follow it in
order. Each step names the version, the install command and a check command.

Every machine needs the shared requirements. The phone app then needs one platform toolchain:
macOS runs the app in the iOS Simulator, and Linux or Windows runs it in the Android emulator.
Apple's tools run only on macOS, so the iOS Simulator is available only there.

The macOS commands were checked on a Mac on 3 October 2026. The Linux and Windows commands follow
each tool's published install instructions and have not yet been run on a team machine.

## Conventions

- **Package manager: bun.** Run `bun install`, `bun add <pkg>`, `bun add -d <pkg>` and
  `bunx <cli>`. Commit `bun.lock`. Never run `npm install`, `pnpm install` or `yarn`; they write a
  second lockfile.
- **Runtime: Node 24 LTS.** bun installs packages; Node runs the Expo CLI and Metro.
  `bunx` runs a CLI with Node when the CLI's script declares Node. Each `package.json` pins
  `"engines": { "node": ">=24 <25" }`.
- **Node version file:** `.nvmrc` at the repository root pins Node 24. nvm, fnm and Volta read it.
- **App targets:** the iOS Simulator on macOS and the Android emulator on Linux or Windows check
  that the app works. Performance figures come from a team iPhone (`docs/architecture.md`
  section 2).
- **Credentials:** keys and tokens go in `.env` or `.env.local`, which `.gitignore` excludes.
  `.env.example` lists the variable names with empty values.

## Shared requirements

| Tool | Version | macOS | Linux | Windows | Check |
| --- | --- | --- | --- | --- | --- |
| git | any recent | `xcode-select --install` | distro package (`apt install git`) | `winget install Git.Git` | `git --version` |
| Node | 24 LTS | `brew install node@24`, then the PATH line below | nvm or fnm: `nvm install` in the repository | `winget install OpenJS.NodeJS.LTS` | `node -v` prints `v24.*` |
| bun | 1.3 or later | `curl -fsSL https://bun.sh/install \| bash` | same as macOS | `powershell -c "irm bun.sh/install.ps1 \| iex"` | `bun --version` |
| GitHub CLI | any recent | `brew install gh` | https://github.com/cli/cli/blob/trunk/docs/install_linux.md | `winget install GitHub.cli` | `gh auth status` |
| pre-commit | 4.x | `uv tool install pre-commit` or `brew install pre-commit` | `uv tool install pre-commit` or `pipx install pre-commit` | same as Linux | `pre-commit --version` |

After installing the GitHub CLI, run `gh auth login`. pre-commit needs Python 3.9 or later.

On macOS, Homebrew installs `node@24` without linking it, so put it ahead of any other Node in
`~/.zshrc`:

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

## Phone app on macOS: iOS Simulator

| Tool | Version | Install | Check |
| --- | --- | --- | --- |
| Xcode | 26.x | Mac App Store, then `sudo xcode-select -s /Applications/Xcode.app` | `xcodebuild -version` |
| iOS Simulator runtime | iOS 26.x | Xcode, Settings, Components | `xcrun simctl list runtimes` |
| CocoaPods | 1.16 or later | `brew install cocoapods` | `pod --version` |
| Watchman | any recent | `brew install watchman` | `watchman --version` |

## Phone app on Linux or Windows: Android emulator

| Tool | Version | Install | Check |
| --- | --- | --- | --- |
| JDK | 17 | Linux: `apt install openjdk-17-jdk`; Windows: `winget install Microsoft.OpenJDK.17` | `java -version` prints `17` |
| Android Studio | current stable | https://developer.android.com/studio | opens |
| Android SDK, platform tools and an emulator image | the latest API level Android Studio offers | Android Studio, SDK Manager, then Device Manager to create a virtual device | `adb version` |

Set `ANDROID_HOME` to the SDK folder and add its `platform-tools` and `emulator` folders to `PATH`:

- Linux, in `~/.bashrc` or `~/.zshrc`:
  `export ANDROID_HOME="$HOME/Android/Sdk"` and
  `export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"`
- Windows: set `ANDROID_HOME` to `%LOCALAPPDATA%\Android\Sdk` in System Properties, Environment
  Variables, and add `%ANDROID_HOME%\platform-tools` and `%ANDROID_HOME%\emulator` to `Path`.

A Mac can run the Android emulator too by adding this section's tools.

## Repository hooks

Run once after cloning:

```sh
pre-commit install
pre-commit run --all-files
```

## Verify the toolchain

Every line prints a version and none prints an error. Shared, on every machine:

```sh
git --version && node -v && bun --version && gh auth status && pre-commit --version
```

macOS, for the iOS Simulator:

```sh
xcodebuild -version && xcrun simctl list runtimes | grep iOS && pod --version && watchman --version
```

Linux or Windows, for the Android emulator:

```sh
java -version && adb version && emulator -list-avds
```

## Running the app

The app scaffold arrives with #6. Once it exists, from the app directory:

```sh
bun install
bunx expo run:ios        # macOS: builds the development build and opens it in the iOS Simulator
bunx expo run:android    # any OS: builds it and opens it in a running Android emulator
```

## Loading a model

GGUF model files stay outside git (`*.gguf` is ignored). The app loads the first `.gguf` file it
finds in its `Documents/models` folder. The test model for #6 is Qwen2.5 0.5B Instruct, Q4_K_M
quantisation, 491 MB, Apache 2.0 licence:

```sh
mkdir -p ~/models
curl -fL -o ~/models/qwen2.5-0.5b-instruct-q4_k_m.gguf \
  https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf
shasum -a 256 ~/models/qwen2.5-0.5b-instruct-q4_k_m.gguf
# 74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db
```

The chosen models (`docs/architecture.md` section 2) download the same way:

```sh
curl -fL -o ~/models/Qwen3-1.7B-Q4_K_M.gguf \
  https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf
curl -fL -o ~/models/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf \
  https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf
```

Copy each model into the app after the app has been installed once.

iOS Simulator (macOS):

```sh
DATA=$(xcrun simctl get_app_container booted com.hacknation.wren data)
mkdir -p "$DATA/Documents/models"
cp ~/models/qwen2.5-0.5b-instruct-q4_k_m.gguf "$DATA/Documents/models/"
```

Android emulator (any OS; the debug build allows `run-as`):

```sh
adb push ~/models/qwen2.5-0.5b-instruct-q4_k_m.gguf /data/local/tmp/
adb shell run-as com.hacknation.wren mkdir -p files/models
adb shell run-as com.hacknation.wren cp /data/local/tmp/qwen2.5-0.5b-instruct-q4_k_m.gguf files/models/
```

Then tap "Check again" in the app.

## Trying the Website Creator

The Website tab needs an approved Farm profile and the separate
`qwen2.5-coder-1.5b-instruct-q4_k_m.gguf` model in `Documents/models`. Open the tab while online
once to load the app, then generation and preview run locally and work without internet. Review
the English and Kiswahili copy and tap **Publish this page**, then **Confirm and publish**, to queue
the page in the Farm spreadsheet. Google sign-in and internet are needed to sync it. The app's
Apps Script API provisioning flow is still to be implemented, so saving the page does not yet make
a public website URL. Noor will also need to enable the Apps Script API once in her Google account.

## Testing the agent on a model server

A development machine that cannot hold the model in memory (an 8 GB Mac with the Simulator ran Qwen3 1.7B at under one token per second) can run the agent's model on a llama.cpp server instead. The agent's tools, harness and approvals still run in the app; only the model call moves.

Build `llama-server` from the llama.cpp commit that `llama.rn` bundles, so prompt formatting and tool-call parsing match the phone. The commit is `LLAMA_COMMIT` in `app/node_modules/llama.rn/cpp/common/build-info.cpp`.

```sh
git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp && git checkout 6c8dcaa
cmake -B build -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release   # drop -DGGML_CUDA=ON without an NVIDIA GPU
cmake --build build --target llama-server -j
build/bin/llama-server -m Qwen3-1.7B-Q4_K_M.gguf --jinja -ngl 99 -c 8192 --host <server address> --port 8090
```

iOS refuses plain `http://` to any host but localhost, so forward the port and point the app at localhost:

```sh
ssh -fN -L 8090:<server address>:8090 <user>@<server address>
cd app && EXPO_PUBLIC_MODEL_URL=http://localhost:8090 bunx expo start --dev-client
```

`EXPO_PUBLIC_AUTORUN=agent` sends a scripted message to the agent when the app opens. Leave `EXPO_PUBLIC_MODEL_URL` unset to run the model on the phone.
