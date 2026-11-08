# Contributing

Thanks for helping improve Auto Window. This project is a Raycast extension with a small Swift helper for macOS window management.

## Prerequisites

- macOS (required to build and run the extension)
- [Raycast](https://www.raycast.com) or Raycast Beta
- Node.js **22.14+** (see `.nvmrc`)
- Xcode Command Line Tools (`xcode-select --install`) to compile `layout-helper`

## Set up

```bash
git clone https://github.com/rhagerty32/auto-window.git
cd auto-window
nvm use          # optional
npm install
```

## Develop locally

```bash
npm run dev
```

Leave `npm run dev` running the first time until Raycast lists **Auto Window** in the root search. Grant **Accessibility** for `layout-helper` when macOS prompts you.

After pulling changes, rebuild and restart Raycast:

```bash
./reload-raycast.sh
```

## Lint and test

```bash
npm run lint          # Raycast lint (ESLint + Prettier + metadata checks)
npm run fix-lint      # auto-fix where possible
npm test              # Node unit tests for layout logic
npm run build         # compile helper, then distribution build
```

Run `npm run build` before opening a pull request so type-checking and bundling succeed.

## Branch and pull request flow

1. Fork the repository (or branch from `main` if you have write access).
2. Create a branch with a clear name, for example `fix/capture-filter` or `docs/readme-clarify`.
3. Keep changes focused; avoid unrelated refactors.
4. Update tests in `src/lib/*.test.ts` when you change matching logic.
5. Open a pull request against `main` and describe what you changed and how you tested it.
6. Fill out the pull request template checklist.

## Extension metadata

If `ray lint` reports an `author` issue in your fork, set `author` in `package.json` to your [Raycast account username](https://www.raycast.com). Upstream may keep a different value for store submission.

## Questions

Open a [GitHub issue](https://github.com/rhagerty32/auto-window/issues) for bugs, ideas, or questions. For behavior expectations, see the README.
