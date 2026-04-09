// ─── DIAL CARD RENDER ────────────────────────────────────────────

function makeDialCard(dial, groupId, gi, di, opts = {}) {
    const card = document.createElement('a');
    if (dial.url) card.href = dial.url;
    card.dataset.id = dial.id;
    card.dataset.groupId = groupId;

    const isScreenshot = dial.iconType === 'custom' && dial.icon;
    const isColor = dial.iconType === 'color';

    // Shared: color gradient (applied to card background regardless of home/regular)
    if (isColor) {
        const c = dial.colors || {};
        card.style.background = [
            `radial-gradient(circle at top left,     ${c.tl     || '#4361ee'} 0%, transparent 70%)`,
            `radial-gradient(circle at top right,    ${c.tr     || '#7209b7'} 0%, transparent 70%)`,
            `radial-gradient(circle at bottom left,  ${c.bl     || '#f72585'} 0%, transparent 70%)`,
            `radial-gradient(circle at bottom right, ${c.br     || '#4cc9f0'} 0%, transparent 70%)`,
            c.center || '#1a1a2e',
        ].join(', ');
    }

    if (opts.showMeta) {
        // ── Home tab: compact card — icon/image as background, text overlaid ──
        card.className = 'dial-card dial-home-compact';

        if (!isColor && dial.iconType !== 'none') {
            const bg = document.createElement('div');
            bg.className = 'home-dial-bg';

            if (isScreenshot) {
                const img = document.createElement('img');
                img.className = 'home-dial-bg-img';
                img.alt = '';
                img.src = dial.icon;
                img.onload = () => img.classList.add('loaded');
                bg.appendChild(img);
            } else if (dial.iconType === 'emoji' || !dial.iconType) {
                const em = document.createElement('span');
                em.className = 'home-dial-bg-emoji';
                em.textContent = dial.emoji || ICONS.faviconFallback;
                bg.appendChild(em);
            } else {
                // favicon — use getFaviconCandidates directly (attachFavicon clears onload)
                const img = document.createElement('img');
                img.className = 'home-dial-bg-img home-dial-bg-favicon';
                img.alt = '';
                img.onload = () => img.classList.add('loaded');
                const _bgFallback = () => {
                    img.remove();
                    const em = document.createElement('span');
                    em.className = 'home-dial-bg-emoji';
                    em.textContent = dial.emoji || ICONS.faviconFallback;
                    bg.appendChild(em);
                };
                if (dial.icon) {
                    img.onerror = _bgFallback;
                    img.src = dial.icon;
                } else {
                    const cands = getFaviconCandidates(dial.url);
                    if (cands.length) { img.onerror = _bgFallback; img.src = cands[0]; }
                    else _bgFallback();
                }
                bg.appendChild(img);
            }
            card.appendChild(bg);
        }

        // Text overlay at bottom
        const info = document.createElement('div');
        info.className = 'home-dial-info';
        const namEl = document.createElement('div');
        namEl.className = 'dial-name';
        namEl.textContent = dial.name;
        info.appendChild(namEl);
        const metEl = document.createElement('div');
        metEl.className = 'dial-meta';
        metEl.textContent = `${opts.tabName} · ${opts.groupName}`;
        info.appendChild(metEl);
        card.appendChild(info);

        if (opts.totalVisits > 0) {
            const count = dial.visitCount || 0;
            const pct = Math.round((count / opts.totalVisits) * 100);
            const usage = document.createElement('div');
            usage.className = 'dial-usage';
            usage.textContent = `${count}× · ${pct}%`;
            card.appendChild(usage);
        }

    } else {
        // ── Regular dial tab card ─────────────────────────────────────────
        if (isColor) {
            card.className = 'dial-card dial-color';

        } else if (isScreenshot) {
            card.className = 'dial-card dial-screenshot';
            const img = document.createElement('img');
            img.className = 'dial-screenshot-img';
            img.alt = '';
            img.src = dial.icon;
            img.onload  = () => img.classList.add('loaded');
            img.onerror = () => {
                card.className = 'dial-card';
                img.remove();
                const wrap = document.createElement('div');
                wrap.className = 'dial-icon-wrap';
                wrap.innerHTML = `<span class="dial-emoji">${dial.emoji || ICONS.faviconFallback}</span>`;
                card.insertBefore(wrap, card.firstChild);
            };
            card.appendChild(img);

        } else {
            card.className = 'dial-card' + (dial.iconType === 'none' ? ' dial-no-icon' : '');
            if (dial.iconType !== 'none') {
                const iconWrap = document.createElement('div');
                iconWrap.className = 'dial-icon-wrap';
                if (dial.iconType === 'emoji' || !dial.iconType) {
                    const em = document.createElement('span');
                    em.className = 'dial-emoji';
                    em.textContent = dial.emoji || ICONS.faviconFallback;
                    iconWrap.appendChild(em);
                } else {
                    // favicon
                    const img = document.createElement('img');
                    img.alt = '';
                    img.style.cssText = 'opacity:0;transition:opacity 0.2s';
                    img.onload = () => { img.style.opacity = '1'; };
                    iconWrap.appendChild(img);
                    if (dial.icon) {
                        img.onerror = () => attachFavicon(img, dial.url, dial.emoji || ICONS.faviconFallback);
                        img.src = dial.icon;
                    } else {
                        attachFavicon(img, dial.url, dial.emoji || ICONS.faviconFallback);
                    }
                }
                card.appendChild(iconWrap);
            }
        }

        // Name label
        const name = document.createElement('div');
        name.className = 'dial-name';
        name.textContent = dial.name;
        card.appendChild(name);

        // Edit overlay + drag handle
        const overlay = document.createElement('div');
        overlay.className = 'dial-edit-overlay';
        overlay.innerHTML = `
    <div class="dial-overlay-btns">
      <button class="btn-icon" title="Move left" onclick="moveDial('${groupId}','${dial.id}',-1)">←</button>
      <button class="btn-icon" title="Edit" onclick="openDialModal('${dial.id}','${groupId}')">${ICONS.edit}</button>
      <button class="btn-icon danger" title="Delete" onclick="deleteDial('${groupId}','${dial.id}')">${ICONS.delete}</button>
      <button class="btn-icon" title="Move right" onclick="moveDial('${groupId}','${dial.id}',1)">→</button>
    </div>
  `;
        const dragHandle = document.createElement('div');
        dragHandle.className = 'dial-drag-handle-overlay';
        dragHandle.innerHTML = '⠿';
        dragHandle.title = 'Drag to reorder';
        card.draggable = editMode;
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); });
        card.appendChild(dragHandle);
        card.appendChild(overlay);
        card.addEventListener('dragstart', e => onDialDragStart(e, groupId, dial.id));
        card.addEventListener('dragover', e => onDialDragOver(e, groupId, dial.id));
        card.addEventListener('drop', e => onDialDrop(e, groupId, dial.id));
    }

    // URL tooltip on hover (non-edit mode only)
    if (dial.url) {
        card.addEventListener('mouseenter', () => {
            if (editMode) return;
            const tooltip = document.getElementById('dial-url-tooltip');
            const rect = card.getBoundingClientRect();
            tooltip.textContent = dial.url;
            const left = Math.round(rect.left + rect.width / 2 - tooltip.offsetWidth / 2);
            tooltip.style.top = Math.round(rect.bottom + 6) + 'px';
            tooltip.style.left = left + 'px';
            tooltip.classList.add('visible');
        });
        card.addEventListener('mouseleave', () => {
            document.getElementById('dial-url-tooltip').classList.remove('visible');
        });
    }

    // Click to open — let the browser handle navigation natively via <a href>
    card.addEventListener('click', e => {
        if (editMode || e.target.closest('.dial-edit-overlay') || e.target.closest('.dial-drag-handle-overlay')) {
            e.preventDefault();
            return;
        }
        trackDialVisit(dial.id);
        // Left-click → current tab (native anchor behavior)
        // Cmd/Ctrl+click → new tab (native browser behavior)
    });

    // Middle-click — let browser open in background tab natively (do not preventDefault)
    card.addEventListener('auxclick', e => {
        if (e.button !== 1) return;
        if (editMode || e.target.closest('.dial-edit-overlay') || e.target.closest('.dial-drag-handle-overlay')) {
            e.preventDefault();
            return;
        }
        trackDialVisit(dial.id);
    });

    return card;
}

function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
