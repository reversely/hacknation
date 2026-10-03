# Development setup

This guide sets up a Mac to build the Noor phone app (React Native, Expo development build,
`llama.rn`) and the Next.js site. Teammates and coding agents follow it in order. Each step names
the version, the install command and a check command.

## Conventions

- **Package manager: bun.** Run `bun install`, `bun add <pkg>`, `bun add -d <pkg>` and
  `bunx <cli>`. Commit `bun.lock`. Never run `npm install`, `pnpm install` or `yarn`; they write a
  second lockfile.
- **Runtime: Node 24 LTS.** bun installs packages; Node runs the Expo CLI, Metro and Next.js.
  `bunx` runs a CLI with Node when the CLI's script declares Node. Each `package.json` pins
  `"engines": { "node": ">=24 <25" }` so Vercel builds on the same major version.
- **Functional target: the iOS Simulator.** Performance figures come from a team iPhone
  (`docs/architecture.md` section 2). The Android toolchain is not part of this guide yet.
- **Credentials:** keys and tokens go in `.env` or `.env.local`, which `.gitignore` excludes.
  `.env.example` lists the variable names with empty values.

## Requirements

| Tool | Version | Install | Check |
| --- | --- | --- | --- |
| Homebrew | any recent | https://brew.sh | `brew --version` |
| Xcode | 26.x | Mac App Store, then `sudo xcode-select -s /Applications/Xcode.app` | `xcodebuild -version` |
| iOS Simulator runtime | iOS 26.x | Xcode, Settings, Components | `xcrun simctl list runtimes` |
| CocoaPods | 1.16 or later | `brew install cocoapods` | `pod --version` |
| Node | 24 LTS | `brew install node@24`, then the PATH line below | `node -v` prints `v24.*` |
| bun | 1.3 or later | `curl -fsSL https://bun.sh/install \| bash` | `bun --version` |
| Watchman | any recent | `brew install watchman` | `watchman --version` |
| GitHub CLI | any recent | `brew install gh`, then `gh auth login` | `gh auth status` |
| pre-commit | 4.x | `uv tool install pre-commit` or `brew install pre-commit` | `pre-commit --version` |

Homebrew installs `node@24` without linking it, so put it ahead of any other Node in `~/.zshrc`:

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

## Repository hooks

Run once after cloning:

```sh
pre-commit install
pre-commit run --all-files
```

## Verify the toolchain

Every line prints a version and none prints an error:

```sh
xcodebuild -version && xcrun simctl list runtimes | grep iOS
pod --version && node -v && bun --version && watchman --version
gh auth status && pre-commit --version
```

## Running the app

The app scaffold arrives with #6. Once it exists, from the app directory:

```sh
bun install
bunx expo run:ios    # builds the development build and opens it in the iOS Simulator
```

GGUF model files stay outside git (`*.gguf` is ignored) and load from app storage.
