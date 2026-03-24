// ─── notes-cm.js — CodeMirror 6 bridge (ES module) ──────────────
// Exposes window.NotesCM and fires 'notescmready' event when ready.

import { EditorView, keymap, lineNumbers, drawSelection, rectangularSelection } from 'https://esm.sh/@codemirror/view@6';
import { EditorState, Compartment } from 'https://esm.sh/@codemirror/state@6';
import {
    history, defaultKeymap, historyKeymap
} from 'https://esm.sh/@codemirror/commands@6';
import { search, searchKeymap, openSearchPanel, setSearchQuery, SearchQuery, selectNextOccurrence } from 'https://esm.sh/@codemirror/search@6';
import { markdown } from 'https://esm.sh/@codemirror/lang-markdown@6';
import { json } from 'https://esm.sh/@codemirror/lang-json@6';
import { xml } from 'https://esm.sh/@codemirror/lang-xml@6';
import { html } from 'https://esm.sh/@codemirror/lang-html@6';
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript@6';
import { oneDark } from 'https://esm.sh/@codemirror/theme-one-dark@6';

let _view = null;
let _currentLanguage = 'markdown';
const _langCompartment = new Compartment();
const _themeCompartment = new Compartment();
let _debounceTimer = null;

// ── Helpers ───────────────────────────────────────────────────────

function langExtension(lang) {
    switch (lang) {
        case 'markdown':   return markdown();
        case 'json':       return json();
        case 'xml':        return xml();
        case 'html':       return html();
        case 'javascript': return javascript();
        default:           return [];
    }
}

function handleImagePaste(event) {
    if (_currentLanguage !== 'markdown') return false;
    const items = [...(event.clipboardData?.items || [])];
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (!imageItem) return false;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (file && window._notesUploadImage) window._notesUploadImage(file, _view);
    return true;
}

function handleImageDrop(event) {
    if (_currentLanguage !== 'markdown') return false;
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return false;
    event.preventDefault();
    if (window._notesUploadImage) window._notesUploadImage(file, _view);
    return true;
}

// ── Public API ────────────────────────────────────────────────────

window.NotesCM = {
    mount(hostEl, content, language, isDark) {
        if (_view) { _view.destroy(); _view = null; }
        clearTimeout(_debounceTimer);
        _currentLanguage = language;

        const extensions = [
            lineNumbers(),
            history(),
            drawSelection(),
            rectangularSelection(),
            EditorView.lineWrapping,
            search({ top: false }),
            _langCompartment.of(langExtension(language)),
            _themeCompartment.of(isDark ? oneDark : []),
            // Custom keybindings first so they override defaultKeymap conflicts
            keymap.of([
                { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
                ...defaultKeymap,   // includes Alt+↑/↓ → move line up/down
                ...historyKeymap,
                ...searchKeymap,
            ]),
            EditorView.domEventHandlers({
                paste: handleImagePaste,
                drop: handleImageDrop,
            }),
            EditorView.updateListener.of(update => {
                if (!update.docChanged) return;
                clearTimeout(_debounceTimer);
                _debounceTimer = setTimeout(() => {
                    if (_view && window._notesCMDocChange) {
                        window._notesCMDocChange(_view.state.doc.toString());
                    }
                }, 300);
            }),
        ];

        _view = new EditorView({
            state: EditorState.create({ doc: content || '', extensions }),
            parent: hostEl,
        });
    },

    destroy() {
        clearTimeout(_debounceTimer);
        if (_view) { _view.destroy(); _view = null; }
    },

    getValue() {
        return _view ? _view.state.doc.toString() : '';
    },

    setValue(content) {
        if (!_view) return;
        _view.dispatch({
            changes: { from: 0, to: _view.state.doc.length, insert: content },
        });
    },

    setLanguage(lang) {
        if (!_view) return;
        _currentLanguage = lang;
        _view.dispatch({ effects: _langCompartment.reconfigure(langExtension(lang)) });
    },

    setTheme(isDark) {
        if (!_view) return;
        _view.dispatch({ effects: _themeCompartment.reconfigure(isDark ? oneDark : []) });
    },

    focusAndHighlight(query) {
        if (!_view || !query) return;
        openSearchPanel(_view);
        try {
            setSearchQuery(_view, new SearchQuery({ search: query, caseSensitive: false }));
        } catch (e) {
            // Fallback: set input value manually
            requestAnimationFrame(() => {
                const input = _view?.dom.querySelector('input[name="search"], .cm-search input[type="text"]');
                if (input) {
                    input.value = query;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.focus();
                }
            });
        }
        _view.focus();
    },

    insertAtCursor(text) {
        if (!_view) return;
        const cursor = _view.state.selection.main.head;
        _view.dispatch({
            changes: { from: cursor, insert: text },
            selection: { anchor: cursor + text.length },
        });
    },
};

document.dispatchEvent(new CustomEvent('notescmready'));
