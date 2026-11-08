# Auto Window

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](https://www.raycast.com)
[![Node](https://img.shields.io/badge/node-%3E%3D22.14.0-brightgreen)](.nvmrc)

**Save multi-monitor window layouts and restore them with a Raycast hotkey—no Raycast Pro required.**

> **Screenshot / demo** — Add a GIF or PNG here when available (for example `media/demo.gif`). Raycast Store screenshots belong in [`metadata/`](metadata/) at 2000×1250 PNG.

Auto Window remembers **which desk you were on** (laptop vs external monitors), **Mission Control Space** per display, and **fill vs native fullscreen**. Displays are matched by **role** (builtin, largest, rightmost, …), not fragile display index numbers.

## Features

- **Capture Layout** — snapshot the current arrangement, including windows on other Spaces
- **Apply Default Preset** — one hotkey picks the default layout for the current display count
- **Apply Layout 1–8** — bind hotkeys to preset slots
- **Manage Presets** — browse, edit, duplicate, and set defaults per display count
- **Display roles** — layouts survive monitor reconnects better than fixed display IDs
- **Native helper** — small Swift `layout-helper` binary for Accessibility-based window control
- **Local storage** — presets stay on your Mac (Raycast local storage); nothing is synced to a server

## Install

You need macOS, [Raycast](https://www.raycast.com) (or Raycast Beta), [Node 22.14+](https://nodejs.org), and Xcode Command Line Tools (`xcode-select --install`).

```bash
git clone https://github.com/rhagerty32/auto-window.git
cd auto-window
nvm use          # optional; repo has .nvmrc
npm install
npm run dev
```

Leave `npm run dev` running the first time until Raycast shows **Auto Window** in the root search. After that you can quit it.

1. When macOS asks, allow **layout-helper** in **System Settings → Privacy & Security → Accessibility**.
2. Arrange your windows, then run **Capture Layout**. Uncheck anything that should stay put.
3. In Raycast Settings → Extensions, give **Apply Default Preset** a hotkey.

Layouts are stored locally on that Mac. Share the repo with friends—they capture their own presets.

If `ray lint` complains about `author` in your fork, set `package.json` → `author` to your [Raycast username](https://www.raycast.com).

### After `git pull`

Raycast keeps its own copy of the extension. Pulling git is not enough.

```bash
git pull
./reload-raycast.sh
```

That reinstalls deps, rebuilds the native helper, rebuilds the extension, and restarts Raycast so the update is live.

## How to use it

**Everyday:** one hotkey on **Apply Default Preset**. It picks the layout for *this* display count (laptop vs desk). If you have no layout for that count, you get a HUD instead of a mess.

**Save a layout:** **Capture Layout**. Check the windows you want managed. You can overwrite the suggested preset (Work / Laptop) or save a new name.

**Browse / edit / apply:** **Manage Presets**. Separate presets for this desk vs other desks. Applying a layout meant for a different display count asks first.

**More hotkeys:** assign each preset a slot in Manage Presets, then bind **Apply Layout 1** … **Apply Layout 8** in Raycast settings.

**By name:** **Apply Layout**, then type the preset name (or a Quicklink).

**From scratch:** **Create Preset**, then add apps by hand—or capture from the desktop.

## What a layout stores

| Piece         | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| Display count | Laptop (1) and Work (4) are different desks                         |
| Display role  | Builtin, largest, rightmost, leftmost, main (menu bar)              |
| Space         | Mission Control desktop on that monitor (shown as Space 1, Space 2) |
| Region        | Fill, halves, custom %, or **native fullscreen** (its own Space)    |
| Stack         | Which window was in front                                           |

Browser tab titles (Dia, Chrome, Safari, …) are ignored. Two browser windows are told apart by windowed vs fullscreen.

A sample **Work** preset ships for a 4-display desk (Dia / Cursor Agents / Discord). Recapture for your own apps.

## Commands

| Command              | Use                                           |
| -------------------- | --------------------------------------------- |
| Capture Layout       | Save what’s on screen, including other Spaces |
| Manage Presets       | List, edit, duplicate, set default, apply     |
| Apply Default Preset | Hotkey: layout for the current display count  |
| Apply Layout 1–8     | Hotkey slots you assign per preset            |
| Apply Layout         | Apply by preset name                          |
| Create Preset        | Empty preset, add windows manually            |

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, `npm run dev`, lint, tests, and pull request expectations.

```bash
npm run dev          # develop in Raycast
npm run lint         # ESLint + Prettier + extension checks
npm test             # unit tests (layout logic)
npm run build        # helper + distribution build
```

The Swift sources for `layout-helper` live in `native/layout-helper/`. TypeScript commands live in `src/`.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the [MIT License](LICENSE) (Copyright © Ryan Hagerty).

## Troubleshooting

- **Helper not trusted** — Accessibility must include `layout-helper` (not only Raycast). Re-run **Capture Layout** after allowing it.
- **Wrong desk** — capture once on the laptop and once at the desk. Defaults are per display count.
- **Cursor didn’t fill** — apply again; Electron sometimes needs the window frontmost. Recapture if the slot still looks wrong.
- **Update didn’t show up** — you pulled git but didn’t run `./reload-raycast.sh`.
