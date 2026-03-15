// ─── LOGO CRASH ANIMATION ──────────────────────────────────────
function initLogoAnimation() {
    const saved = localStorage.getItem('logoAnim');
    logoAnimEnabled = saved === null ? true : saved === 'true';

    // Split logo text into individual character spans
    const logo = document.getElementById('logoText');
    if (!logo) return;
    const chars = [...logo.textContent];
    logo.innerHTML = chars.map(ch =>
        `<span class="logo-char">${ch === ' ' ? '&nbsp;' : ch.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span>`
    ).join('');

    updateAnimToggleUI();
    if (logoAnimEnabled) setTimeout(runLogoAnimation, 250);
}

function runLogoAnimation() {
    const logo = document.getElementById('logoText');
    if (!logo) return;
    const chars = [...logo.querySelectorAll('.logo-char')];

    // Calculate stop position: logo stops at right edge of last tab button
    const logoRect    = logo.getBoundingClientRect();
    const logoLeft    = logoRect.left;
    const allTabs     = [...document.querySelectorAll('.tab-btn:not(.add-tab-btn)')];
    const lastTab     = allTabs[allTabs.length - 1];
    let stopPx = window.innerWidth * 0.5; // fallback
    if (lastTab) {
        stopPx = Math.max(20, lastTab.getBoundingClientRect().right - logoLeft);
    }
    logo.style.setProperty('--stop-x', stopPx + 'px');

    // Phase 1a: drive in fast, stop above the active tab
    logo.classList.add('logo-driving');

    setTimeout(() => {
        // Freeze logo at the stop position, then remove animation
        logo.style.transform = 'translateX(' + stopPx + 'px)';
        logo.classList.remove('logo-driving');

        // Phase 1b: bow wave — letters pop forward left→right
        chars.forEach((ch, i) => {
            ch.style.animationDelay = (i * 12) + 'ms';
            ch.classList.add('logo-char-bow');
        });

        const bowEnd = (chars.length - 1) * 12 + 360;
        setTimeout(() => {
            chars.forEach(ch => {
                ch.classList.remove('logo-char-bow');
                ch.style.animationDelay = '';
            });

            // Phase 1c: continue drive to the left wall
            logo.style.transform = '';
            logo.classList.add('logo-driving-finish');

            setTimeout(() => {
                logo.classList.remove('logo-driving-finish');

                // Phase 2: impact shockwave — left letters hardest, fades rightward
                chars.forEach((ch, i) => {
                    const t = i / Math.max(chars.length - 1, 1);
                    const intensity = 1 - t * 0.72;
                    ch.style.setProperty('--bi', intensity);
                    ch.style.animationDelay = (i * 18) + 'ms';
                    ch.classList.add('logo-char-impact');
                });

                const impactEnd = (chars.length - 1) * 10;
                setTimeout(() => {
                    chars.forEach(ch => {
                        ch.classList.remove('logo-char-impact');
                        ch.style.animationDelay = '';
                        ch.style.removeProperty('--bi');
                    });

                    // Phase 3: letters vanish + sparks from each letter's position
                    const charRects = chars.map(ch => ch.getBoundingClientRect());
                    const vanishDur = 160;

                    chars.forEach((ch, i) => {
                        const charX = charRects[i].left + charRects[i].width / 2;
                        const charY = charRects[i].top  + charRects[i].height / 2;
                        const delay = i * 22;

                        ch.style.animationDelay = delay + 'ms';
                        ch.classList.add('logo-char-vanish');

                        setTimeout(() => spawnSparks(charX, charY), delay);
                    });

                    // Phase 4: assemble from random scattered positions
                    const assembleStart = (chars.length - 1) * 22 + vanishDur + 180;
                    setTimeout(() => {
                        chars.forEach((ch, i) => {
                            ch.classList.remove('logo-char-vanish');
                            const angle = Math.random() * Math.PI * 2;
                            const dist  = 80 + Math.random() * 140;
                            ch.style.setProperty('--dx', (Math.cos(angle) * dist) + 'px');
                            ch.style.setProperty('--dy', (Math.sin(angle) * dist) + 'px');
                            ch.style.setProperty('--dr', ((Math.random() - 0.5) * 720) + 'deg');
                            ch.style.animationDelay = (i * 22) + 'ms';
                            ch.classList.add('logo-char-assemble');
                        });

                        setTimeout(() => {
                            chars.forEach(ch => {
                                ch.classList.remove('logo-char-assemble');
                                ch.style.animationDelay = '';
                                ch.style.removeProperty('--dx');
                                ch.style.removeProperty('--dy');
                                ch.style.removeProperty('--dr');
                            });
                        }, 700);
                    }, assembleStart);
                }, impactEnd);
            }, 220);
        }, bowEnd);
    }, 400);
}

function spawnSparks(x, y) {
    const count = 7;
    for (let i = 0; i < count; i++) {
        const spark = document.createElement('div');
        spark.className = 'logo-spark';
        const angle = Math.random() * Math.PI * 2;
        const speed = 50 + Math.random() * 90;
        spark.style.left = x + 'px';
        spark.style.top  = y + 'px';
        spark.style.setProperty('--sx', (Math.cos(angle) * speed) + 'px');
        spark.style.setProperty('--sy', (Math.sin(angle) * speed) + 'px');
        document.body.appendChild(spark);
        setTimeout(() => spark.remove(), 550);
    }
}

function toggleLogoAnim() {
    logoAnimEnabled = !logoAnimEnabled;
    localStorage.setItem('logoAnim', logoAnimEnabled ? 'true' : 'false');
    updateAnimToggleUI();
    if (logoAnimEnabled) setTimeout(runLogoAnimation, 100);
}

function updateAnimToggleUI() {
    const toggle = document.getElementById('animToggle');
    if (!toggle) return;
    if (logoAnimEnabled) toggle.classList.add('active');
    else toggle.classList.remove('active');
}
