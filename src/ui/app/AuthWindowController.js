import './AuthHeader.js';

window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('auth-container');
    if (!container) return;

    container.innerHTML = '';

    const authHeader = document.createElement('auth-header');
    if (typeof authHeader.startSlideInAnimation === 'function') {
        authHeader.startSlideInAnimation();
    }

    container.appendChild(authHeader);
});
