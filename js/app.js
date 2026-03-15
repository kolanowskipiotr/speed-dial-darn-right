    // ─── THEMES ─────────────────────────────────────────────────────
    const THEMES = [
        { id: 'dark-yellow',  label: 'Dark Yellow',  bg: '#0f1117', accent: '#f0a500' },
        { id: 'dark-blue',    label: 'Dark Blue',    bg: '#0d1117', accent: '#4da6ff' },
        { id: 'dark-purple',  label: 'Dark Purple',  bg: '#0f0d17', accent: '#a855f7' },
        { id: 'dark-teal',    label: 'Dark Teal',    bg: '#0d1714', accent: '#2dd4bf' },
        { id: 'light-blue',   label: 'Light Blue',   bg: '#f4f6fb', accent: '#2563eb' },
        { id: 'light-warm',   label: 'Light Warm',   bg: '#faf8f4', accent: '#d97706' },
    ];

    function applyTheme(themeId) {
        document.body.dataset.theme = themeId === 'dark-yellow' ? '' : themeId;
        localStorage.setItem('speedDial_theme', themeId);
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === themeId);
        });
    }

    function loadTheme() {
        applyTheme(localStorage.getItem('speedDial_theme') || 'dark-yellow');
    }

    function renderThemeSelector() {
        const el = document.getElementById('themeSelector');
        if (!el) return;
        el.innerHTML = '';
        THEMES.forEach(theme => {
            const btn = document.createElement('button');
            btn.className = 'theme-btn' + (
                (localStorage.getItem('speedDial_theme') || 'dark-yellow') === theme.id ? ' active' : ''
            );
            btn.dataset.theme = theme.id;
            btn.title = theme.label;
            // Diagonal split: top-left = bg, bottom-right = accent
            btn.style.background = `linear-gradient(135deg, ${theme.bg} 50%, ${theme.accent} 50%)`;
            btn.onclick = () => applyTheme(theme.id);
            el.appendChild(btn);
        });
    }

    // ─── STATE ──────────────────────────────────────────────────────
    let data = { tabs: [] };
    let activeTabId = null;
    let editingTabId = null;
    let editMode = false;
    let editingDialId = null;
    let editingGroupId = null;
    let editingDialGroupId = null;
    let currentIconSrc = 'favicon';
    let currentDialEmoji = '😀';
    let currentGroupEmoji = '📁';
    let currentTabEmoji = '🗂';
    let currentGroupSize  = 140; // px
    let selectedFaviconUrl = ''; // currently chosen favicon in the picker
    let dragSrcGroupId = null;
    let dragSrcDialId = null;
    let dragSrcTabId = null;
    let dragSrcType = null; // 'dial' | 'group'
    let pendingImageBlob = null; // image waiting to be uploaded on save
    let logoAnimEnabled = true;

    // ─── FULL CATEGORIZED EMOJI DATA ───────────────────────────────
    const EMOJI_CATEGORIES = [
        { label: '😀 Smileys & Emotion', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','🫠','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫡','🤫','🤔','🫢','🤐','🥸','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','🫨','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','☹️','😮','😯','😲','😳','🥺','🫣','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🙂‍↔️','🙂‍↕️','🫩'] },
        { label: '👋 People & Body', emojis: ['👋','🤚','🖐','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁','👅','👄','🫦','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🕴','👫','👬','👭','👨‍👩‍👦','👨‍👩‍👧','👪','🤰','🤱','👼','🎅','🤶','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','🧌','💏','💑','🫷','🫸','🫆','🧑‍🧒','🧑‍🧒‍🧒','🧑‍🧑‍🧒','🧑‍🧑‍🧒‍🧒'] },
        { label: '🐶 Animals & Nature', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🕷','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🦪','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔','🐾','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘️','🍀','🎍','🪴','🎋','🍃','🍂','🍁','🪺','🪹','🍄','🐚','🪸','🪨','🌾','💐','🌷','🌹','🥀','🪷','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌟','⭐','🌠','🌌','☀️','🌤','⛅','🌥','☁️','🌦','🌧','⛈','🌩','🌨','❄️','☃️','⛄','🌬','💨','🌀','🌈','🌂','☂️','☔','⛱','⚡','❗','🌊','🌫','🌬','🫎','🫏','🪽','🐦‍⬛','🪿','🪼','🪻','🐦‍🔥','🪾'] },
        { label: '🍎 Food & Drink', emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🧄','🧅','🥔','🍠','🫘','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','🍵','☕','🫖','🍺','🍻','🥂','🍷','🫗','🥃','🍸','🍹','🧉','🍾','🧊','🥄','🍴','🍽','🥢','🧂','🫚','🫛','🍋‍🟩','🍄‍🟫','🫜'] },
        { label: '✈️ Travel & Places', emojis: ['🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍','🛵','🛺','🚲','🛴','🛹','🛼','🚏','🛣','🛤','⛽','🛞','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🚤','🛥','🛳','⛴','🚢','✈️','🛩','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛸','🚀','🛶','🏖','🏔','⛰','🌋','🗻','🏕','🏗','🧱','🪨','🪵','🛖','🏘','🏚','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩','🕋','⛲','⛺','🌁','🌃','🏙','🌄','🌅','🌆','🌇','🌉','🗺','🧭','🌐','🗾','🏔','🌏','🌍','🌎','🪐','💫','⭐','🌟','✨','⚡','☄️','🌞','🌝','🌙','🌛','🌜','🌚'] },
        { label: '⚽ Activities', emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏑','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸','🥌','🎿','⛷','🏂','🪂','🏋','🤼','🤸','⛹','🤺','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖','🏵','🎗','🎫','🎟','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🪘','🥁','🪗','🎷','🎺','🎸','🪕','🎻','🎲','♟','🎯','🎳','🎮','🎰','🧩','🪄','🃏','🀄','🎴'] },
        { label: '💡 Objects', emojis: ['📱','💻','🖥','🖨','⌨️','🖱','🖲','💽','💾','💿','📀','📷','📸','📹','🎥','📽','🎞','📞','☎️','📟','📠','📺','📻','🧭','⏱','⏰','⏲','⏳','📡','🔋','🪫','🔌','💡','🔦','🕯','🪔','🧱','🪞','🪟','🛏','🛋','🪑','🚽','🪠','🚿','🛁','🪤','🧴','🧷','🧹','🧺','🧻','🪣','🧼','🫧','🪥','🧽','🪒','🧴','🧰','🪛','🔧','🔨','⚒','🛠','⛏','🪚','🔩','🪤','🧲','💣','🪓','🔪','🗡','⚔️','🛡','🪃','🪝','🧲','🪜','🧪','🧫','🧬','🔭','🔬','🩻','🩺','💊','💉','🩸','🩹','🩼','🩻','🏥','🪤','🧸','🪅','🪆','🖼','🪞','📦','📫','📪','📬','📭','📮','📯','📜','📋','📁','📂','🗂','📅','📆','📇','📈','📉','📊','📋','📌','📍','📎','🖇','📏','📐','✂️','🗃','🗄','🗑','🔒','🔓','🔏','🔐','🔑','🗝','🔨','🪓','⛏','⚒','🛠','🗜','⚙️','🗡','⚔️','🛡','🪃','🏹','🪚','🔧','🪛','🔩','🪤','🧲','🪜','🪭','🪮','🪇','🪈','⛓️‍💥','🪉','🪏'] },
        { label: '💬 Symbols', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈹','🚺','🚹','🚼','⚧','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','▶️','⏸','⏹','⏺','⏭','⏮','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↩️','↪️','⤴️','⤵️','🔀','🔁','🔂','🔃','🎵','🎶','➕','➖','➗','✖️','💲','💱','™️','©️','®️','〰️','➰','➿','🔚','🔙','🔛','🔜','🔝','✔️','☑️','🔘','🔲','🔳','▪️','▫️','◾','◽','◼️','◻️','⬛','⬜','🟥','🟧','🟨','🟩','🟦','🟪','🟫','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🪯','🛜','🩷','🩵','🩶','🫟'] },
        { label: '🏁 Flags', emojis: ['🏳️','🏴','🏴‍☠️','🚩','🏁','🎌','🏳️‍🌈','🏳️‍⚧️','🇺🇳','🇦🇫','🇦🇱','🇩🇿','🇦🇩','🇦🇴','🇦🇮','🇦🇬','🇦🇷','🇦🇲','🇦🇼','🇦🇺','🇦🇹','🇦🇿','🇧🇸','🇧🇭','🇧🇩','🇧🇧','🇧🇾','🇧🇪','🇧🇿','🇧🇯','🇧🇲','🇧🇹','🇧🇴','🇧🇦','🇧🇼','🇧🇷','🇻🇬','🇧🇳','🇧🇬','🇧🇫','🇧🇮','🇰🇭','🇨🇲','🇨🇦','🇨🇻','🇧🇶','🇰🇾','🇨🇫','🇹🇩','🇨🇱','🇨🇳','🇨🇴','🇰🇲','🇨🇬','🇨🇩','🇨🇷','🇨🇮','🇭🇷','🇨🇺','🇨🇼','🇨🇾','🇨🇿','🇩🇰','🇩🇯','🇩🇲','🇩🇴','🇪🇨','🇪🇬','🇸🇻','🇬🇶','🇪🇷','🇪🇪','🇸🇿','🇪🇹','🇫🇰','🇫🇴','🇫🇯','🇫🇮','🇫🇷','🇬🇫','🇵🇫','🇬🇦','🇬🇲','🇬🇪','🇩🇪','🇬🇭','🇬🇮','🇬🇷','🇬🇱','🇬🇩','🇬🇵','🇬🇺','🇬🇹','🇬🇬','🇬🇳','🇬🇼','🇬🇾','🇭🇹','🇭🇳','🇭🇰','🇭🇺','🇮🇸','🇮🇳','🇮🇩','🇮🇷','🇮🇶','🇮🇪','🇮🇲','🇮🇱','🇮🇹','🇯🇲','🇯🇵','🇯🇪','🇯🇴','🇰🇿','🇰🇪','🇰🇮','🇽🇰','🇰🇼','🇰🇬','🇱🇦','🇱🇻','🇱🇧','🇱🇸','🇱🇷','🇱🇾','🇱🇮','🇱🇹','🇱🇺','🇲🇴','🇲🇬','🇲🇼','🇲🇾','🇲🇻','🇲🇱','🇲🇹','🇲🇭','🇲🇶','🇲🇷','🇲🇺','🇾🇹','🇲🇽','🇫🇲','🇲🇩','🇲🇨','🇲🇳','🇲🇪','🇲🇸','🇲🇦','🇲🇿','🇲🇲','🇳🇦','🇳🇷','🇳🇵','🇳🇱','🇳🇨','🇳🇿','🇳🇮','🇳🇪','🇳🇬','🇳🇺','🇳🇫','🇲🇰','🇲🇵','🇳🇴','🇴🇲','🇵🇰','🇵🇼','🇵🇸','🇵🇦','🇵🇬','🇵🇾','🇵🇪','🇵🇭','🇵🇳','🇵🇱','🇵🇹','🇵🇷','🇶🇦','🇷🇪','🇷🇴','🇷🇺','🇷🇼','🇰🇳','🇱🇨','🇻🇨','🇼🇸','🇸🇲','🇸🇹','🇸🇦','🇸🇳','🇷🇸','🇸🇨','🇸🇱','🇸🇬','🇸🇽','🇸🇰','🇸🇮','🇸🇧','🇸🇴','🇿🇦','🇬🇸','🇸🇸','🇪🇸','🇱🇰','🇸🇩','🇸🇷','🇸🇪','🇨🇭','🇸🇾','🇹🇼','🇹🇯','🇹🇿','🇹🇭','🇹🇱','🇹🇬','🇹🇰','🇹🇴','🇹🇹','🇹🇳','🇹🇷','🇹🇲','🇹🇨','🇹🇻','🇺🇬','🇺🇦','🇦🇪','🇬🇧','🏴󠁧󠁢󠁥󠁮󠁧󠁿','🏴󠁧󠁢󠁳󠁣󠁴󠁿','🏴󠁧󠁢󠁷󠁬󠁳󠁿','🇺🇸','🇻🇮','🇺🇾','🇺🇿','🇻🇺','🇻🇦','🇻🇪','🇻🇳','🇼🇫','🇾🇪','🇿🇲','🇿🇼','🇨🇶'] },
    ];

    // Flat list for random picking (all emojis except flags)
    const EMOJI_LIST = EMOJI_CATEGORIES.slice(0, -1).flatMap(c => c.emojis);
    const GROUP_EMOJIS = ['📁','💼','🌐','⭐','🔖','🏠','🎯','🚀','🎮','💡','📚','🛍','🎵','🎬','✈️','🌍','🔥','💎','⚡','🧩','🏆','❤️','🍀','🔐','🗂','📊','📱','💻','🌙','🌈','🎨','🧪','🦋','🌻','🐉','🪼','🐦‍🔥','🩷','🛜'];

    // ─── DATA PERSISTENCE ──────────────────────────────────────────
    function loadData() {
        try {
            const raw = localStorage.getItem('speedDial_v2');
            if (raw) data = JSON.parse(raw);
        } catch(e) { data = { tabs: [] }; }

        // Migrate old format: { groups: [...] } → { tabs: [{ id, name, groups }] }
        if (data.groups && !data.tabs) {
            data = { tabs: [{ id: uid(), name: 'Home', groups: data.groups }] };
            saveData();
        }
        if (!data.tabs) data = { tabs: [] };
        if (!data.tabs.length) {
            data.tabs.push({ id: uid(), name: 'Home', groups: [] });
            saveData();
        }
        activeTabId = data.tabs[0].id;
    }

    function getActiveTab() {
        return data.tabs.find(t => t.id === activeTabId) || data.tabs[0];
    }

    function saveData() {
        localStorage.setItem('speedDial_v2', JSON.stringify(data));
    }

    // ─── UTILS ─────────────────────────────────────────────────────
    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // Resize image file/blob to exactly 400×300 (cover crop), returns JPEG blob
    function resizeImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objUrl = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(objUrl);
                const W = 400, H = 300;
                const scale = Math.max(W / img.width, H / img.height);
                const sw = img.width * scale, sh = img.height * scale;
                const canvas = document.createElement('canvas');
                canvas.width = W; canvas.height = H;
                canvas.getContext('2d').drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
                canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', 0.85);
            };
            img.onerror = reject;
            img.src = objUrl;
        });
    }

    async function uploadDialImage(id, blob) {
        const res = await fetch(`/api/upload/${id}`, { method: 'POST', body: blob });
        if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    }

    function deleteDialImage(id) {
        return fetch(`/api/upload/${id}`, { method: 'DELETE' });
    }

    function handleDropZonePaste(e) {
        e.preventDefault();
        // clear any stray text nodes contenteditable may have allowed in
        const zone = document.getElementById('imgDropZone');
        // strip any text nodes while keeping element children
        [...zone.childNodes].forEach(n => { if (n.nodeType === Node.TEXT_NODE) n.remove(); });

        const imageItem = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
        if (!imageItem) { showToast('⚠️ No image in clipboard'); return; }
        handleImageFile(imageItem.getAsFile());
    }

    function handleImageFile(file) {
        if (!file) return;
        document.getElementById('dialCustomIcon').value = '';
        const customPreview = document.getElementById('customIconPreview');
        if (customPreview) customPreview.style.display = 'none';
        const status = document.getElementById('imgUploadStatus');
        const preview = document.getElementById('imgUploadPreview');
        status.textContent = '⏳ Resizing…';
        preview.style.display = 'none';
        resizeImage(file).then(blob => {
            pendingImageBlob = blob;
            const img = document.createElement('img');
            img.src = URL.createObjectURL(blob);
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            preview.innerHTML = '';
            preview.appendChild(img);
            preview.style.display = 'block';
            status.textContent = '✅ Ready — will upload on Save';
        }).catch(() => {
            status.textContent = '❌ Could not process image';
        });
    }

    function pickRandomEmoji(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function getDomain(url) {
        try {
            return new URL(url).hostname;
        } catch { return ''; }
    }

    // Returns ordered favicon URL candidates for a domain
    function getFaviconCandidates(url) {
        const domain = getDomain(url);
        if (!domain) return [];
        const bare = domain.replace(/^www\./, '');
        return [
            `https://icons.duckduckgo.com/ip3/${domain}.ico`,
            `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
            `https://${domain}/favicon.ico`,
            `https://${domain}/apple-touch-icon.png`,
            `https://${bare}/favicon.ico`,
        ];
    }

    // Directly chain onerror on the DOM img element through each candidate
    function attachFavicon(imgEl, dialUrl, fallbackEmoji) {
        const candidates = getFaviconCandidates(dialUrl);
        if (!candidates.length) { showEmojiInstead(imgEl, fallbackEmoji); return; }
        let idx = 0;
        function tryNext() {
            if (!document.body.contains(imgEl)) return;
            if (idx >= candidates.length) { showEmojiInstead(imgEl, fallbackEmoji); return; }
            imgEl.onerror = () => { imgEl.onerror = null; imgEl.onload = null; tryNext(); };
            imgEl.onload = null;
            imgEl.src = candidates[idx++];
        }
        tryNext();
    }

    function showEmojiInstead(imgEl, emoji) {
        const wrap = imgEl.parentElement;
        if (wrap) wrap.innerHTML = `<span class="dial-emoji">${emoji || '🌐'}</span>`;
    }

    let toastTimer = null;

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.innerHTML = `<span>${msg}</span>`;
        t.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
    }

    function showToastUndo(msg, backup) {
        const t = document.getElementById('toast');
        t.innerHTML = `<span>${msg}</span><button class="toast-undo" onclick="undoDelete('${encodeURIComponent(backup)}')">Undo</button>`;
        t.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
    }

    function undoDelete(encodedBackup) {
        try {
            data = JSON.parse(decodeURIComponent(encodedBackup));
            saveData(); render();
            showToast('↩️ Restored');
        } catch(e) { showToast('❌ Could not undo'); }
    }

    // ─── RENDER ────────────────────────────────────────────────────
    function renderTabs() {
        const bar = document.getElementById('tabsBar');
        bar.innerHTML = '';
        let tabDragSrc = null;

        data.tabs.forEach(tab => {
            const btn = document.createElement('button');
            btn.dataset.tabId = tab.id;
            btn.className = 'tab-btn' + (tab.id === activeTabId ? ' active' : '');
            btn.innerHTML = `${tab.emoji ? `<span>${tab.emoji}</span>` : ''}<span>${tab.name}</span>`;
            btn.onclick = () => { activeTabId = tab.id; render(); };

            // Edit button
            const editBtn = document.createElement('button');
            editBtn.className = 'tab-edit-btn';
            editBtn.title = 'Edit / delete tab';
            editBtn.textContent = '✏️';
            editBtn.onclick = (e) => { e.stopPropagation(); openTabModal(tab.id); };
            btn.appendChild(editBtn);

            // Drag to reorder tabs (edit mode only)
            btn.draggable = editMode;
            btn.addEventListener('dragstart', e => {
                if (!editMode) { e.preventDefault(); return; }
                tabDragSrc = tab.id;
                e.dataTransfer.effectAllowed = 'move';
                btn.classList.add('dragging');
            });
            btn.addEventListener('dragend', () => btn.classList.remove('dragging'));
            btn.addEventListener('dragenter', e => {
                // dragstart fires before dragenter, so dragSrcType is already set here
                if (dragSrcType === 'dial' && tab.id !== activeTabId) { btn.classList.add('dial-drag-over'); }
            });
            btn.addEventListener('dragover', e => {
                if (tabDragSrc && tabDragSrc !== tab.id) {
                    e.preventDefault();
                    const rect = btn.getBoundingClientRect();
                    btn.classList.toggle('drop-before', e.clientX < rect.left + rect.width / 2);
                    btn.classList.toggle('drop-after',  e.clientX >= rect.left + rect.width / 2);
                    return;
                }
                // Always accept on a different tab — drop handler guards logic
                if (tab.id !== activeTabId) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragSrcType === 'dial') btn.classList.add('dial-drag-over');
                }
            });
            btn.addEventListener('dragleave', e => {
                if (btn.contains(e.relatedTarget)) return;
                btn.classList.remove('drop-before', 'drop-after', 'dial-drag-over');
            });
            btn.addEventListener('drop', e => {
                btn.classList.remove('drop-before', 'drop-after', 'dial-drag-over');
                // Tab reorder
                if (tabDragSrc && tabDragSrc !== tab.id) {
                    e.preventDefault();
                    const srcIdx = data.tabs.findIndex(t => t.id === tabDragSrc);
                    let tgtIdx = data.tabs.findIndex(t => t.id === tab.id);
                    if (srcIdx === -1 || tgtIdx === -1) return;
                    const rect = btn.getBoundingClientRect();
                    const insertAfter = e.clientX >= rect.left + rect.width / 2;
                    const [moved] = data.tabs.splice(srcIdx, 1);
                    tgtIdx = data.tabs.findIndex(t => t.id === tab.id);
                    data.tabs.splice(insertAfter ? tgtIdx + 1 : tgtIdx, 0, moved);
                    tabDragSrc = null;
                    saveData(); renderTabs();
                    return;
                }
                // Dial dropped onto a different tab → move to first group, first position
                if (dragSrcType === 'dial' && tab.id !== activeTabId) {
                    e.preventDefault();
                    e.stopPropagation();
                    const srcTab = data.tabs.find(t => t.id === dragSrcTabId);
                    const tgtTab = data.tabs.find(t => t.id === tab.id);
                    if (!srcTab || !tgtTab || !tgtTab.groups.length) return;
                    const srcGroup = srcTab.groups.find(g => g.id === dragSrcGroupId);
                    if (!srcGroup) return;
                    const srcIdx = srcGroup.dials.findIndex(d => d.id === dragSrcDialId);
                    if (srcIdx === -1) return;
                    const [dial] = srcGroup.dials.splice(srcIdx, 1);
                    tgtTab.groups[0].dials.unshift(dial); // first group, first position
                    activeTabId = tab.id;
                    saveData(); render(); resetHoverAfterDrag();
                    // Glow + shake the placed dial
                    requestAnimationFrame(() => {
                        const card = document.querySelector(`.dial-card[data-id="${dial.id}"]`);
                        if (card) {
                            card.classList.add('dial-just-dropped');
                            card.addEventListener('animationend', () => card.classList.remove('dial-just-dropped'), { once: true });
                        }
                    });
                }
            });

            bar.appendChild(btn);
        });

        // Add tab button
        const addBtn = document.createElement('button');
        addBtn.className = 'tab-btn add-tab-btn';
        addBtn.innerHTML = '＋ Tab';
        addBtn.onclick = () => openTabModal(null);
        bar.appendChild(addBtn);

        // Inline group jump chips
        const activeTab = data.tabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.groups && activeTab.groups.length > 0) {
            const sep = document.createElement('div');
            sep.className = 'tabs-groups-sep';
            bar.appendChild(sep);

            activeTab.groups.forEach(group => {
                const chip = document.createElement('button');
                chip.className = 'group-jump-chip';
                chip.innerHTML = `${group.emoji ? `<span>${group.emoji}</span>` : ''}<span>${group.name}</span>`;
                chip.title = `Jump to ${group.name}`;
                chip.onclick = () => {
                    const el = document.querySelector(`.group[data-id="${group.id}"]`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                };
                bar.appendChild(chip);
            });
        }
    }

    function render() {
        renderTabs();
        updateDialCount();
        const container = document.getElementById('groupsContainer');
        const empty = document.getElementById('emptyState');
        container.innerHTML = '';

        const tab = getActiveTab();
        const groups = tab ? tab.groups : [];

        document.getElementById('addGroupBtn').style.display = '';  // let CSS control via body.edit-mode

        if (!groups.length) {
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        groups.forEach((group, gi) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'group';
            groupEl.dataset.id = group.id;
            groupEl.draggable = false;

            // Group header
            const header = document.createElement('div');
            header.className = 'group-header';

            const handle = document.createElement('div');
            handle.className = 'group-drag-handle';
            handle.innerHTML = '⠿';
            handle.title = 'Drag to reorder group';
            handle.addEventListener('mousedown', () => { groupEl.draggable = true; });
            handle.addEventListener('touchstart', () => { groupEl.draggable = true; }, {passive:true});
            groupEl.addEventListener('dragend', () => { groupEl.draggable = false; });

            const nameSpan = document.createElement('span');
            nameSpan.className = 'group-name';
            nameSpan.textContent = group.name;

            header.appendChild(handle);
            if (group.emoji) {
                const emojiSpan = document.createElement('span');
                emojiSpan.className = 'group-emoji';
                emojiSpan.textContent = group.emoji;
                header.appendChild(emojiSpan);
            }
            header.appendChild(nameSpan);

            const line = document.createElement('div');
            line.className = 'group-header-line';
            header.appendChild(line);

            // Group controls
            const controls = document.createElement('div');
            controls.className = 'group-edit-controls';
            controls.innerHTML = `
      <button class="btn-icon" title="Move up" onclick="moveGroup('${group.id}', -1)">↑</button>
      <button class="btn-icon" title="Move down" onclick="moveGroup('${group.id}', 1)">↓</button>
      <button class="btn-icon" title="Edit group" onclick="openGroupModal('${group.id}')">✏️</button>
      <button class="btn-icon danger" title="Delete group" onclick="deleteGroup('${group.id}')">🗑</button>
    `;
            header.appendChild(controls);
            groupEl.appendChild(header);

            // Dials grid
            const grid = document.createElement('div');
            grid.className = 'dials-grid';
            grid.dataset.groupId = group.id;
            grid.style.setProperty('--dial-size', (group.dialSize || 140) + 'px');

            group.dials.forEach((dial, di) => {
                grid.appendChild(makeDialCard(dial, group.id, gi, di));
            });

            // Add dial button
            const addBtn = document.createElement('div');
            addBtn.className = 'dial-card add-dial-btn';
            addBtn.innerHTML = `<span class="add-icon">＋</span><span class="add-label">Add Dial</span>`;
            addBtn.onclick = () => openDialModal(null, group.id);
            grid.appendChild(addBtn);

            // Accept dial drops on the grid itself (empty groups or empty area)
            grid.addEventListener('dragover', e => {
                if (dragSrcType !== 'dial') return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                grid.classList.add('dial-drag-over');
            });
            grid.addEventListener('dragleave', e => {
                if (!grid.contains(e.relatedTarget)) grid.classList.remove('dial-drag-over');
            });
            grid.addEventListener('drop', e => {
                if (dragSrcType !== 'dial') return;
                e.preventDefault();
                e.stopPropagation();
                grid.classList.remove('dial-drag-over');
                clearDropIndicators();
                onDialDropOnGroup(group.id);
            });

            groupEl.appendChild(grid);

            // Group drag events
            groupEl.addEventListener('dragstart', e => onGroupDragStart(e, group.id));
            groupEl.addEventListener('dragover', e => onGroupDragOver(e, group.id));
            groupEl.addEventListener('drop', e => onGroupDrop(e, group.id));
            groupEl.addEventListener('dragleave', e => groupEl.classList.remove('drag-over'));

            container.appendChild(groupEl);
        });
    }

    function makeDialCard(dial, groupId, gi, di) {
        const card = document.createElement('div');
        card.dataset.id = dial.id;
        card.dataset.groupId = groupId;

        const isScreenshot = dial.iconType === 'custom' && dial.icon;

        if (isScreenshot) {
            // ── Full-bleed screenshot card ────────────────────────────────
            card.className = 'dial-card dial-screenshot';

            const img = document.createElement('img');
            img.className = 'dial-screenshot-img';
            img.alt = '';
            img.src = dial.icon;
            img.onload  = () => img.classList.add('loaded');
            img.onerror = () => {
                // fallback to emoji if screenshot image fails
                card.className = 'dial-card';
                img.remove();
                const wrap = document.createElement('div');
                wrap.className = 'dial-icon-wrap';
                wrap.innerHTML = `<span class="dial-emoji">${dial.emoji || '🌐'}</span>`;
                card.insertBefore(wrap, card.firstChild);
            };
            card.appendChild(img);

        } else {
            // ── Standard card (emoji / favicon / none) ───────────────────
            card.className = 'dial-card' + (dial.iconType === 'none' ? ' dial-no-icon' : '');

            if (dial.iconType !== 'none') {
                const iconWrap = document.createElement('div');
                iconWrap.className = 'dial-icon-wrap';

                if (dial.iconType === 'emoji' || !dial.iconType) {
                    const em = document.createElement('span');
                    em.className = 'dial-emoji';
                    em.textContent = dial.emoji || '🌐';
                    iconWrap.appendChild(em);
                } else {
                    // favicon
                    const img = document.createElement('img');
                    img.alt = '';
                    img.style.cssText = 'opacity:0;transition:opacity 0.2s';
                    img.onload = () => { img.style.opacity = '1'; };
                    iconWrap.appendChild(img);
                    if (dial.icon) {
                        img.onerror = () => attachFavicon(img, dial.url, dial.emoji || '🌐');
                        img.src = dial.icon;
                    } else {
                        attachFavicon(img, dial.url, dial.emoji || '🌐');
                    }
                }
                card.appendChild(iconWrap);
            }
        }

        // Name label (both types)
        const name = document.createElement('div');
        name.className = 'dial-name';
        name.textContent = dial.name;
        card.appendChild(name);

        // Edit overlay
        const overlay = document.createElement('div');
        overlay.className = 'dial-edit-overlay';
        overlay.innerHTML = `
    <div class="dial-overlay-btns">
      <button class="btn-icon" title="Move left" onclick="moveDial('${groupId}','${dial.id}',-1)">←</button>
      <button class="btn-icon" title="Edit" onclick="openDialModal('${dial.id}','${groupId}')">✏️</button>
      <button class="btn-icon danger" title="Delete" onclick="deleteDial('${groupId}','${dial.id}')">🗑</button>
      <button class="btn-icon" title="Move right" onclick="moveDial('${groupId}','${dial.id}',1)">→</button>
    </div>
  `;

        // Drag handle overlay
        const dragHandle = document.createElement('div');
        dragHandle.className = 'dial-drag-handle-overlay';
        dragHandle.innerHTML = '⠿';
        dragHandle.title = 'Drag to reorder';
        // Set draggable immediately if already in edit mode; keep in sync via toggleEditMode
        card.draggable = editMode;
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); });

        card.appendChild(dragHandle);
        card.appendChild(overlay);

        // Click to open (only in non-edit mode)
        card.addEventListener('click', e => {
            if (editMode) return;
            if (e.target.closest('.dial-edit-overlay') || e.target.closest('.dial-drag-handle-overlay')) return;
            window.open(dial.url, '_blank');
        });

        // Dial drag events
        card.addEventListener('dragstart', e => onDialDragStart(e, groupId, dial.id));
        card.addEventListener('dragover', e => onDialDragOver(e, groupId, dial.id));
        card.addEventListener('drop', e => onDialDrop(e, groupId, dial.id));

        return card;
    }

    function escHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ─── DRAG & DROP: DIALS ─────────────────────────────────────────
    function clearDropIndicators() {
        document.querySelectorAll('.drop-before, .drop-after').forEach(el => {
            el.classList.remove('drop-before', 'drop-after');
        });
        document.querySelectorAll('.dials-grid.dial-drag-over').forEach(el => {
            el.classList.remove('dial-drag-over');
        });
    }

    function onDialDragStart(e, groupId, dialId) {
        e.stopPropagation(); // prevent group dragstart handler from cancelling this
        dragSrcType = 'dial';
        dragSrcGroupId = groupId;
        dragSrcDialId = dialId;
        dragSrcTabId = activeTabId;
        e.dataTransfer.effectAllowed = 'move';
        const card = e.currentTarget;
        card.classList.add('dragging');

    }

    function onDialDragOver(e, groupId, dialId) {
        if (dragSrcType !== 'dial') return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        clearDropIndicators();
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        card.classList.add(e.clientX < rect.left + rect.width / 2 ? 'drop-before' : 'drop-after');
    }

    function onDialDrop(e, targetGroupId, targetDialId) {
        if (dragSrcType !== 'dial') return;
        e.preventDefault();
        e.stopPropagation();
        clearDropIndicators();

        const srcTab = data.tabs.find(t => t.id === dragSrcTabId);
        const tgtTab = getActiveTab();
        if (!srcTab || !tgtTab) return;

        const srcGroup = srcTab.groups.find(g => g.id === dragSrcGroupId);
        const tgtGroup = tgtTab.groups.find(g => g.id === targetGroupId);
        if (!srcGroup || !tgtGroup) return;

        const srcIdx = srcGroup.dials.findIndex(d => d.id === dragSrcDialId);
        if (srcIdx === -1) return;

        // Determine insert position from mouse location relative to target card
        const rect = e.currentTarget.getBoundingClientRect();
        const insertAfter = e.clientX >= rect.left + rect.width / 2;

        let tgtIdx = tgtGroup.dials.findIndex(d => d.id === targetDialId);

        // For same-group drops, removing src shifts later indices down by 1
        if (srcGroup === tgtGroup && tgtIdx !== -1 && srcIdx < tgtIdx) tgtIdx--;

        const finalIdx = tgtIdx === -1 ? tgtGroup.dials.length : (insertAfter ? tgtIdx + 1 : tgtIdx);
        // No-op: same group, same resulting position
        if (srcGroup === tgtGroup && srcIdx === finalIdx) return;

        const [dial] = srcGroup.dials.splice(srcIdx, 1);
        tgtGroup.dials.splice(tgtIdx === -1 ? tgtGroup.dials.length : (insertAfter ? tgtIdx + 1 : tgtIdx), 0, dial);

        saveData(); render(); resetHoverAfterDrag();
    }

    function onDialDropOnGroup(targetGroupId) {
        const srcTab = data.tabs.find(t => t.id === dragSrcTabId);
        const tgtTab = getActiveTab();
        if (!srcTab || !tgtTab) return;

        const srcGroup = srcTab.groups.find(g => g.id === dragSrcGroupId);
        const tgtGroup = tgtTab.groups.find(g => g.id === targetGroupId);
        if (!srcGroup || !tgtGroup) return;

        const srcIdx = srcGroup.dials.findIndex(d => d.id === dragSrcDialId);
        if (srcIdx === -1) return;

        // No-op: already first item in the same group
        if (srcGroup === tgtGroup && srcIdx === 0) return;

        const [dial] = srcGroup.dials.splice(srcIdx, 1);
        tgtGroup.dials.unshift(dial);
        saveData(); render(); resetHoverAfterDrag();
    }

    function resetHoverAfterDrag() {
        document.body.classList.add('post-drag');
        setTimeout(() => document.body.classList.remove('post-drag'), 300);
    }

    // ─── DRAG & DROP: GROUPS ────────────────────────────────────────
    function onGroupDragStart(e, groupId) {
        if (!e.currentTarget.draggable) { e.preventDefault(); return; }
        dragSrcType = 'group';
        dragSrcGroupId = groupId;
        e.dataTransfer.effectAllowed = 'move';
    }

    function onGroupDragOver(e, groupId) {
        if (dragSrcType === 'group') {
            if (groupId === dragSrcGroupId) return;
            e.preventDefault();
            e.currentTarget.classList.add('drag-over');
        } else if (dragSrcType === 'dial') {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    }

    function onGroupDrop(e, targetGroupId) {
        e.currentTarget.classList.remove('drag-over');
        if (dragSrcType === 'group') {
            e.preventDefault();
            if (dragSrcGroupId === targetGroupId) return;
            const groups = getActiveTab().groups;
            const srcIdx = groups.findIndex(g => g.id === dragSrcGroupId);
            const tgtIdx = groups.findIndex(g => g.id === targetGroupId);
            if (srcIdx === -1 || tgtIdx === -1) return;
            const [g] = groups.splice(srcIdx, 1);
            groups.splice(tgtIdx, 0, g);
            saveData(); render();
        } else if (dragSrcType === 'dial') {
            e.preventDefault();
            clearDropIndicators();
            onDialDropOnGroup(targetGroupId);
        }
    }

    // ─── EDIT MODE ─────────────────────────────────────────────────
    function toggleEditMode() {
        editMode = !editMode;
        document.body.classList.toggle('edit-mode', editMode);
        const toggle = document.getElementById('editToggle');
        toggle.classList.toggle('active', editMode);
        document.getElementById('editLabel').textContent = editMode ? 'Editing' : 'Edit';
        // Keep all dial cards draggable in sync with edit mode
        document.querySelectorAll('.dial-card:not(.add-dial-btn)').forEach(c => {
            c.draggable = editMode;
        });
        renderTabs();
    }


    // ─── TAB CRUD ───────────────────────────────────────────────────
    function openTabModal(tabId = null) {
        editingTabId = tabId;
        document.getElementById('tabModalTitle').textContent = tabId ? 'Edit Tab' : 'Add Tab';
        document.getElementById('tabDeleteBtn').style.display = tabId ? '' : 'none';
        const tab = tabId ? data.tabs.find(t => t.id === tabId) : null;
        document.getElementById('tabName').value = tab ? tab.name : '';
        currentTabEmoji = tab ? (tab.emoji !== undefined ? tab.emoji : '🗂') : '🗂';
        const tabPreview = document.getElementById('tabEmojiPreview');
        const tabNoIconBtn = document.getElementById('tabNoIconBtn');
        if (currentTabEmoji === '') {
            tabPreview.textContent = '—';
            tabPreview.classList.add('emoji-preview-none');
            tabNoIconBtn.classList.add('active');
        } else {
            tabPreview.textContent = currentTabEmoji;
            tabPreview.classList.remove('emoji-preview-none');
            tabNoIconBtn.classList.remove('active');
        }
        openModal('tabModal');
    }

    function saveTab() {
        const name = document.getElementById('tabName').value.trim();
        if (!name) { showToast('⚠️ Please enter a tab name'); return; }

        if (editingTabId) {
            const t = data.tabs.find(t => t.id === editingTabId);
            if (t) { t.name = name; t.emoji = currentTabEmoji; }
        } else {
            const newTab = { id: uid(), name, emoji: currentTabEmoji, groups: [] };
            data.tabs.push(newTab);
            activeTabId = newTab.id;
        }
        saveData(); render();
        closeModal('tabModal');
    }

    function deleteTab(tabId) {
        if (data.tabs.length <= 1) { showToast('⚠️ Cannot delete the last tab'); return; }
        const t = data.tabs.find(t => t.id === tabId);
        if (!t) return;
        showConfirm(
            '🗑 Delete tab?',
            `"${t.name}" and all its groups and dials will be removed.`,
            () => {
                const backup = JSON.stringify(data);
                data.tabs = data.tabs.filter(tab => tab.id !== tabId);
                if (activeTabId === tabId) activeTabId = data.tabs[0].id;
                saveData(); render();
                showToastUndo(`🗑 Tab "${t.name}" deleted`, backup);
            }
        );
    }

    // ─── GROUP CRUD ─────────────────────────────────────────────────
    function setGroupSize(px) {
        currentGroupSize = px;
        const slider = document.getElementById('groupSizeSlider');
        const label  = document.getElementById('groupSizeValue');
        if (slider) slider.value = px;
        if (label)  label.textContent = px + 'px';
    }

    function openGroupModal(groupId = null) {
        editingGroupId = groupId;
        const isEdit = !!groupId;
        document.getElementById('groupModalTitle').textContent = isEdit ? 'Edit Group' : 'Add Group';
        if (isEdit) {
            const g = getActiveTab().groups.find(g => g.id === groupId);
            document.getElementById('groupName').value = g.name;
            currentGroupEmoji = g.emoji !== undefined ? g.emoji : pickRandomEmoji(GROUP_EMOJIS);
            setGroupSize(g.dialSize || 140);
        } else {
            document.getElementById('groupName').value = '';
            currentGroupEmoji = pickRandomEmoji(GROUP_EMOJIS);
            setGroupSize(140);
        }
        const groupPreview = document.getElementById('groupEmojiPreview');
        const groupNoIconBtn = document.getElementById('groupNoIconBtn');
        if (currentGroupEmoji === '') {
            groupPreview.textContent = '—';
            groupPreview.classList.add('emoji-preview-none');
            groupNoIconBtn.classList.add('active');
        } else {
            groupPreview.textContent = currentGroupEmoji;
            groupPreview.classList.remove('emoji-preview-none');
            groupNoIconBtn.classList.remove('active');
        }
        document.getElementById('groupEmojiPicker').classList.remove('open');
        openModal('groupModal');
    }

    function saveGroup() {
        const name = document.getElementById('groupName').value.trim();
        if (!name) { showToast('⚠️ Please enter a group name'); return; }

        if (editingGroupId) {
            const g = getActiveTab().groups.find(g => g.id === editingGroupId);
            if (g) { g.name = name; g.emoji = currentGroupEmoji; g.dialSize = currentGroupSize; }
        } else {
            getActiveTab().groups.push({ id: uid(), name, emoji: currentGroupEmoji, dialSize: currentGroupSize, dials: [] });
        }

        saveData(); render();
        closeModal('groupModal');
    }

    function showConfirm(title, message, onConfirm) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        const btn = document.getElementById('confirmOkBtn');
        btn.onclick = () => { closeModal('confirmModal'); onConfirm(); };
        openModal('confirmModal');
    }

    function deleteGroup(groupId) {
        const g = getActiveTab().groups.find(g => g.id === groupId);
        if (!g) return;
        showConfirm(
            '🗑 Delete group?',
            `"${g.name}" and all ${g.dials.length} dial(s) inside will be permanently removed.`,
            () => {
                const backup = JSON.stringify(data);
                const _at = getActiveTab(); _at.groups = _at.groups.filter(gr => gr.id !== groupId);
                saveData(); render();
                showToastUndo(`🗑 Group "${g.name}" deleted`, backup);
            }
        );
    }

    function moveGroup(groupId, dir) {
        const groups = getActiveTab().groups;
        const idx = groups.findIndex(g => g.id === groupId);
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= groups.length) return;
        [groups[idx], groups[newIdx]] = [groups[newIdx], groups[idx]];
        saveData(); render();
    }

    // ─── DIAL CRUD ─────────────────────────────────────────────────
    function openDialModal(dialId = null, groupId = null) {
        editingDialId = dialId;
        editingDialGroupId = groupId;

        document.getElementById('dialModalTitle').textContent = dialId ? 'Edit Dial' : 'Add Dial';
        document.getElementById('dialEmojiPicker').classList.remove('open');
        selectedFaviconUrl = '';
        document.getElementById('faviconPicker').innerHTML = '<span class="favicon-hint">Enter a URL above to load icons</span>';
        // reset upload state
        pendingImageBlob = null;
        const uploadPreview = document.getElementById('imgUploadPreview');
        if (uploadPreview) { uploadPreview.style.display = 'none'; uploadPreview.innerHTML = ''; }
        const uploadStatus = document.getElementById('imgUploadStatus');
        if (uploadStatus) uploadStatus.textContent = '';
        const prevEl = document.getElementById('customIconPreview');
        if (prevEl) { prevEl.style.display = 'none'; prevEl.innerHTML = ''; }
        const customInput = document.getElementById('dialCustomIcon');
        if (customInput) customInput.value = '';

        if (dialId) {
            const group = getActiveTab().groups.find(g => g.id === groupId);
            const dial = group?.dials.find(d => d.id === dialId);
            if (dial) {
                document.getElementById('dialName').value = dial.name;
                document.getElementById('dialUrl').value = dial.url;
                currentDialEmoji = dial.emoji;
                document.getElementById('dialEmojiPreview').textContent = currentDialEmoji;
                if (dial.iconType === 'none') setIconSrc('none');
                else if (dial.iconType === 'emoji') setIconSrc('emoji');
                else if (dial.iconType === 'custom') {
                    setIconSrc('custom');
                    document.getElementById('dialCustomIcon').value = dial.icon || '';
                    if (dial.icon) setTimeout(() => previewCustomIcon(), 50);
                }
                else {
                    setIconSrc('favicon');
                    // Pre-select the stored icon if available
                    if (dial.icon) selectedFaviconUrl = dial.icon;
                    loadFaviconOptions(dial.url);
                }
            }
        } else {
            document.getElementById('dialName').value = '';
            document.getElementById('dialUrl').value = '';
            currentDialEmoji = pickRandomEmoji(EMOJI_LIST);
            document.getElementById('dialEmojiPreview').textContent = currentDialEmoji;
            setIconSrc('favicon');
        }

        openModal('dialModal');
    }

    // ─── CUSTOM ICON PREVIEW ────────────────────────────────────────
    let customPreviewTimer = null;

    function previewCustomIcon() {
        clearTimeout(customPreviewTimer);
        // typing a URL cancels any pending image upload
        pendingImageBlob = null;
        const uploadPreview = document.getElementById('imgUploadPreview');
        if (uploadPreview) { uploadPreview.style.display = 'none'; uploadPreview.innerHTML = ''; }
        const uploadStatus = document.getElementById('imgUploadStatus');
        if (uploadStatus) uploadStatus.textContent = '';
        customPreviewTimer = setTimeout(() => {
            const url = document.getElementById('dialCustomIcon').value.trim();
            const preview = document.getElementById('customIconPreview');
            if (!url) { preview.style.display = 'none'; return; }
            preview.style.display = 'flex';
            preview.innerHTML = '';
            [32, 64].forEach(sz => {
                const wrap = document.createElement('div');
                wrap.style.cssText = `width:${sz+16}px;height:${sz+16}px;background:var(--surface3);border-radius:10px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border)`;
                const i = document.createElement('img');
                i.src = url;
                i.style.cssText = `width:${sz}px;height:${sz}px;object-fit:contain`;
                i.onerror = () => { wrap.innerHTML = '<span style="font-size:18px">❌</span>'; };
                wrap.appendChild(i);
                preview.appendChild(wrap);
            });
        }, 400);
    }

    function onUrlInput() {
        const status = document.getElementById('titleFetchStatus');
        if (status) status.textContent = '';
        if (currentIconSrc === 'favicon') {
            const url = document.getElementById('dialUrl').value.trim();
            if (url.length > 6) loadFaviconOptions(url);
        }
    }

    async function fetchPageTitle() {
        const urlRaw = document.getElementById('dialUrl').value.trim();
        const nameField = document.getElementById('dialName');
        const status = document.getElementById('titleFetchStatus');
        if (!urlRaw || nameField.value.trim()) return;

        let url = urlRaw;
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        status.textContent = '⏳ Fetching title…';
        try {
            const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
            const text = await resp.text();
            const match = text.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
            if (match?.[1]) {
                nameField.value = match[1].replace(/\s+/g, ' ').trim();
                status.textContent = '✅ Title fetched';
                setTimeout(() => { status.textContent = ''; }, 2000);
            } else {
                status.textContent = '⚠️ No title found';
            }
        } catch {
            status.textContent = '⚠️ Could not fetch';
        }
    }

    function saveDial() {
        const nameField = document.getElementById('dialName');
        const name = nameField.value.trim();
        let url = document.getElementById('dialUrl').value.trim();
        if (!url) { showToast('⚠️ Please enter a URL'); return; }
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        if (!name) {
            const status = document.getElementById('titleFetchStatus');
            status.textContent = '⏳ Fetching title…';
            fetch(url, { signal: AbortSignal.timeout(6000) })
                .then(r => r.text())
                .then(text => {
                    const match = text.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
                    nameField.value = match?.[1]?.replace(/\s+/g, ' ').trim() || getDomain(url);
                    status.textContent = '';
                    _doSaveDial();
                })
                .catch(() => { nameField.value = getDomain(url); status.textContent = ''; _doSaveDial(); });
            return;
        }
        _doSaveDial();
    }

    async function _doSaveDial() {
        const name = document.getElementById('dialName').value.trim() || 'Untitled';
        let url = document.getElementById('dialUrl').value.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        const newId = editingDialId || uid();

        let icon, iconType;
        if (pendingImageBlob) {
            const statusEl = document.getElementById('imgUploadStatus');
            if (statusEl) statusEl.textContent = '⏳ Uploading…';
            try {
                await uploadDialImage(newId, pendingImageBlob);
                icon = `/uploads/${newId}.jpg`;
                iconType = 'custom';
                pendingImageBlob = null;
            } catch {
                showToast('❌ Image upload failed');
                if (statusEl) statusEl.textContent = '❌ Upload failed';
                return;
            }
        } else if (currentIconSrc === 'none') {
            icon = '';
            iconType = 'none';
        } else if (currentIconSrc === 'favicon') {
            icon = selectedFaviconUrl || '';
            iconType = 'favicon';
        } else if (currentIconSrc === 'custom') {
            icon = document.getElementById('dialCustomIcon').value.trim();
            iconType = 'custom';
        } else {
            icon = currentDialEmoji;
            iconType = 'emoji';
        }

        if (editingDialId) {
            const group = getActiveTab().groups.find(g => g.id === editingDialGroupId);
            const dial = group?.dials.find(d => d.id === editingDialId);
            if (dial) { dial.name = name; dial.url = url; dial.icon = icon; dial.iconType = iconType; dial.emoji = currentDialEmoji; }
        } else {
            const group = getActiveTab().groups.find(g => g.id === editingDialGroupId);
            if (group) {
                group.dials.push({ id: newId, name, url, icon, iconType, emoji: currentDialEmoji });
            }
        }

        saveData(); render();
        closeModal('dialModal');
    }

    function deleteDial(groupId, dialId) {
        const group = getActiveTab().groups.find(g => g.id === groupId);
        if (!group) return;
        const dial = group.dials.find(d => d.id === dialId);
        if (!dial) return;
        showConfirm(
            '🗑 Delete dial?',
            `"${dial.name}" will be permanently removed.`,
            () => {
                const backup = JSON.stringify(data);
                if (dial.iconType === 'custom' && dial.icon?.startsWith('/uploads/')) {
                    deleteDialImage(dialId).catch(() => {}); // best-effort
                }
                group.dials = group.dials.filter(d => d.id !== dialId);
                saveData(); render();
                showToastUndo(`🗑 "${dial.name}" deleted`, backup);
            }
        );
    }

    function moveDial(groupId, dialId, dir) {
        const group = getActiveTab().groups.find(g => g.id === groupId);
        if (!group) return;
        const idx = group.dials.findIndex(d => d.id === dialId);
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= group.dials.length) return;
        [group.dials[idx], group.dials[newIdx]] = [group.dials[newIdx], group.dials[idx]];
        saveData(); render();
    }

    // ─── ICON SOURCE ────────────────────────────────────────────────
    function setIconSrc(src) {
        currentIconSrc = src;
        ['favicon','emoji','custom','none'].forEach(s => {
            const btn = document.getElementById('iconSrc' + s.charAt(0).toUpperCase() + s.slice(1));
            if (btn) btn.classList.toggle('active', s === src);
        });
        document.getElementById('faviconPickerGroup').style.display = src === 'favicon' ? '' : 'none';
        document.getElementById('emojiPickerGroup').style.display = src === 'emoji' ? '' : 'none';
        document.getElementById('customIconGroup').style.display = src === 'custom' ? '' : 'none';
        if (src !== 'custom') {
            const p = document.getElementById('customIconPreview');
            if (p) p.style.display = 'none';
        }

        if (src === 'favicon') {
            const url = document.getElementById('dialUrl').value.trim();
            if (url) loadFaviconOptions(url);
        }
        if (src === 'custom') {
            // focus the drop zone (contenteditable) so Ctrl/Cmd+V paste fires on it
            setTimeout(() => document.getElementById('imgDropZone').focus(), 30);
        }
    }

    // ─── FAVICON PICKER ─────────────────────────────────────────────
    function loadFaviconOptions(rawUrl) {
        let url = rawUrl.trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        const picker = document.getElementById('faviconPicker');
        picker.innerHTML = '<div class="favicon-loading"><div class="spinner"></div><span>Loading icons…</span></div>';
        selectedFaviconUrl = '';

        const domain = getDomain(url);
        const bare = domain.replace(/^www\./, '');

        const candidates = [...new Set([
            `https://icons.duckduckgo.com/ip3/${domain}.ico`,
            `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
            `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
            `https://${domain}/favicon.ico`,
            `https://${domain}/favicon.png`,
            `https://${domain}/apple-touch-icon.png`,
            `https://${bare}/favicon.ico`,
        ])];

        const found = [];
        let pending = candidates.length;

        const done = () => {
            pending--;
            if (pending === 0) renderFaviconTiles(found, picker);
        };

        candidates.forEach(src => {
            const img = new Image();
            let settled = false;
            const settle = (ok) => {
                if (settled) return; settled = true;
                clearTimeout(timer);
                if (ok && !found.includes(src)) found.push(src);
                done();
            };
            img.onload = () => settle(true);
            img.onerror = () => settle(false);
            const timer = setTimeout(() => settle(false), 4000);
            img.src = src;
        });
    }

    function renderFaviconTiles(found, picker) {
        picker.innerHTML = '';

        if (!found.length) {
            picker.innerHTML = '<span class="favicon-hint">No icons found — try Emoji or Custom URL</span>';
            return;
        }

        // Deduplicate visually identical icons by filtering after load
        found.forEach((src, i) => {
            const tile = document.createElement('div');
            tile.className = 'favicon-tile' + (i === 0 ? ' selected' : '');
            if (i === 0) selectedFaviconUrl = src;

            const img = document.createElement('img');
            img.src = src;
            img.alt = '';

            const check = document.createElement('div');
            check.className = 'favicon-check';
            check.textContent = '✓';

            tile.appendChild(img);
            tile.appendChild(check);
            tile.title = src;

            tile.addEventListener('click', () => {
                picker.querySelectorAll('.favicon-tile').forEach(t => t.classList.remove('selected'));
                tile.classList.add('selected');
                selectedFaviconUrl = src;
            });

            picker.appendChild(tile);
        });
    }

    // ─── EMOJI PICKER ───────────────────────────────────────────────
    function buildEmojiPicker(pickerId, type) {
        const picker = document.getElementById(pickerId);
        picker.innerHTML = '';

        // Search bar
        const searchWrap = document.createElement('div');
        searchWrap.className = 'emoji-search-wrap';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'emoji-search';
        searchInput.placeholder = '🔍 Search emojis…';
        searchInput.autocomplete = 'off';
        searchWrap.appendChild(searchInput);
        picker.appendChild(searchWrap);

        // Categories container (inside scroll area)
        const scrollArea = document.createElement('div');
        scrollArea.className = 'emoji-scroll-area';
        picker.appendChild(scrollArea);

        const catContainer = document.createElement('div');
        catContainer.className = 'emoji-cats';
        scrollArea.appendChild(catContainer);

        // No-results message
        const noResults = document.createElement('div');
        noResults.className = 'emoji-no-results';
        noResults.textContent = 'No emojis found';
        noResults.style.display = 'none';
        scrollArea.appendChild(noResults);

        function renderCategories(filter) {
            catContainer.innerHTML = '';
            let totalShown = 0;
            EMOJI_CATEGORIES.forEach(cat => {
                const matches = filter
                    ? cat.emojis.filter(e => {
                        const name = emojiName(e).toLowerCase();
                        return name.includes(filter) || e === filter;
                    })
                    : cat.emojis;
                if (!matches.length) return;
                totalShown += matches.length;

                const catEl = document.createElement('div');
                catEl.className = 'emoji-category';

                const label = document.createElement('div');
                label.className = 'emoji-category-label';
                label.textContent = cat.label;
                catEl.appendChild(label);

                const grid = document.createElement('div');
                grid.className = 'emoji-grid';
                matches.forEach(e => {
                    const span = document.createElement('span');
                    span.className = 'emoji-opt';
                    span.textContent = e;
                    span.title = emojiName(e);
                    span.onclick = () => selectEmoji(type, e);
                    grid.appendChild(span);
                });
                catEl.appendChild(grid);
                catContainer.appendChild(catEl);
            });
            noResults.style.display = totalShown === 0 ? 'block' : 'none';
        }

        renderCategories('');

        searchInput.addEventListener('input', () => {
            renderCategories(searchInput.value.trim().toLowerCase());
        });

        // Clear search when picker opens
        picker._clearSearch = () => {
            searchInput.value = '';
            renderCategories('');
            const sa = picker.querySelector('.emoji-scroll-area');
            if (sa) sa.scrollTop = 0;
        };
    }

    // Simple emoji name lookup (keyword based)
    const EMOJI_KEYWORDS = {
        '😀':'grinning','😃':'smiley','😄':'smile','😁':'grin','😆':'laughing','😅':'sweat smile','🤣':'rofl','😂':'joy','🙂':'slightly smiling','😉':'wink','😊':'blush','😇':'innocent','🥰':'smiling hearts','😍':'heart eyes','🤩':'star struck','😘':'kiss','😗':'kissing','😚':'kissing closed eyes','😙':'kissing smiling eyes','😋':'yum','😛':'stuck out tongue','😜':'winking tongue','🤪':'zany','😝':'squinting tongue','🤑':'money mouth','🤗':'hugging','🤔':'thinking','🤐':'zipper mouth','😐':'neutral','😑':'expressionless','😶':'no mouth','😏':'smirk','😒':'unamused','🙄':'eye roll','😬':'grimace','😌':'relieved','😔':'pensive','😪':'sleepy','🤤':'drooling','😴':'sleeping','😷':'mask','🤒':'thermometer face','🤕':'head bandage','🤢':'nauseated','🤮':'vomiting','🤧':'sneezing','🥵':'hot','🥶':'cold','🥴':'woozy','😵':'dizzy','🤯':'exploding head','🤠':'cowboy','🥳':'partying','😎':'sunglasses','🤓':'nerd','🧐':'monocle','😕':'confused','😟':'worried','🙁':'frowning','☹️':'frowning face','😮':'open mouth','😯':'hushed','😲':'astonished','😳':'flushed','🥺':'pleading','😦':'frowning open mouth','😧':'anguished','😨':'fearful','😰':'anxious sweat','😥':'sad relieved','😢':'cry','😭':'loudly crying','😱':'screaming','😖':'confounded','😣':'persevering','😞':'disappointed','😓':'downcast sweat','😩':'weary','😫':'tired','🥱':'yawning','😤':'huffing','😡':'pouting','😠':'angry','🤬':'cursing','😈':'smiling devil','👿':'angry devil','💀':'skull','☠️':'skull crossbones','💩':'poop','🤡':'clown','👹':'ogre','👺':'goblin','👻':'ghost','👽':'alien','👾':'space invader','🤖':'robot',
        '👋':'wave','✋':'raised hand','👌':'ok hand','✌️':'victory','👍':'thumbs up','👎':'thumbs down','✊':'raised fist','👊':'oncoming fist','👏':'clapping','🙏':'folded hands','💪':'muscle','👀':'eyes','❤️':'heart red','🧡':'heart orange','💛':'heart yellow','💚':'heart green','💙':'heart blue','💜':'heart purple','🖤':'heart black','🤍':'heart white','💔':'broken heart','💕':'two hearts','💞':'revolving hearts','💓':'beating heart','💗':'growing heart','💖':'sparkling heart','💘':'heart arrow','💝':'heart ribbon',
        '🐶':'dog','🐱':'cat','🐭':'mouse','🐹':'hamster','🐰':'rabbit','🦊':'fox','🐻':'bear','🐼':'panda','🐨':'koala','🐯':'tiger','🦁':'lion','🐮':'cow','🐷':'pig','🐸':'frog','🐵':'monkey','🐔':'chicken','🐧':'penguin','🐦':'bird','🐤':'chick','🦆':'duck','🦅':'eagle','🦉':'owl','🦇':'bat','🐺':'wolf','🐴':'horse','🦄':'unicorn','🐝':'bee','🦋':'butterfly','🐛':'bug','🐌':'snail','🐞':'ladybug','🐜':'ant','🕷':'spider','🦂':'scorpion','🐢':'turtle','🐍':'snake','🦎':'lizard','🦖':'t-rex','🦕':'sauropod','🐙':'octopus','🦑':'squid','🐡':'blowfish','🐠':'tropical fish','🐟':'fish','🐬':'dolphin','🐳':'whale','🦈':'shark','🐊':'crocodile','🐘':'elephant','🦛':'hippo','🦏':'rhino','🐪':'camel','🦒':'giraffe','🦘':'kangaroo','🦬':'bison','🐃':'water buffalo','🐂':'ox','🐄':'cow2','🐎':'racehorse','🐖':'pig2','🦙':'llama','🐐':'goat','🦌':'deer','🐕':'dog2','🐩':'poodle','🐈':'cat2','🦀':'crab','🦞':'lobster','🦐':'shrimp','🦪':'oyster','🌵':'cactus','🎄':'christmas tree','🌲':'evergreen','🌳':'deciduous tree','🌴':'palm tree','🌱':'seedling','🌿':'herb','☘️':'shamrock','🍀':'four leaf clover','🍃':'leaves','🍂':'fallen leaf','🍁':'maple leaf','🍄':'mushroom','🌾':'sheaf of rice','💐':'bouquet','🌷':'tulip','🌹':'rose','🥀':'wilted flower','🌺':'hibiscus','🌸':'cherry blossom','🌼':'blossom','🌻':'sunflower','🌞':'sun face','🌝':'full moon face','🌙':'crescent moon','⭐':'star','🌟':'glowing star','🌠':'shooting star','🌌':'milky way','☀️':'sun','⛅':'partly cloudy','☁️':'cloud','🌊':'wave water','❄️':'snowflake','☃️':'snowman','⛄':'snowman hat','🌈':'rainbow','⚡':'lightning',
        '🍏':'green apple','🍎':'apple','🍐':'pear','🍊':'orange','🍋':'lemon','🍌':'banana','🍉':'watermelon','🍇':'grapes','🍓':'strawberry','🫐':'blueberries','🍈':'melon','🍒':'cherries','🍑':'peach','🥭':'mango','🍍':'pineapple','🥥':'coconut','🥝':'kiwi','🍅':'tomato','🍆':'eggplant','🥑':'avocado','🥦':'broccoli','🥬':'leafy green','🥒':'cucumber','🌶':'hot pepper','🧄':'garlic','🧅':'onion','🥔':'potato','🍠':'sweet potato','🥐':'croissant','🥯':'bagel','🍞':'bread','🥖':'baguette','🥨':'pretzel','🧀':'cheese','🥚':'egg','🍳':'cooking','🧈':'butter','🥞':'pancakes','🧇':'waffle','🥓':'bacon','🥩':'meat','🍗':'chicken leg','🍖':'meat bone','🌭':'hot dog','🍔':'burger','🍟':'fries','🍕':'pizza','🥪':'sandwich','🌮':'taco','🌯':'burrito','🥗':'salad','🍝':'spaghetti','🍜':'ramen','🍲':'stew','🍛':'curry','🍣':'sushi','🍱':'bento','🥟':'dumpling','🍤':'shrimp','🍙':'rice ball','🍚':'rice','🍘':'rice cracker','🧁':'cupcake','🍰':'shortcake','🎂':'birthday cake','🍭':'lollipop','🍬':'candy','🍫':'chocolate','🍿':'popcorn','🍩':'donut','🍪':'cookie','🍯':'honey','🧃':'juice','🥤':'cup with straw','🧋':'bubble tea','🍵':'tea','☕':'coffee','🍺':'beer','🍻':'beers','🥂':'champagne','🍷':'wine','🥃':'tumbler','🍸':'cocktail','🍹':'tropical drink','🍾':'champagne bottle','🧊':'ice',
        '🚗':'car','🚕':'taxi','🚙':'suv','🚌':'bus','🏎':'racing car','🚓':'police car','🚑':'ambulance','🚒':'fire truck','🚐':'minibus','🛻':'pickup truck','🚚':'delivery truck','🚛':'truck','🚜':'tractor','🏍':'motorcycle','🛵':'scooter','🚲':'bicycle','🛴':'kick scooter','⛵':'sailboat','🚤':'speedboat','🛥':'motor boat','🚢':'ship','✈️':'airplane','🛩':'small airplane','🚁':'helicopter','🚀':'rocket','🛸':'flying saucer','🏖':'beach','🏔':'mountain snow','⛰':'mountain','🌋':'volcano','🗻':'mount fuji','🏕':'camping','🏗':'construction','🏠':'house','🏡':'house garden','🏢':'office','🏣':'post office','🏤':'european post office','🏥':'hospital','🏦':'bank','🏨':'hotel','🏩':'love hotel','🏪':'convenience store','🏫':'school','🏭':'factory','🏯':'japanese castle','🏰':'castle','💒':'wedding','🗼':'tokyo tower','🗽':'statue of liberty','⛪':'church','🕌':'mosque','🛕':'hindu temple','🕍':'synagogue','⛩':'shinto shrine','🕋':'kaaba','⛲':'fountain','🌁':'foggy','🌃':'night stars','🏙':'cityscape','🌄':'sunrise mountains','🌅':'sunrise','🌆':'city dusk','🌇':'city sunset','🌉':'bridge night','🗺':'world map','🧭':'compass','🌐':'globe','🌍':'globe africa','🌎':'globe americas','🌏':'globe asia','🪐':'planet',
        '⚽':'soccer','🏀':'basketball','🏈':'football','⚾':'baseball','🥎':'softball','🎾':'tennis','🏐':'volleyball','🏉':'rugby','🥏':'flying disc','🎱':'billiards','🏓':'ping pong','🏸':'badminton','🏒':'ice hockey','⛳':'golf','🎣':'fishing','🥊':'boxing glove','🥋':'martial arts','🎽':'running shirt','🛹':'skateboard','🛷':'sled','⛸':'ice skate','🎿':'ski','🥌':'curling stone','🏆':'trophy','🥇':'first medal','🥈':'second medal','🥉':'third medal','🏅':'sports medal','🎖':'military medal','🎪':'circus','🎭':'theater','🎨':'art palette','🎬':'clapper','🎤':'microphone','🎧':'headphones','🎼':'musical score','🎵':'musical note','🎶':'musical notes','🥁':'drum','🎷':'saxophone','🎺':'trumpet','🎸':'guitar','🎻':'violin','🎲':'game die','🎯':'bullseye','🎳':'bowling','🎮':'video game','🎰':'slot machine','🧩':'puzzle','🎴':'flower card',
        '📱':'iphone','💻':'laptop','🖥':'desktop','🖨':'printer','⌨️':'keyboard','🖱':'mouse','💽':'minidisc','💾':'floppy disk','💿':'cd','📀':'dvd','📷':'camera','📸':'camera flash','📹':'video camera','🎥':'movie camera','📞':'telephone','☎️':'old telephone','📺':'television','📻':'radio','🧭':'compass','⏱':'stopwatch','⏰':'alarm clock','⏳':'hourglass','📡':'satellite','🔋':'battery','🔌':'electric plug','💡':'light bulb','🔦':'flashlight','🕯':'candle','🛏':'bed','🚽':'toilet','🚿':'shower','🛁':'bathtub','🧹':'broom','🧺':'basket','🧻':'roll of paper','🧼':'soap','🧰':'toolbox','🔧':'wrench','🔨':'hammer','⚒':'hammer pick','🛠':'tools','⛏':'pick','🪚':'carpentry saw','🔩':'nut and bolt','🧲':'magnet','💣':'bomb','🔪':'knife','⚔️':'swords','🛡':'shield','🧪':'test tube','🧫':'petri dish','🧬':'dna','🔭':'telescope','🔬':'microscope','💊':'pill','💉':'syringe','🩺':'stethoscope','📦':'package','📫':'mailbox','📋':'clipboard','📁':'file folder','📂':'open folder','🗂':'card index dividers','📅':'calendar','📆':'tear off calendar','📇':'card index','📈':'chart up','📉':'chart down','📊':'bar chart','📌':'pushpin','📍':'round pushpin','📎':'paperclip','📏':'ruler','📐':'triangular ruler','✂️':'scissors','🔒':'locked','🔓':'unlocked','🔑':'key','🗝':'old key','💰':'money bag','💵':'dollar','💴':'yen','💶':'euro','💷':'pound','💳':'credit card','🏧':'atm','💹':'chart yen','📜':'scroll','📋':'clipboard','✏️':'pencil','✒️':'black nib','🖊':'pen','🖋':'fountain pen','📝':'memo','📓':'notebook','📔':'notebook cover','📒':'ledger','📕':'closed book','📗':'green book','📘':'blue book','📙':'orange book','📚':'books','📖':'open book','🔗':'link','📰':'newspaper','🗞':'newspaper rolled',
        '❤️':'red heart','🧡':'orange heart','💛':'yellow heart','💚':'green heart','💙':'blue heart','💜':'purple heart','🖤':'black heart','🤍':'white heart','🤎':'brown heart','💔':'broken heart','❣️':'heart exclamation','💕':'two hearts','💞':'revolving hearts','💓':'beating heart','💗':'growing heart','💖':'sparkling heart','💘':'heart arrow','💝':'heart ribbon','💟':'heart decoration','☮️':'peace','✝️':'cross','☪️':'star crescent','🕉':'om','☸️':'wheel dharma','✡️':'star david','🔯':'dotted six point star','🕎':'menorah','☯️':'yin yang','🛐':'worship','⛎':'ophiuchus','♈':'aries','♉':'taurus','♊':'gemini','♋':'cancer','♌':'leo','♍':'virgo','♎':'libra','♏':'scorpio','♐':'sagittarius','♑':'capricorn','♒':'aquarius','♓':'pisces','♻️':'recycle','✅':'check','❌':'cross','⭕':'circle','🛑':'stop','⛔':'no entry','📛':'name badge','🚫':'prohibited','💯':'hundred','❗':'exclamation','❓':'question','⚠️':'warning','🔰':'beginner','🔱':'trident','🔅':'dim button','🔆':'bright button','🔀':'shuffle','🔁':'repeat','🔂':'repeat one','▶️':'play','⏸':'pause','⏹':'stop button','⏺':'record','⏭':'next track','⏮':'previous track','⏩':'fast forward','⏪':'rewind','⬆️':'up arrow','⬇️':'down arrow','➡️':'right arrow','⬅️':'left arrow','↕️':'up down arrow','↔️':'left right arrow','↩️':'curved arrow left','↪️':'curved arrow right','🆕':'new','🆒':'cool','🆓':'free','🆗':'ok','🆙':'up','🆚':'vs','🆘':'sos','🔤':'abc','🔢':'numbers','🔠':'caps','🔡':'lowercase',
    };

    function emojiName(e) {
        return EMOJI_KEYWORDS[e] || e;
    }

    function initEmojiPickers() {
        buildEmojiPicker('dialEmojiPicker', 'dial');
        buildEmojiPicker('groupEmojiPicker', 'group');
        buildEmojiPicker('tabEmojiPicker', 'tab');
    }

    function toggleEmojiPicker(type) {
        const picker = document.getElementById(type + 'EmojiPicker');
        const isOpen = picker.classList.contains('open');
        // Close all pickers first
        document.querySelectorAll('.emoji-picker').forEach(p => p.classList.remove('open'));
        if (!isOpen) {
            picker.classList.add('open');
            if (picker._clearSearch) picker._clearSearch();
            // Focus search input
            const si = picker.querySelector('.emoji-search');
            if (si) setTimeout(() => si.focus(), 50);
        }
    }

    function selectEmoji(type, emoji) {
        if (type === 'dial') {
            currentDialEmoji = emoji;
            document.getElementById('dialEmojiPreview').textContent = emoji;
        } else if (type === 'tab') {
            currentTabEmoji = emoji;
            const preview = document.getElementById('tabEmojiPreview');
            preview.textContent = emoji;
            preview.classList.remove('emoji-preview-none');
            document.getElementById('tabNoIconBtn').classList.remove('active');
        } else {
            currentGroupEmoji = emoji;
            const preview = document.getElementById('groupEmojiPreview');
            preview.textContent = emoji;
            preview.classList.remove('emoji-preview-none');
            document.getElementById('groupNoIconBtn').classList.remove('active');
        }
        document.getElementById(type + 'EmojiPicker').classList.remove('open');
    }

    function randomEmoji(type) {
        const list = (type === 'group' || type === 'tab') ? GROUP_EMOJIS : EMOJI_LIST;
        const emoji = pickRandomEmoji(list);
        if (type === 'dial') {
            currentDialEmoji = emoji;
            document.getElementById('dialEmojiPreview').textContent = emoji;
        } else if (type === 'tab') {
            currentTabEmoji = emoji;
            const preview = document.getElementById('tabEmojiPreview');
            preview.textContent = emoji;
            preview.classList.remove('emoji-preview-none');
            document.getElementById('tabNoIconBtn').classList.remove('active');
        } else {
            currentGroupEmoji = emoji;
            const preview = document.getElementById('groupEmojiPreview');
            preview.textContent = emoji;
            preview.classList.remove('emoji-preview-none');
            document.getElementById('groupNoIconBtn').classList.remove('active');
        }
    }

    function setNoIcon(type) {
        if (type === 'tab') {
            currentTabEmoji = '';
            const preview = document.getElementById('tabEmojiPreview');
            preview.textContent = '—';
            preview.classList.add('emoji-preview-none');
            document.getElementById('tabNoIconBtn').classList.add('active');
        } else {
            currentGroupEmoji = '';
            const preview = document.getElementById('groupEmojiPreview');
            preview.textContent = '—';
            preview.classList.add('emoji-preview-none');
            document.getElementById('groupNoIconBtn').classList.add('active');
        }
        document.getElementById(type + 'EmojiPicker').classList.remove('open');
    }

    // ─── MODAL HELPERS ──────────────────────────────────────────────
    function openModal(id) {
        document.getElementById(id).classList.add('open');
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('open');
    }

    // Click backdrop to close
    document.querySelectorAll('.modal-backdrop').forEach(bd => {
        bd.addEventListener('click', e => { if (e.target === bd) bd.classList.remove('open'); });
    });

    // ─── IMPORT / EXPORT ────────────────────────────────────────────
    function exportData() {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'speed-dial.json';
        a.click();
        showToast('✅ Exported speed-dial.json');
    }

    function openImportModal() {
        document.getElementById('importData').value = '';
        openModal('importModal');
    }

    function importData() {
        try {
            const raw = document.getElementById('importData').value.trim();
            const imported = JSON.parse(raw);
            // Support both old { groups } and new { tabs } format
            if (imported.groups && !imported.tabs) {
                imported = { tabs: [{ id: uid(), name: 'Home', groups: imported.groups }] };
            }
            if (!imported.tabs || !Array.isArray(imported.tabs)) throw new Error('Invalid format');
            data = imported;
            saveData();
            render();
            closeModal('importModal');
            showToast('✅ Imported successfully');
        } catch(e) {
            showToast('❌ Invalid JSON format');
        }
    }

    // ─── KEYBOARD SHORTCUTS ─────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
        }
    });

    // ─── INIT ───────────────────────────────────────────────────────
    document.addEventListener('dragend', () => {
        clearDropIndicators();
    });

    function updateClock() {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const clockEl = document.getElementById('headerClock');
        const dateEl  = document.getElementById('headerDate');
        if (clockEl) clockEl.textContent = `${hh}:${mm}:${ss}`;
        if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
        });
    }

    function updateDialCount() {
        const el = document.getElementById('headerDialCount');
        if (!el) return;
        const tab = data.tabs.find(t => t.id === activeTabId);
        if (!tab) { el.textContent = ''; return; }
        const totalDials = (tab.groups || []).reduce((n, g) => n + (g.dials || []).length, 0);
        const totalGroups = (tab.groups || []).length;
        el.textContent = `${totalGroups} group${totalGroups !== 1 ? 's' : ''} · ${totalDials} dial${totalDials !== 1 ? 's' : ''}`;
    }

    // ─── LOGO CRASH ANIMATION ──────────────────────────────────────
    function initLogoAnimation() {
        logoAnimEnabled = localStorage.getItem('logoAnim') !== 'false';

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

        // Phase 1: drive in fast from right
        logo.classList.add('logo-driving');

        // Phase 2: impact shockwave ripples through each letter (after 450ms)
        // Left letters bounce hardest, intensity falls off rightward
        setTimeout(() => {
            logo.classList.remove('logo-driving');

            chars.forEach((ch, i) => {
                const t = i / Math.max(chars.length - 1, 1); // 0=left … 1=right
                const intensity = 1 - t * 0.72; // 1.0 → 0.28
                ch.style.setProperty('--bi', intensity);
                ch.style.animationDelay = (i * 18) + 'ms';
                ch.classList.add('logo-char-impact');
            });

            // Phase 3: fly left + sparks (after ripple finishes)
            const impactEnd = (chars.length - 1) * 10;
            setTimeout(() => {
                chars.forEach(ch => {
                    ch.classList.remove('logo-char-impact');
                    ch.style.animationDelay = '';
                    ch.style.removeProperty('--bi');
                });

                // Capture each char's Y for left-wall sparks (letters vanish in place)
                const charRects = chars.map(ch => ch.getBoundingClientRect());
                const vanishDur = 160;

                chars.forEach((ch, i) => {
                    const charX = charRects[i].left + charRects[i].width / 2;
                    const charY = charRects[i].top  + charRects[i].height / 2;
                    const delay = i * 22;

                    ch.style.animationDelay = delay + 'ms';
                    ch.classList.add('logo-char-vanish');

                    // Sparks burst from the letter's own position as it vanishes
                    setTimeout(() => spawnSparks(charX, charY), delay);
                });

                // Phase 4: assemble from random scattered positions (original effect)
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
        }, 450);
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
        if (toggle) toggle.classList.toggle('active', logoAnimEnabled);
    }

    loadTheme();
    renderThemeSelector();
    loadData();
    initEmojiPickers();
    render();
    updateClock();
    updateDialCount();
    setInterval(updateClock, 1000);
    initLogoAnimation();
