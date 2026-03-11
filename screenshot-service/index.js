const express = require('express');
const { chromium } = require('playwright');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const SCREENSHOTS_DIR = '/uploads/screenshots';
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// Capture viewport — wide enough to trigger desktop layouts
const VIEWPORT_W = 1280;
const VIEWPORT_H = 960;

function urlHash(url) {
    return crypto.createHash('sha1').update(url).digest('hex');
}

app.post('/screenshot', async (req, res) => {
    const { url, wait = 0, force = false, width = 800, height = 600 } = req.body;

    if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'Invalid URL — must start with http:// or https://' });
    }

    const hash = urlHash(url);
    const filename = `${hash}.jpg`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    const publicPath = `/uploads/screenshots/${filename}`;

    // Return cached file unless force flag is set
    if (!force && fs.existsSync(filepath)) {
        return res.json({ path: publicPath });
    }

    let browser;
    try {
        browser = await chromium.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });

        const page = await browser.newPage();
        await page.setViewportSize({ width: VIEWPORT_W, height: VIEWPORT_H });

        await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });

        const clampedWait = Math.min(Math.max(0, parseInt(wait, 10) || 0), 30);
        if (clampedWait > 0) {
            await page.waitForTimeout(clampedWait * 1000);
        }

        const rawBuffer = await page.screenshot({ type: 'jpeg', quality: 85, fullPage: false });

        await sharp(rawBuffer)
            .resize(width, height, { fit: 'cover', position: 'top' })
            .jpeg({ quality: 75 })
            .toFile(filepath);

        res.json({ path: publicPath });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (browser) await browser.close();
    }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(3000, () => console.log('Screenshot service listening on :3000'));
