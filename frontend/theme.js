function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    }

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        // Set initial icon
        updateToggleIcon(themeToggle, savedTheme);
        
        themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            const newTheme = isLight ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            updateToggleIcon(themeToggle, newTheme);
        });
    }
}

function updateToggleIcon(btn, theme) {
    if (theme === 'light') {
        btn.innerHTML = `
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>`; // Moon icon for light mode (to switch back to dark)
    } else {
        btn.innerHTML = `
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5"></circle>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
            </svg>`; // Sun icon for dark mode
    }
}

document.addEventListener('DOMContentLoaded', initTheme);
