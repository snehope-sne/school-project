// Mobile Navigation Toggle
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        hamburger.classList.toggle('active');
    });
}

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        if (hamburger) {
            hamburger.classList.remove('active');
        }
    });
});

// Toggle Password Visibility
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');

togglePassword.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    const eyeIcon = togglePassword.querySelector('.eye-icon');
    eyeIcon.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
});

// Email Validation
function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

// Password Validation
function validatePassword(password) {
    return password.length >= 6;
}

// Show Error Message
function showError(inputId, message) {
    const input = document.getElementById(inputId);
    const errorSpan = document.getElementById(`${inputId}Error`);
    input.classList.add('error');
    input.classList.remove('success');
    errorSpan.textContent = message;
    errorSpan.classList.add('show');
    input.parentElement.classList.add('shake');
    setTimeout(() => {
        input.parentElement.classList.remove('shake');
    }, 500);
}

// Show Success
function showSuccess(inputId) {
    const input = document.getElementById(inputId);
    const errorSpan = document.getElementById(`${inputId}Error`);
    input.classList.remove('error');
    input.classList.add('success');
    errorSpan.classList.remove('show');
}

// Clear Error
function clearError(inputId) {
    const input = document.getElementById(inputId);
    const errorSpan = document.getElementById(`${inputId}Error`);
    input.classList.remove('error');
    input.classList.remove('success');
    errorSpan.classList.remove('show');
}

// Real-time Email Validation
const emailInput = document.getElementById('email');
let emailTimeout;

emailInput.addEventListener('input', () => {
    clearTimeout(emailTimeout);
    clearError('email');
    emailTimeout = setTimeout(() => {
        const email = emailInput.value.trim();
        if (email === '') {
            clearError('email');
        } else if (!validateEmail(email)) {
            showError('email', 'Please enter a valid email address');
        } else {
            showSuccess('email');
        }
    }, 500);
});

// Real-time Password Validation
passwordInput.addEventListener('input', () => {
    const password = passwordInput.value;
    if (password === '') {
        clearError('password');
    } else if (!validatePassword(password)) {
        showError('password', 'Password must be at least 6 characters');
    } else {
        showSuccess('password');
    }
});

// Form Submission
const loginForm = document.getElementById('loginForm');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email     = emailInput.value.trim();
    const password  = passwordInput.value;
    const rememberMe = document.getElementById('rememberMe').checked;

    let isValid = true;

    // Validate Email
    if (email === '') {
        showError('email', 'Email is required');
        isValid = false;
    } else if (!validateEmail(email)) {
        showError('email', 'Please enter a valid email address');
        isValid = false;
    } else {
        showSuccess('email');
    }

    // Validate Password
    if (password === '') {
        showError('password', 'Password is required');
        isValid = false;
    } else if (!validatePassword(password)) {
        showError('password', 'Password must be at least 6 characters');
        isValid = false;
    } else {
        showSuccess('password');
    }

    if (!isValid) return;

    // Show loading state
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.classList.add('loading');
    submitButton.innerHTML = '<span>Logging in...</span>';

    try {
        // ── REAL API CALL to /backend/login.php ──────────────────────
        const response = await fetch('../backend/login.php', {
            method: 'POST',
            credentials: 'include',                               // send/receive cookies
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ email, password, rememberMe })
        });

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error('Server returned an unexpected response. Please try again.');
        }

        // If the server signals an error, throw so the catch block handles it
        if (data.status !== 'success') {
            throw new Error(data.message || 'Invalid email or password.');
        }
        // ─────────────────────────────────────────────────────────────

        // Save user session for other pages to read
        sessionStorage.setItem('userLoggedIn', 'true');
        sessionStorage.setItem('userEmail', email);
        sessionStorage.setItem('dashboardUser', JSON.stringify(data.user));

        showNotification('Login successful! Redirecting...', 'success');

        // Role-based redirect — backend tells us where to go
        setTimeout(() => {
            window.location.href = '/RENT2/' + (data.redirect || 'index.html');
            console.log(sessionStorage.getItem('dashboardUser'));
        }, 3000);

    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message || 'Login failed. Please check your credentials and try again.', 'error');
        submitButton.classList.remove('loading');
        submitButton.innerHTML = originalButtonText;
    }
});

// Clear both fields on page load to defeat any browser-cached autofill
window.addEventListener('DOMContentLoaded', () => {
    emailInput.value = '';
    passwordInput.value = '';
});

// Social Login Handlers
document.querySelector('.btn-google').addEventListener('click', () => {
    showNotification('Google login coming soon!', 'info');
});

document.querySelector('.btn-facebook').addEventListener('click', () => {
    showNotification('Facebook login coming soon!', 'info');
});

// Notification System
function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) existingNotification.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close">&times;</button>
    `;

    const bgColor = type === 'success' ? '#4caf50' :
                    type === 'error'   ? '#f44336' :
                    type === 'info'    ? '#ff6b35' : '#2196F3';

    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 15px;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
        font-size: 0.95rem;
    `;

    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.style.cssText = `
        background: none; border: none; color: white;
        font-size: 1.5rem; cursor: pointer; padding: 0;
        line-height: 1; opacity: 0.8; transition: opacity 0.3s ease;
    `;
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.8');
    closeBtn.addEventListener('click', () => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    });

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(400px); opacity: 0; }
        to   { transform: translateX(0);     opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0);     opacity: 1; }
        to   { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Prevent form resubmission on page refresh
if (window.history.replaceState) {
    window.history.replaceState(null, null, window.location.href);
}

// Enter key on password field triggers submit
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        loginForm.dispatchEvent(new Event('submit'));
    }
});

// Escape key clears the form
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        emailInput.value = '';
        passwordInput.value = '';
        clearError('email');
        clearError('password');
        document.getElementById('rememberMe').checked = false;
    }
});

// Focus first empty input on load
window.addEventListener('load', () => {
    if (!emailInput.value) {
        emailInput.focus();
    } else {
        passwordInput.focus();
    }
});

console.log('%cWelcome to Rent A Car Login! 🔐', 'color: #ff6b35; font-size: 20px; font-weight: bold;');
console.log('%cSecure Login System', 'color: #f7931e; font-size: 16px;');