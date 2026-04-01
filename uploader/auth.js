const { google } = require('googleapis');
const fs = require('fs');

const REFRESH_TOKEN_PATH = '/uploads/refresh_token.json';

function getOAuth2Client() {
    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars are required');
    }
    // 'postmessage' is the special redirect_uri used by GIS popup/code flow
    return new google.auth.OAuth2(clientId, clientSecret, 'postmessage');
}

function loadRefreshToken() {
    try {
        if (fs.existsSync(REFRESH_TOKEN_PATH)) {
            return JSON.parse(fs.readFileSync(REFRESH_TOKEN_PATH, 'utf8')).refresh_token || null;
        }
    } catch (e) {
        console.error('[auth] Failed to load refresh token:', e.message);
    }
    return null;
}

function saveRefreshToken(refreshToken) {
    fs.writeFileSync(REFRESH_TOKEN_PATH, JSON.stringify({ refresh_token: refreshToken }), 'utf8');
    console.log('[auth] Refresh token saved.');
}

// Exchange an authorization code (from the frontend GIS code client) for tokens.
// Stores the refresh token and returns { access_token, expiry, email }.
async function exchangeCode(code) {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (tokens.refresh_token) {
        saveRefreshToken(tokens.refresh_token);
    } else {
        console.warn('[auth] No refresh_token in response — user may need to re-consent.');
    }

    // Fetch email using the fresh access token
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: userInfo } = await oauth2.userinfo.get();

    return {
        access_token: tokens.access_token,
        expiry:       tokens.expiry_date,
        email:        userInfo.email,
    };
}

// Use the stored refresh token to silently obtain a fresh access token.
// Returns { access_token, expiry } or null if no refresh token is stored.
async function getFreshToken() {
    const refreshToken = loadRefreshToken();
    if (!refreshToken) return null;

    const client = getOAuth2Client();
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();

    return {
        access_token: credentials.access_token,
        expiry:       credentials.expiry_date,
    };
}

module.exports = { exchangeCode, getFreshToken };
