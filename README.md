# Panel Customizer — GNOME Shell Extension

Customize the **background color**, **transparency**, **height**, and **text/icon color** of the GNOME top panel. Changes are applied live — no Shell restart needed after adjusting a preference.

---

## Requirements

| Requirement            | Version       |
|------------------------|---------------|
| GNOME Shell            | 45 – 51       |
| GLib tools             | ≥ 2.60        |
| `gnome-extensions` CLI | any recent    |

---

## File Layout

```
TopPanel/
├── metadata.json          — Extension metadata
├── extension.js           — Main extension logic (ESM)
├── prefs.js               — Preferences window (Adw/GTK4, ESM)
├── stylesheet.css         — Base stylesheet (dynamic rules added at runtime)
├── build.sh               — Build / install helper
├── README.md              — This file
└── schemas/
    └── org.gnome.shell.extensions.panel-customizer.gschema.xml
```

---

## Building & Installing

### 1 — Compile the schema and create the zip

```bash
cd /home/gm/TopPanel
chmod +x build.sh
./build.sh
```

This produces:
- `schemas/gschemas.compiled`
- `panel-customizer@example.com.zip`

### 2 — Install (one command)

```bash
./build.sh install
```

Or manually:

```bash
gnome-extensions install --force panel-customizer@example.com.zip
```

### 3 — Reload GNOME Shell

| Session type | How to reload |
|---|---|
| **X11** | Press **Alt+F2**, type **`r`**, press **Enter** |
| **Wayland** | **Log out** and log back in (in-session restart is not available) |

### 4 — Enable the extension

```bash
gnome-extensions enable panel-customizer@example.com
```

Or use the **Extensions** app / GNOME Tweaks.

---

## Opening Preferences

```bash
gnome-extensions prefs panel-customizer@example.com
```

Or click the ⚙ gear icon next to the extension in the **Extensions** app.

---

## Settings Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `background-color` | string | `rgba(0,0,0,0.75)` | CSS color for panel background |
| `transparency` | double | `0.75` | Alpha multiplier (0 = transparent, 1 = opaque) |
| `panel-height` | integer | `32` | Panel height in pixels (20–80) |
| `text-color` | string | `#ffffff` | CSS color for panel text and icons |

> **Note:** The final background alpha = `background-color.alpha × transparency`.
> This lets you control the base color and overall fade independently.

---

## Resetting to Defaults

```bash
dconf reset -f /org/gnome/shell/extensions/panel-customizer/
```

---

## Uninstalling

```bash
gnome-extensions uninstall panel-customizer@example.com
```

---

## Troubleshooting

### Height preference has no effect

Some GNOME versions (≥ 46) do not honour the CSS `height` rule on `#panel`
because the Shell layout manager overrides it. In that case uncomment the
two lines in `extension.js` inside `_applyStyles()`:

```js
Main.panel.height = this._settings.get_int('panel-height');
Main.panel.queue_relayout();
```

### Checking for errors

Open a terminal and watch the journal while toggling the extension:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

### Schema not found

Make sure you ran `./build.sh` (which calls `glib-compile-schemas schemas/`)
**before** installing, and that the compiled `gschemas.compiled` file was
included in the installed extension directory:

```
~/.local/share/gnome-shell/extensions/panel-customizer@example.com/schemas/
```

---

## Development Tips

- Use `gnome-extensions enable/disable panel-customizer@example.com` to
  hot-reload during development on X11 (no `r` restart needed after `disable`
  + `enable` if the Shell is already running).
- `Looking Glass` (`Alt+F2` → `lg`) is useful for inspecting the Shell's
  actor tree and checking that CSS rules are applied.
- On Wayland, use a nested Shell session for rapid iteration:
  ```bash
  dbus-run-session -- gnome-shell --nested --wayland
  ```

---

## License

MIT — feel free to adapt for your own use.
