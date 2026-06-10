// Quick test: can the page monitor detect Steam Deck stock changes?
import crypto from 'crypto';

const url = 'https://store.steampowered.com/sale/steamdeckrefurbished/';

function stripHtml(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function filterKeywords(text, keywords) {
    if (!keywords) return text;
    const parts = text.split(/\s{2,}/);
    return parts.filter(p => keywords.some(kw => p.toLowerCase().includes(kw.toLowerCase()))).join('  ');
}

console.log('=== Plain fetch test ===');
try {
    const r = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SpeedDialMonitor/1.0)',
            Accept: 'text/html,*/*',
        },
        redirect: 'follow',
    });
    console.log('HTTP status:', r.status);
    const html = await r.text();
    console.log('Raw HTML length:', html.length);

    const text = stripHtml(html);
    console.log('Stripped text length:', text.length);
    console.log('SHA-256 (full):', crypto.createHash('sha256').update(text).digest('hex'));

    // Check if stock-related keywords appear
    const stockKeywords = ['out of stock', 'in stock', 'add to cart', 'buy', 'steam deck'];
    const relevant = text.toLowerCase();
    stockKeywords.forEach(kw => {
        const idx = relevant.indexOf(kw);
        if (idx >= 0) {
            console.log(`  Found "${kw}" at index ${idx}:`, text.slice(Math.max(0, idx - 20), idx + 80));
        } else {
            console.log(`  NOT FOUND: "${kw}"`);
        }
    });

    // Filtered hash (only stock-related content)
    const filtered = filterKeywords(text, ['stock', 'cart', 'buy', 'deck']);
    console.log('\nFiltered text length:', filtered.length);
    console.log('Filtered preview (first 400 chars):', filtered.slice(0, 400));
    console.log('SHA-256 (filtered):', crypto.createHash('sha256').update(filtered).digest('hex'));

} catch (e) {
    console.error('Plain fetch error:', e.message);
}

