const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple Password Protection (Basic Auth)
const USERNAME = 'admin';
const PASSWORD = 'KjM@583135'; // Oyage password eka methana wenas karanna

app.use((req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login === USERNAME && password === PASSWORD) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Secure Area"');
    res.status(401).send('Access Denied. Please enter username and password.');
});

// Serve static files from the current directory (where index.html is)
app.use(express.static(__dirname));

// Google Sheets Configuration
const SHEET_ID = '1uymVxwjHpXovTvsW7EcWVJrAVrRCTXr9WBzCdEOuXhA';

/**
 * Append data to Google Sheets
 * Note: Requires a Service Account key file (google-credentials.json)
 */
async function appendToGoogleSheet(videoData) {
    try {
        let auth;
        // Check if running on Vercel (or any environment with GOOGLE_CREDENTIALS env var)
        if (process.env.GOOGLE_CREDENTIALS) {
            const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
            auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
        } else {
            // Local development fallback
            auth = new google.auth.GoogleAuth({
                keyFile: 'google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
        }

        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        const rowData = [
            videoData.viewkey,        // A: ID
            videoData.title,          // B: TITLE
            videoData.embedCode,      // C: EMBEDID
            videoData.thumbnail,      // D: THUMBNAIL
            videoData.categories,     // E: CATEGORY
            videoData.pornstars,      // F: PORN STAR
            'Pornhub',                // G: SOURCE
            videoData.duration        // H: DURATION
        ];

        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Sheet1!A:H', // Ensure this matches your actual sheet tab name
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [rowData]
            }
        });

        console.log('Successfully added to Google Sheet:', response.data.updates.updatedRange);
        return true;
    } catch (error) {
        console.error('Failed to append to Google Sheet. Check credentials:', error.message);
        return false;
    }
}

/**
 * Extract viewkey from URL
 */
function extractViewkey(url) {
    if (!url) return null;
    let match = url.match(/view_video\.php\?viewkey=([^&\s]+)/i);
    if (match) return match[1];
    match = url.match(/\/viewkey\/([^\/\?\s]+)/i);
    if (match) return match[1];
    match = url.match(/embed\/([^\/\?\s]+)/i);
    if (match) return match[1];
    if (/^[a-z0-9]+$/i.test(url) && url.length > 5) return url;
    return null;
}

/**
 * API Endpoint to extract media
 */
app.get('/api/extract', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const viewkey = extractViewkey(videoUrl);
    if (!viewkey) {
        return res.status(400).json({ error: 'Invalid Pornhub URL' });
    }

    const canonicalUrl = `https://www.pornhub.com/view_video.php?viewkey=${viewkey}`;

    try {
        console.log(`Fetching: ${canonicalUrl}`);

        const response = await axios.get(canonicalUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie': 'age_verified=1'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const html = response.data;

        let thumbnail = $('meta[property="og:image"]').attr('content');
        let title = $('meta[property="og:title"]').attr('content') || $('h1.video-title').text() || 'Unknown Title';
        function formatDuration(duration) {
            if (!duration) return 'Unknown';
            if (typeof duration === 'string' && duration.includes(':')) return duration;

            const seconds = parseInt(duration);
            if (isNaN(seconds)) return duration;

            const hrs = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);

            if (hrs > 0) {
                return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        let rawDuration = $('meta[property="video:duration"]').attr('content') || '';
        let duration = formatDuration(rawDuration);

        const pornstars = [];
        $('.pornstarsWrapper a.item, .pornstarsWrapper a').each((i, el) => {
            const name = $(el).text().trim();
            if (name && !pornstars.includes(name)) pornstars.push(name);
        });

        const allCategories = [];
        $('.categoriesWrapper a.item, .categoriesWrapper a').each((i, el) => {
            const name = $(el).text().trim();
            if (name && name !== '+' && !allCategories.includes(name)) allCategories.push(name);
        });

        const genericTags = ['HD Porn', 'Exclusive', 'Verified Amateurs', '60FPS', '4K', 'Pornstar'];
        const priorityNiches = ['Anal', 'Teen', 'MILF', 'Lesbian', 'Threesome', 'Creampie', 'Squirting', 'Blowjob', 'Big Tits', 'Big Ass', 'Ebony', 'Asian', 'Latina', 'BBW', 'BDSM', 'Hardcore'];

        let bestCategory = 'N/A';
        const meaningfulCategories = allCategories.filter(c => !genericTags.includes(c));

        if (meaningfulCategories.length > 0) {
            bestCategory = meaningfulCategories.find(c => priorityNiches.includes(c)) || meaningfulCategories[0];
        } else if (allCategories.length > 0) {
            bestCategory = allCategories[0];
        }

        const embedUrl = `https://www.pornhub.com/embed/${viewkey}`;
        const embedCode = `<iframe src="${embedUrl}" frameborder="0" width="1200" height="720" scrolling="no" allowfullscreen></iframe>`;

        const scriptContent = $('script').map((i, el) => $(el).html()).get().join('\n');

        const highResMatch = scriptContent.match(/"image_url"\s*:\s*"([^"]+)"/);
        if (highResMatch) {
            const potentialHighRes = highResMatch[1].replace(/\\/g, '');
            if (potentialHighRes) thumbnail = potentialHighRes;
        }

        if (!thumbnail) {
            console.log('Scraping failed to find thumbnail, trying HubTraffic API fallback...');
            try {
                const apiRes = await axios.get(`https://api.hubtraffic.com/Api.php?id=${viewkey}&action=get_video_by_id`);
                if (apiRes.data && apiRes.data.video) {
                    thumbnail = apiRes.data.video.default_thumb || apiRes.data.video.thumb;
                    title = apiRes.data.video.title || title;
                    duration = apiRes.data.video.duration || duration;
                }
            } catch (apiErr) {
                console.error('API Fallback also failed');
            }
        }

        if (!thumbnail) {
            return res.status(404).json({ error: 'Could not find valid thumbnail URL. The video might be private or deleted.' });
        }

        const resultData = {
            success: true,
            viewkey,
            title,
            duration,
            thumbnail,
            embedUrl,
            embedCode,
            pornstars: pornstars.length > 0 ? pornstars.join(', ') : 'N/A',
            categories: bestCategory,
            source: 'scraper'
        };

        // Automate writing to Google Sheets
        // This runs asynchronously in the background
        appendToGoogleSheet(resultData);

        res.json(resultData);

    } catch (error) {
        console.error('Extraction error:', error.message);
        res.status(500).json({
            error: 'Failed to extract data from Pornhub',
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = app;
