document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('settings-form');
    const domainInput = document.getElementById('taiga-domain');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const testBtn = document.getElementById('test-connection');
    const statusBox = document.getElementById('status-message');

    let currentAuthToken = '';
    let currentUserId = 7;

    // Load current settings
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        domainInput.value = settings.taiga_domain || '';
        usernameInput.value = settings.username || '';
        currentAuthToken = settings.auth_token || '';
        currentUserId = settings.user_id || 7;

        if (currentAuthToken) {
            passwordInput.placeholder = '•••••••• (Token guardado)';
        }
    } catch (e) {
        console.error('Error al cargar configuración:', e);
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
            showStatus('Por favor, complete todos los campos para probar la conexión.', 'error');
            return;
        }

        showStatus('Probar conexión...', 'info');
        testBtn.disabled = true;

        try {
            const response = await fetch('/api/auth/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain, username, password })
            });

            const result = await response.json();
            console.log('[DEBUG] Auth validation response:', {
                status: response.status,
                ok: response.ok,
                body: result
            });

            if (response.ok && result.status === 'success') {
                if (result.signature) {
                    console.log('%c' + result.signature, 'color: #38bdf8; font-weight: bold; font-family: monospace;');
                }
                showStatus(`Conectado como ${result.user.full_name}`, 'success');
                currentAuthToken = result.user.auth_token;
                currentUserId = result.user.id;
            } else {
                const errorMsg = result.message || 'Error desconocido';
                showStatus(`Conexión fallida: ${errorMsg}`, 'error');
                console.error('[ERROR] Conexión fallida:', result);
            }
        } catch (e) {
            console.error('[ERROR] Error en petición de autenticación:', e);
            showStatus(`Error al conectar al servidor: ${e.message}`, 'error');
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
            showStatus('Validando y guardando...', 'info');
            try {
                const authRes = await fetch('/api/auth/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain, username, password })
                });

                const authResult = await authRes.json();
                console.log('[DEBUG] Auth validation result (during save):', authResult);
                
                if (authRes.ok && authResult.status === 'success') {
                    currentAuthToken = authResult.user.auth_token;
                    currentUserId = authResult.user.id;
                } else {
                    showStatus(`Validación fallida: ${authResult.message}. Config no guardada.`, 'error');
                    console.error('[ERROR] Validation failed:', authResult);
                    return;
                }
            } catch (e) {
                console.error('[ERROR] Error during validation:', e);
                showStatus(`Error al validar credenciales: ${e.message}`, 'error');
                return;
            }
        }

        if (!currentAuthToken) {
            showStatus('No hay Token. Por favor, ingrese una contraseña para autenticarse.', 'error');
            return;
        }

        try {
            const saveRes = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taiga_domain: domain,
                    username: username,
                    auth_token: currentAuthToken,
                    user_id: currentUserId
                })
            });

            console.log('[DEBUG] Save settings response status:', saveRes.status);

            if (saveRes.ok) {
                showStatus('Configuración guardada correctamente!', 'success');
                passwordInput.value = '';
                passwordInput.placeholder = '•••••••• (Token guardado)';
            } else {
                const error = await saveRes.json();
                console.error('[ERROR] Failed to save settings:', error);
                showStatus(`Error al guardar configuración: ${error.message}`, 'error');
            }
        } catch (e) {
            console.error('[ERROR] Error saving settings:', e);
            showStatus(`Error al guardar configuración: ${e.message}`, 'error');
        }
    });
});
