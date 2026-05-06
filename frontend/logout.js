document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('logoutBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        // Clear only our keys (safer) and then redirect to settings
        try {
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('user_id');
            sessionStorage.removeItem('username');
            // If you prefer to clear everything in sessionStorage use:
            // sessionStorage.clear();
        } catch (e) {
            console.warn('Error clearing sessionStorage during logout', e);
        }
        window.location.href = 'settings.html';
    });
});
