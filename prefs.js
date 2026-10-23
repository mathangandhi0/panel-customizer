/**
 * prefs.js — Panel Customizer preferences window
 *
 * Runs in a separate subprocess (the prefs helper), so Gdk, Gtk, and Adw
 * are all available here. This is NOT the Shell process.
 *
 * UI layout:
 *   Adw.PreferencesWindow
 *     └─ Adw.PreferencesPage
 *          ├─ Adw.PreferencesGroup  "Scope"
 *          │    └─ Adw.SwitchRow   — Style Menus (toggle)
 *          └─ Adw.PreferencesGroup  "Panel Appearance"
 *               ├─ Adw.ActionRow  — Background Color   (Gtk.ColorDialogButton)
 *               ├─ Adw.ActionRow  — Transparency       (Gtk.Scale)
 *               ├─ Adw.ActionRow  — Panel Height       (Gtk.SpinButton)
 *               └─ Adw.ActionRow  — Text / Icon Color  (Gtk.ColorDialogButton)
 */

'use strict';

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {
    ExtensionPreferences,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// ---------------------------------------------------------------------------
// Colour helpers (Gdk-based, available in prefs subprocess)
// ---------------------------------------------------------------------------

/**
 * Parse a CSS color string into a Gdk.RGBA.
 * Falls back to the provided default if parsing fails.
 *
 * @param {string} css       CSS color string, e.g. "rgba(0,0,0,0.75)" or "#fff"
 * @param {Gdk.RGBA} fallback
 * @returns {Gdk.RGBA}
 */
function parseCssColor(css, fallback) {
    const color = new Gdk.RGBA();
    if (color.parse(css))
        return color;
    return fallback;
}

/**
 * Serialize a Gdk.RGBA to a CSS rgba() string.
 *
 * @param {Gdk.RGBA} rgba
 * @returns {string}
 */
function gdkRgbaToCss(rgba) {
    const r = Math.round(rgba.red   * 255);
    const g = Math.round(rgba.green * 255);
    const b = Math.round(rgba.blue  * 255);
    const a = rgba.alpha.toFixed(3);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ---------------------------------------------------------------------------
// ExtensionPreferences subclass
// ---------------------------------------------------------------------------

export default class PanelCustomizerPreferences extends ExtensionPreferences {

    /**
     * fillPreferencesWindow() is called by the Shell prefs infrastructure.
     * We receive an already-constructed Adw.PreferencesWindow.
     *
     * @param {Adw.PreferencesWindow} window
     */
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // ── Page ──────────────────────────────────────────────────────────
        const page = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(page);

        // ── Scope group (what gets styled) ────────────────────────────────
        const scopeGroup = new Adw.PreferencesGroup({
            title: 'Styling Scope',
            description: 'Choose which Shell elements the color theme is applied to.',
        });
        page.add(scopeGroup);

        // Panel-only vs panel + menus toggle.
        // Adw.SwitchRow handles the boolean binding natively.
        const menuSwitch = new Adw.SwitchRow({
            title: 'Style Dropdown Menus',
            subtitle: 'Apply panel colors to system menus, quick settings, calendar, and notifications.',
        });
        settings.bind('style-menus', menuSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        scopeGroup.add(menuSwitch);

        // ── Group ─────────────────────────────────────────────────────────
        const group = new Adw.PreferencesGroup({
            title: 'Panel Appearance',
            description: 'Customize the look of the top panel.',
        });
        page.add(group);

        // ── Background Color ──────────────────────────────────────────────
        group.add(this._buildColorRow(
            settings,
            'background-color',
            'Background Color',
            'The panel background color (alpha is combined with Transparency).',
        ));

        // ── Transparency ──────────────────────────────────────────────────
        group.add(this._buildScaleRow(
            settings,
            'transparency',
            'Transparency',
            'Opacity multiplier applied to the background color alpha channel.',
            0.0, 1.0, 0.05,
        ));

        // ── Panel Height ──────────────────────────────────────────────────
        group.add(this._buildSpinRow(
            settings,
            'panel-height',
            'Panel Height (px)',
            'Height of the top panel in pixels.',
            20, 80, 1,
        ));

        // ── Text / Icon Color ─────────────────────────────────────────────
        group.add(this._buildColorRow(
            settings,
            'text-color',
            'Text / Icon Color',
            'Color applied to panel labels and icons.',
        ));
    }

    // -----------------------------------------------------------------------
    // Row factory helpers
    // -----------------------------------------------------------------------

    /**
     * Build an Adw.ActionRow containing a Gtk.ColorDialogButton.
     * Changes are serialized back to the GSettings key as a CSS rgba() string.
     *
     * @param {Gio.Settings} settings
     * @param {string} key         GSettings key name
     * @param {string} title       Row title
     * @param {string} subtitle    Row subtitle / description
     * @returns {Adw.ActionRow}
     */
    _buildColorRow(settings, key, title, subtitle) {
        const row = new Adw.ActionRow({ title, subtitle });

        // Gtk.ColorDialog is the GTK4 replacement for the old ColorChooserDialog.
        const dialog = new Gtk.ColorDialog({
            title,
            with_alpha: true,
        });

        const button = new Gtk.ColorDialogButton({
            dialog,
            valign: Gtk.Align.CENTER,
        });

        // Initialize button with current settings value.
        const defaultColor = new Gdk.RGBA();
        defaultColor.parse('rgba(0,0,0,0.75)');
        const current = parseCssColor(settings.get_string(key), defaultColor);
        button.set_rgba(current);

        // When the color is picked, write it back to GSettings.
        button.connect('notify::rgba', () => {
            const css = gdkRgbaToCss(button.get_rgba());
            settings.set_string(key, css);
        });

        // When GSettings changes externally (e.g. via dconf), sync the button.
        settings.connect(`changed::${key}`, () => {
            const updated = parseCssColor(settings.get_string(key), defaultColor);
            // Avoid feedback loops: only update if actually different.
            const current = button.get_rgba();
            if (!current.equal(updated))
                button.set_rgba(updated);
        });

        row.add_suffix(button);
        row.set_activatable_widget(button);
        return row;
    }

    /**
     * Build an Adw.ActionRow containing a horizontal Gtk.Scale.
     * Uses settings.bind() for two-way synchronization.
     *
     * @param {Gio.Settings} settings
     * @param {string} key
     * @param {string} title
     * @param {string} subtitle
     * @param {number} min
     * @param {number} max
     * @param {number} step
     * @returns {Adw.ActionRow}
     */
    _buildScaleRow(settings, key, title, subtitle, min, max, step) {
        const row = new Adw.ActionRow({ title, subtitle });

        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: min,
                upper: max,
                step_increment: step,
                page_increment: step * 4,
            }),
            value_pos: Gtk.PositionType.RIGHT,
            digits: 2,
            width_request: 200,
            valign: Gtk.Align.CENTER,
        });

        // Add tick marks at each 0.25 interval for visual reference.
        scale.add_mark(0.0,  Gtk.PositionType.BOTTOM, '0');
        scale.add_mark(0.25, Gtk.PositionType.BOTTOM, null);
        scale.add_mark(0.5,  Gtk.PositionType.BOTTOM, '½');
        scale.add_mark(0.75, Gtk.PositionType.BOTTOM, null);
        scale.add_mark(1.0,  Gtk.PositionType.BOTTOM, '1');

        // Bind the GSettings double key ↔ Gtk.Adjustment value.
        settings.bind(
            key,
            scale.get_adjustment(),
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );

        row.add_suffix(scale);
        return row;
    }

    /**
     * Build an Adw.ActionRow containing a Gtk.SpinButton.
     * Uses settings.bind() for two-way synchronization.
     *
     * @param {Gio.Settings} settings
     * @param {string} key
     * @param {string} title
     * @param {string} subtitle
     * @param {number} min
     * @param {number} max
     * @param {number} step
     * @returns {Adw.ActionRow}
     */
    _buildSpinRow(settings, key, title, subtitle, min, max, step) {
        const row = new Adw.ActionRow({ title, subtitle });

        const spin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: min,
                upper: max,
                step_increment: step,
                page_increment: step * 5,
            }),
            valign: Gtk.Align.CENTER,
            climb_rate: 1,
            digits: 0,
        });

        // Bind the GSettings integer key ↔ SpinButton value.
        settings.bind(
            key,
            spin,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );

        row.add_suffix(spin);
        row.set_activatable_widget(spin);
        return row;
    }
}
