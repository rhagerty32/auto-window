# Auto Window

A **free** Raycast extension that saves your multi-monitor window layout and puts everything back with a hotkey. No Raycast Pro.

It remembers **which physical desk you were on** (laptop vs 4 displays), **which Mission Control Space** each window was on, and **fill vs native fullscreen**. Displays are chosen by role — builtin laptop, largest, rightmost — not “Display 3”.

## Install

macOS, [Raycast](https://www.raycast.com) (or Raycast Beta), [Node 22.14+](https://nodejs.org), and Xcode Command Line Tools (`xcode-select --install`).

```bash
git clone <this-repo-url>
cd auto-window
nvm use          # optional; repo has .nvmrc
npm install
npm run dev
```

Leave `npm run dev` running the first time until Raycast shows Auto Window in the root search. After that you can quit it.

1. When macOS asks, allow **layout-helper** in **System Settings → Privacy & Security → Accessibility**.
2. Arrange your windows, then run **Capture Layout**. Uncheck anything that should stay put.
3. In Raycast Settings → Extensions, give **Apply Default Preset** a hotkey.

Your layouts stay on that Mac (Raycast local storage). Friends capture their own; they do not get yours.

If `ray lint` complains about `author`, set it in `package.json` to [your Raycast username](https://www.raycast.com).

## After `git pull`

Raycast keeps its own copy of the extension. Pulling git is not enough.

```bash
git pull
./reload-raycast.sh
```

That reinstalls deps, rebuilds the native helper, rebuilds the extension, and restarts Raycast so the update is live.

## How to use it

**Everyday:** one hotkey on **Apply Default Preset**. It picks the layout for *this* display count (laptop vs desk). If you have no layout for that count, you get a HUD instead of a mess.

**Save a layout:** **Capture Layout**. Check the windows you want managed. You can overwrite the suggested preset (Work / Laptop) or save a new name.

**Browse / edit / apply:** **Manage Presets**. This desk vs other desks. Applying a layout meant for a different display count asks first.

**More hotkeys:** assign each preset a slot in Manage Presets, then bind **Apply Layout 1** … **Apply Layout 8** in Raycast settings.

**By name:** **Apply Layout**, then type the preset name (or a Quicklink).

**From scratch:** **Create Preset**, then add apps by hand — or just capture.

## What a layout stores


| Piece         | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| Display count | Laptop (1) and Work (4) are different desks                         |
| Display role  | Builtin, largest, rightmost, leftmost, main (menu bar)              |
| Space         | Mission Control desktop on that monitor (shown as Space 1, Space 2) |
| Region        | Fill, halves, custom %, or **native fullscreen** (its own Space)    |
| Stack         | Which window was in front                                           |


Browser tab titles (Dia, Chrome, Safari, …) are ignored. Two Dia windows are told apart by windowed vs fullscreen.

A sample **Work** preset ships for a 4-display desk (Dia / Cursor Agents / Discord). Recapture for your apps.

## Commands


| Command              | Use                                           |
| -------------------- | --------------------------------------------- |
| Capture Layout       | Save what’s on screen, including other Spaces |
| Manage Presets       | List, edit, duplicate, set default, apply     |
| Apply Default Preset | Hotkey: layout for the current display count  |
| Apply Layout 1–8     | Hotkey slots you assign per preset            |
| Apply Layout         | Apply by preset name                          |
| Create Preset        | Empty preset, add windows manually            |




## If something’s off

- **Helper not trusted** — Accessibility must include `layout-helper` (not only Raycast). Re-run **Capture Layout** after allowing it.
- **Wrong desk** — capture once on the laptop and once at the desk. Defaults are per display count.
- **Cursor didn’t fill** — apply again; Electron sometimes needs the window frontmost. Recapture if the slot still looks wrong.
- **Update didn’t show up** — you pulled git but didn’t run `./restart-raycast.sh`.

