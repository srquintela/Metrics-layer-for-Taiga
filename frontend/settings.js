document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('settings-form');
    const domainInput = document.getElementById('taiga-domain');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const testBtn = document.getElementById('test-connection');
    const statusBox = document.getElementById('status-message');

    let currentAuthToken = '';

    // Load current settings
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        
        domainInput.value = settings.taiga_domain || '';
        usernameInput.value = settings.username || '';
        currentAuthToken = settings.auth_token || '';
        
        if (currentAuthToken) {
            passwordInput.placeholder = '•••••••• (Token stored)';
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }

    function showStatus(message, type) {
        statusBox.textContent = message;
        statusBox.className = `status-box ${type}`;
        statusBox.classList.remove('hidden');
    }

    testBtn.addEventListener('click', async () => {
        const domain = domainInput.value.trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!domain || !username || !password) {
            showStatus('Please fill in all fields to test connection.', 'error');
            return;
        }

        showStatus('Testing connection...', 'info');
        testBtn.disabled = true;

        try {
            const response = await fetch('/api/auth/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain, username, password })
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                showStatus(`Success! Connected as ${result.user.full_name}`, 'success');
                currentAuthToken = result.user.auth_token;
            } else {
                showStatus(`Connection failed: ${result.message}`, 'error');
            }
        } catch (e) {
            showStatus(`Error connecting to server: ${e.message}`, 'error');
        } finally {
            testBtn.disabled = false;
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const domain = domainInput.value.trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        // If password is provided, we should probably validate it first to get a token
        if (password) {
            showStatus('Validating and saving...', 'info');
            try {
                const authRes = await fetch('/api/auth/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain, username, password })
                });

                const authResult = await authRes.json();
                if (authRes.ok && authResult.status === 'success') {
                    currentAuthToken = authResult.user.auth_token;
                } else {
                    showStatus(`Validation failed: ${authResult.message}. Settings not saved.`, 'error');
                    return;
                }
            } catch (e) {
                showStatus(`Error validating credentials: ${e.message}`, 'error');
                return;
            }
        }

        if (!currentAuthToken) {
            showStatus('Token missing. Please provide a password to authenticate.', 'error');
            return;
        }

        try {
            const saveRes = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taiga_domain: domain,
                    username: username,
                    auth_token: currentAuthToken
                })
            });

            if (saveRes.ok) {
                showStatus('Settings saved successfully!', 'success');
                passwordInput.value = '';
                passwordInput.placeholder = '•••••••• (Token stored)';
            } else {
                const error = await saveRes.json();
                showStatus(`Failed to save settings: ${error.message}`, 'error');
            }
        } catch (e) {
            showStatus(`Error saving settings: ${e.message}`, 'error');
        }
    });
});
