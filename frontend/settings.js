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

            if (response.ok && result.status === 'success') {
                showStatus(`Conectado como ${result.user.full_name}`, 'success');
                currentAuthToken = result.user.auth_token;
                currentUserId = result.user.id;
            } else {
                showStatus(`Conexión fallida: ${result.message}`, 'error');
            }
        } catch (e) {
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
                if (authRes.ok && authResult.status === 'success') {
                    currentAuthToken = authResult.user.auth_token;
                    currentUserId = authResult.user.id;
                } else {
                    showStatus(`Validacion fallida: ${authResult.message}. Config no guardada.`, 'error');
                    return;
                }
            } catch (e) {
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

            if (saveRes.ok) {
                showStatus('Configuración guardada correctamente!', 'success');
                passwordInput.value = '';
                passwordInput.placeholder = '•••••••• (Token guardado)';
            } else {
                const error = await saveRes.json();
                showStatus(`Error al guardar configuración: ${error.message}`, 'error');
            }
        } catch (e) {
            showStatus(`Error al guardar configuración: ${e.message}`, 'error');
        }
    });
});
