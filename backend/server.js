const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cors = require('cors');
const app = express();
const port = 3000;

const CONFIG_PATH = path.join(__dirname, 'config.json');

const ASCII_ART = [
    "   *                                                (                  ",
    " (  \`           )                     *   )   (     )\\ ) (       (     ",
    " )\\))(    (  ( /((  (         )     \` )  /(   )\\   (()/( )\\ )    )\\    ",
    "((_)()\\  ))\\ )())( )\\  (  ( /( (    ( )(_)|(((_)(  /(_)|()/( ((((_)(  ",
    "(_()((_)/((_|_))(()((_) )\\ )(_)))\\  (_(_()) )\\ _ )\\(_))  /(_))_)\\ _ )\\ ",
    "|  \\/  (_)) | |_ ((_|_)((_|(_)_((_) |_   _| (_)_\\(_)_ _|(_)) __(_)_\\(_)",
    "| |\\/| / -_)|  _| '_| / _|/ _\` (_-<   | |    / _ \\  | |   | (_ |/ _ \\  ",
    "|_|  |_\\___| \\__|_| |_\\__|\\__,_/__/   |_|   /_/ \\_\\|___|   \\___/_/ \\_\\ ",
    "------------------------------------------------------------------------"
].join('\n');

// Helper to read config
function readConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading config:', e);
    }
    return { taiga_domain: 'taiga.bdp.com.bo', username: '', auth_token: '', user_id: 7 };
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

// Enable CORS for all routes
app.use(cors());

// Root route handler
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Metrics Layer Backend is running',
        endpoints: ['/api/data', '/api/settings', '/import']
    });
});

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
    const itemCount = req.body.data ? req.body.data.length : (Array.isArray(req.body) ? req.body.length : 1);
    console.log(`[IMPORT] Received ${itemCount} items from Python client (type: ${req.body.type || 'unknown'})`);

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
    // Do not expose auth_token, user_id or username via this endpoint. Tokens and username must be stored client-side.
    res.json({ taiga_domain: config.taiga_domain });
});

// New endpoint to fetch only the project list from Taiga
app.get('/api/projects', (req, res) => {
    const config = readConfig();

    // Expect the client to provide a token and user id in headers (stored client-side)
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const userId = req.headers['x-user-id'];

    if (!authHeader || !userId) {
        return res.status(401).json({ status: 'error', message: 'Missing authentication. Please login from the settings page.' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

    const options = {
        hostname: config.taiga_domain,
        port: 443,
        path: `/api/v1/projects?member=${userId}`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        rejectUnauthorized: false
    };

    const projectsReq = https.request(options, (projectsRes) => {
        let body = '';
        projectsRes.on('data', (chunk) => body += chunk);
        projectsRes.on('end', () => {
            try {
                const projects = JSON.parse(body);
                res.json(projects);
            } catch (e) {
                res.status(500).json({ status: 'error', message: 'Failed to parse projects from Taiga' });
            }
        });
    });

    projectsReq.on('error', (err) => {
        res.status(500).json({ status: 'error', message: `Taiga error: ${err.message}` });
    });

    projectsReq.end();
});

// Endpoint to trigger Python data import
app.post('/api/refresh', (req, res) => {
    const projectId = req.query.project;
    console.log(`Starting data refresh via Python client${projectId ? ' for project ' + projectId : ''}...`);

    // Detect the best python executable
    const pythonExe = process.platform === 'win32' ? 'python' : 'python3';
    
    // Spawn with optional project ID argument
    const args = [path.join(__dirname, 'client.py')];
    if (projectId) {
        args.push('--project');
        args.push(projectId);
    }
    
    // The client must provide authentication via headers (token + user id)
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const userId = req.headers['x-user-id'];
    if (!authHeader || !userId) {
        return res.status(401).json({ status: 'error', message: 'Missing authentication. Please login from the settings page.' });
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

    // Pass domain, token and user id to the python process via environment variables
    const env = Object.assign({}, process.env, {
        TAIGA_DOMAIN: readConfig().taiga_domain,
        AUTH_TOKEN: token,
        USER_ID: String(userId)
    });

    const pythonProcess = spawn(pythonExe, args, { env });

    pythonProcess.on('error', (err) => {
        console.error('Failed to start Python process:', err);
        if (!res.headersSent) {
            res.status(500).json({
                status: 'error',
                message: `Failed to start Python process: ${err.message}. Ensure '${pythonExe}' is in your PATH.`,
                detail: err
            });
        }
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
        // console.log(`Python: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.warn(`Python Error: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python process finished with code ${code}`);
        if (code === 0) {
            res.json({ status: 'success', message: 'Data refresh completed', output });
        } else {
            res.status(500).json({
                status: 'error',
                message: `Refresh failed with code ${code}`,
                error: errorOutput
            });
        }
    });
});

app.post('/api/settings', (req, res) => {
    const config = readConfig();
    const newSettings = req.body;

    // Only persist non-sensitive settings server-side. Authentication tokens must remain client-side.
    config.taiga_domain = newSettings.taiga_domain || config.taiga_domain;
    // Do not persist username on server. Username should be kept in browser session storage.

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
                    console.log(`Auth success for user: ${username}`);
                    console.log(ASCII_ART);
                    res.json({ status: 'success', user: response, signature: ASCII_ART });
                } else {
                    const errMsg = response._error_message || 'Authentication failed';
                    console.warn(`Auth failed (status ${authRes.statusCode}): ${errMsg}`);
                    res.status(authRes.statusCode).json({ status: 'error', message: errMsg, detail: response });
                }
            } catch (e) {
                console.error('Failed to parse auth response:', e);
                res.status(500).json({ status: 'error', message: 'Failed to parse auth response from Taiga', raw: body });
            }
        });
    });

    // Set timeout for the request
    authReq.setTimeout(10000, () => {
        console.error(`Auth request to ${domain} timed out after 10s`);
        authReq.destroy();
        res.status(504).json({ status: 'error', message: 'Connection to Taiga timed out (10s)' });
    });

    authReq.on('error', (err) => {
        console.error('Auth error:', err);
        res.status(500).json({ status: 'error', message: `Failed to reach Taiga server: ${err.message}` });
    });

    authReq.write(postData);
    authReq.end();
});

// Proxy endpoint for User Story History
app.get('/api/history/:id', (req, res) => {
    const storyId = req.params.id;
    const config = readConfig();

    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Missing authentication token' });
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const url = `https://${config.taiga_domain}/api/v1/history/userstory/${storyId}`;

    console.log(`Proxying history request for story ${storyId} to ${config.taiga_domain}`);

    const proxyReq = https.get(url, { headers: { Authorization: `Bearer ${token}` }, rejectUnauthorized: false }, (proxyRes) => {
        let body = '';
        proxyRes.on('data', (chunk) => body += chunk);
        proxyRes.on('end', () => {
            try {
                res.json(JSON.parse(body));
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse history data from Taiga' });
            }
        });
    });

    proxyReq.setTimeout(10000, () => {
        console.error(`History proxy request for story ${storyId} timed out after 10s`);
        proxyReq.destroy();
        res.status(504).json({ error: 'Connection to Taiga timed out (10s)' });
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err);
        res.status(500).json({ error: `Failed to fetch history from Taiga: ${err.message}` });
    });
});

app.listen(port, () => {
    console.log('Server listening at http://localhost:' + port);
});
