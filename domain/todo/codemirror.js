// ─── todo-cm.js — CodeMirror 6 bridge for todo item editor ───────
// Exposes window.TodoCM and fires 'todocmready' event when ready.

import { EditorView, keymap, lineNumbers, drawSelection } from 'https://esm.sh/@codemirror/view@6';
import { EditorState, Compartment } from 'https://esm.sh/@codemirror/state@6';
import { history, defaultKeymap, historyKeymap } from 'https://esm.sh/@codemirror/commands@6';
import { markdown } from 'https://esm.sh/@codemirror/lang-markdown@6';
import { oneDark } from 'https://esm.sh/@codemirror/theme-one-dark@6';
import { syntaxHighlighting, defaultHighlightStyle } from 'https://esm.sh/@codemirror/language@6';

const lightHighlight = syntaxHighlighting(defaultHighlightStyle, { fallback: true });

let _view = null;
const _themeCompartment = new Compartment();

window.TodoCM = {
    mount(hostEl, content, isDark, { onChange, onPaste, onDrop, onEsc } = {}) {
        if (_view) { _view.destroy(); _view = null; }

        const extensions = [
            lineNumbers(),
            history(),
            drawSelection(),
            EditorView.lineWrapping,
            markdown(),
            _themeCompartment.of(isDark ? oneDark : lightHighlight),
            keymap.of([
                ...(onEsc ? [{ key: 'Escape', run: () => { onEsc(); return true; } }] : []),
                ...defaultKeymap,
                ...historyKeymap,
            ]),
            EditorView.domEventHandlers({
                paste: (e) => {
                    const hasImage = [...(e.clipboardData?.items || [])].some(i => i.type.startsWith('image/'));
                    if (hasImage && onPaste) { onPaste(e); return true; }
                    return false;
                },
                drop: (e) => {
                    const hasImage = [...(e.dataTransfer?.files || [])].some(f => f.type.startsWith('image/'));
                    if (hasImage && onDrop) { onDrop(e); return true; }
                    return false;
                },
            }),
            EditorView.updateListener.of(update => {
                if (!update.docChanged) return;
                if (onChange) onChange(_view.state.doc.toString());
            }),
        ];

        _view = new EditorView({
            state: EditorState.create({ doc: content || '', extensions }),
            parent: hostEl,
        });

        requestAnimationFrame(() => _view?.focus());
    },


    destroy() {
        if (_view) { _view.destroy(); _view = null; }
    },

    getValue() {
        return _view ? _view.state.doc.toString() : '';
    },

    insertAtCursor(text) {
        if (!_view) return;
        const cursor = _view.state.selection.main.head;
        _view.dispatch({
            changes: { from: cursor, insert: text },
            selection: { anchor: cursor + text.length },
            scrollIntoView: true,
        });
    },

    appendText(text) {
        if (!_view) return;
        const end = _view.state.doc.length;
        _view.dispatch({
            changes: { from: end, insert: text },
            selection: { anchor: end + text.length },
            scrollIntoView: true,
        });
    },

    setTheme(isDark) {
        if (!_view) return;
        _view.dispatch({ effects: _themeCompartment.reconfigure(isDark ? oneDark : lightHighlight) });
    },
};

document.dispatchEvent(new CustomEvent('todocmready'));
