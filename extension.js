'use strict';

import GLib from 'gi://GLib';
import Gio  from 'gi://Gio';
import St   from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/**
 * Parse a CSS color string ("rgba(r,g,b,a)", "rgb(r,g,b)", "#rrggbb", "#rgb")
 * into a plain { r, g, b, a } object with values in [0, 1].
 * Returns null if the string is unrecognised.
 *
 * Gdk is only available in the prefs subprocess, so we parse manually here.
 */
function parseColor(str) {
    if (!str) return null;
    const s = str.trim();

    let m;

    m = s.match(/^rgba\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/i);
    if (m) return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: +m[4] };

    m = s.match(/^rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/i);
    if (m) return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: 1 };

    m = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255, a: 1 };

    m = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (m) return { r: parseInt(m[1] + m[1], 16) / 255, g: parseInt(m[2] + m[2], 16) / 255, b: parseInt(m[3] + m[3], 16) / 255, a: 1 };

    return null;
}

/** Serialize a { r, g, b, a } (values 0–1) to a CSS rgba() string. */
function toCss({ r, g, b, a }) {
    return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${Math.min(1, Math.max(0, a)).toFixed(3)})`;
}

/** Clamp a value to [0, 1]. */
const clamp = v => Math.min(1, Math.max(0, v));

// ---------------------------------------------------------------------------
// CSS builder
// ---------------------------------------------------------------------------

/**
 * Build the full CSS string to inject into the Shell theme.
 *
 * The final background alpha = background-color.alpha × transparency,
 * so both controls are independently tunable.
 *
 * When style-menus is false only the #panel block is emitted, leaving
 * all dropdown menus styled by the active Shell theme.
 */
function buildCss(settings) {
    const bgStr       = settings.get_string('background-color');
    const transparency = settings.get_double('transparency');
    const height      = settings.get_int('panel-height');
    const textColor   = settings.get_string('text-color');
    const styleMenus  = settings.get_boolean('style-menus');

    const parsed = parseColor(bgStr);
    const bgCss  = parsed ? toCss({ ...parsed, a: parsed.a * transparency }) : bgStr;

    const lines = [
        '#panel {',
        `    background-color: ${bgCss};`,
        `    height: ${height}px;`,
        `    min-height: ${height}px;`,
        '}',
        '#panel * { color: ' + textColor + '; }',
        '#panel .panel-button { color: ' + textColor + '; }',
        '#panel .panel-button:hover { background-color: rgba(255,255,255,0.15); }',
    ];

    if (styleMenus && parsed) {
        // Derive menu colours from the panel base colour.
        // Menus must be opaque enough to read, so alpha is clamped to ≥ 0.92.
        const ma = Math.max(0.92, parsed.a);
        const menuBg = toCss({ ...parsed, a: ma });

        // Lighten dark backgrounds, darken light ones for hover states.
        const luma  = 0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b;
        const shift = luma < 0.5 ? 0.12 : -0.10;
        const hov   = toCss({ r: clamp(parsed.r + shift), g: clamp(parsed.g + shift), b: clamp(parsed.b + shift), a: ma });

        const hs  = luma < 0.5 ? 0.07 : -0.07;
        const hdr = toCss({ r: clamp(parsed.r + hs), g: clamp(parsed.g + hs), b: clamp(parsed.b + hs), a: ma });

        const border = toCss({ ...parsed, a: 0.18 });

        lines.push(
            // Popup menus
            `.panel-menu, .panel-menu StBoxLayout { background-color: ${menuBg}; color: ${textColor}; }`,
            `.popup-menu-content { background-color: ${menuBg}; color: ${textColor}; border-color: ${border}; border-width: 1px; border-radius: 8px; box-shadow: 0 4px 18px rgba(0,0,0,0.45); }`,
            `.popup-menu-item { color: ${textColor}; }`,
            `.popup-menu-item:hover, .popup-menu-item:focus { background-color: ${hov}; color: ${textColor}; }`,
            `.popup-menu-item:active { background-color: ${hov}; color: ${textColor}; }`,
            `.popup-menu-item .popup-menu-ornament { color: ${textColor}; }`,
            `.popup-separator-menu-item StWidget { background-color: ${border}; }`,
            `.popup-menu-section .popup-sub-menu, .popup-menu-section > StBoxLayout { background-color: ${hdr}; }`,
            `.popup-menu-item .toggle-switch:checked { background-color: ${textColor}; }`,
            // Quick Settings (GNOME 43+)
            `.quick-settings, .quick-settings-grid, .quick-settings StBoxLayout { background-color: ${menuBg}; color: ${textColor}; }`,
            `.quick-toggle, .quick-menu-toggle { background-color: ${hdr}; color: ${textColor}; }`,
            `.quick-toggle:hover, .quick-toggle:checked, .quick-menu-toggle:hover, .quick-menu-toggle:checked { background-color: ${hov}; color: ${textColor}; }`,
            // Calendar / notifications
            `.message-list, .message-list-placeholder { background-color: ${menuBg}; color: ${textColor}; }`,
            `.message { background-color: ${hdr}; color: ${textColor}; }`,
            `.message:hover { background-color: ${hov}; }`,
            `.datemenu-today-button { color: ${textColor}; }`,
            `.calendar { color: ${textColor}; }`,
            `.calendar-day:hover, .calendar-day:focus { background-color: ${hov}; }`,
            `.calendar-today { background-color: ${hov}; color: ${textColor}; border-color: ${textColor}; }`,
        );
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default class PanelCustomizerExtension extends Extension {

    enable() {
        this._settings = this.getSettings();

        this._cssFile = Gio.File.new_for_path(
            GLib.build_filenamev([GLib.get_tmp_dir(), 'panel-customizer.css'])
        );

        this._applyStyles();

        this._signalIds = [
            'background-color',
            'transparency',
            'panel-height',
            'text-color',
            'style-menus',
        ].map(key => this._settings.connect(`changed::${key}`, () => this._applyStyles()));
    }

    disable() {
        for (const id of this._signalIds)
            this._settings.disconnect(id);
        this._signalIds = null;

        this._unloadStylesheet();

        this._settings = null;
        this._cssFile  = null;
    }

    _applyStyles() {
        const css = buildCss(this._settings);

        this._cssFile.replace_contents(
            new TextEncoder().encode(css),
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );

        this._loadStylesheet();
    }

    _loadStylesheet() {
        this._unloadStylesheet();

        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        if (!theme)
            return;

        theme.load_stylesheet(this._cssFile);
        this._loadedStylesheet = this._cssFile;
    }

    _unloadStylesheet() {
        if (!this._loadedStylesheet)
            return;

        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        if (theme)
            theme.unload_stylesheet(this._loadedStylesheet);

        this._loadedStylesheet = null;
    }
}
