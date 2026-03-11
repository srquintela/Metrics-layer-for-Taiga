const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Helper to read config
function readConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading config:', e);
    }
    return { taiga_domain: 'taiga.bdp.com.bo', username: '', auth_token: '' };
}

// Helper to write config
function writeConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4), 'utf8');
        return true;
    } catch (e) {
        console.error('Error writing config:', e);
        return false;
    }
}

// Middleware to parse JSON bodies
app.use(express.json({ limit: '50mb' }));

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// In-memory storage for data
let dataStore = {
    type: 'none',
    items: []
};

// Endpoint for Python to import data
app.post('/import', (req, res) => {
    console.log('Received data transfer from Python client');
    dataStore = {
        type: req.body.type || 'unknown',
        items: req.body.data || (Array.isArray(req.body) ? req.body : [req.body])
    };
    res.json({ status: 'success', count: dataStore.items.length });
});

// Endpoint for the UI to fetch data
app.get('/api/data', (req, res) => {
    res.json(dataStore);
});

// Settings endpoints
app.get('/api/settings', (req, res) => {
    const config = readConfig();
    res.json(config);
});

app.post('/api/settings', (req, res) => {
    const config = readConfig();
    const newSettings = req.body;
    
    config.taiga_domain = newSettings.taiga_domain || config.taiga_domain;
    config.username = newSettings.username || config.username;
    config.auth_token = newSettings.auth_token || config.auth_token;
    
    if (writeConfig(config)) {
        res.json({ status: 'success', config });
    } else {
        res.status(500).json({ status: 'error', message: 'Failed to save settings' });
    }
});

// Auth validation endpoint
app.post('/api/auth/validate', (req, res) => {
    const { domain, username, password } = req.body;
    const url = `https://${domain}/api/v1/auth`;
    
    const postData = JSON.stringify({
        username,
        password,
        type: 'normal'
    });

    const options = {
        hostname: domain,
        port: 443,
        path: '/api/v1/auth',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        },
        rejectUnauthorized: false // For POC
    };

    const authReq = https.request(options, (authRes) => {
        let body = '';
        authRes.on('data', (chunk) => body += chunk);
        authRes.on('end', () => {
            try {
                const response = JSON.parse(body);
                if (authRes.statusCode === 200) {
                    res.json({ status: 'success', user: response });
                } else {
                    res.status(authRes.statusCode).json({ status: 'error', message: response._error_message || 'Authentication failed' });
                }
            } catch (e) {
                res.status(500).json({ status: 'error', message: 'Failed to parse auth response' });
            }
        });
    });

    authReq.on('error', (err) => {
        console.error('Auth error:', err);
        res.status(500).json({ status: 'error', message: 'Failed to reach Taiga server' });
    });

    authReq.write(postData);
    authReq.end();
});

// Proxy endpoint for User Story History
app.get('/api/history/:id', (req, res) => {
    const storyId = req.params.id;
    const config = readConfig();
    const url = `https://${config.taiga_domain}/api/v1/history/userstory/${storyId}`;

    console.log(`Proxying history request for story ${storyId} to ${config.taiga_domain}`);

    https.get(url, { rejectUnauthorized: false }, (proxyRes) => {
        let body = '';
        proxyRes.on('data', (chunk) => body += chunk);
        proxyRes.on('end', () => {
            try {
                res.json(JSON.parse(body));
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse history data' });
            }
        });
    }).on('error', (err) => {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Failed to fetch history from Taiga' });
    });
});

app.listen(port, () => {
    console.log('Server listening at http://localhost:' + port);
});
