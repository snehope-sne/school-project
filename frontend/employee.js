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
const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');

togglePassword.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    const eyeIcon = togglePassword.querySelector('.eye-icon');
    eyeIcon.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
});

toggleConfirmPassword.addEventListener('click', () => {
    const type = confirmPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    confirmPasswordInput.setAttribute('type', type);
    const eyeIcon = toggleConfirmPassword.querySelector('.eye-icon');
    eyeIcon.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
});

// Validation Functions
function validateFullName(name) {
    return name.trim().length >= 3 && /^[a-zA-Z\s]+$/.test(name);
}

function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

function validatePhone(phone) {
    // Allow various phone formats
    const regex = /^[\d\s\+\-\(\)]+$/;
    return phone.length >= 8 && regex.test(phone);
}

function validatePassword(password) {
    return password.length >= 8;
}

function checkPasswordStrength(password) {
    let strength = 0;
    const strengthElement = document.getElementById('passwordStrength');
    
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    strengthElement.classList.remove('strength-weak', 'strength-medium', 'strength-strong');
    
    if (password.length === 0) {
        strengthElement.querySelector('.strength-text').textContent = '';
        return;
    }

    if (strength <= 2) {
        strengthElement.classList.add('strength-weak');
        strengthElement.querySelector('.strength-text').textContent = 'Weak password';
    } else if (strength <= 3) {
        strengthElement.classList.add('strength-medium');
        strengthElement.querySelector('.strength-text').textContent = 'Medium password';
    } else {
        strengthElement.classList.add('strength-strong');
        strengthElement.querySelector('.strength-text').textContent = 'Strong password';
    }
}

// Show Error Message
function showError(inputId, message) {
    const input = document.getElementById(inputId);
    const errorSpan = document.getElementById(`${inputId}Error`);
    if (input) {
        input.classList.add('error');
        input.classList.remove('success');
        if (input.parentElement) {
            input.parentElement.classList.add('shake');
            setTimeout(() => {
                input.parentElement.classList.remove('shake');
            }, 500);
        }
    }
    if (errorSpan) {
        errorSpan.textContent = message;
        errorSpan.classList.add('show');
    }
}

// Show Success
function showSuccess(inputId) {
    const input = document.getElementById(inputId);
    const errorSpan = document.getElementById(`${inputId}Error`);
    if (input) {
        input.classList.remove('error');
        input.classList.add('success');
    }
    if (errorSpan) {
        errorSpan.classList.remove('show');
    }
}

// Clear Error
function clearError(inputId) {
    const input = document.getElementById(inputId);
    const errorSpan = document.getElementById(`${inputId}Error`);
    if (input) {
        input.classList.remove('error');
        input.classList.remove('success');
    }
    if (errorSpan) {
        errorSpan.classList.remove('show');
    }
}

// Real-time Full Name Validation
const fullNameInput = document.getElementById('fullName');
let fullNameTimeout;

fullNameInput.addEventListener('input', () => {
    clearTimeout(fullNameTimeout);
    clearError('fullName');
    fullNameTimeout = setTimeout(() => {
        const name = fullNameInput.value.trim();
        if (name === '') {
            clearError('fullName');
        } else if (!validateFullName(name)) {
            showError('fullName', 'Please enter a valid full name (letters only, minimum 3 characters)');
        } else {
            showSuccess('fullName');
        }
    }, 500);
});

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

// Real-time Phone Validation
const phoneInput = document.getElementById('phone');
let phoneTimeout;

phoneInput.addEventListener('input', () => {
    clearTimeout(phoneTimeout);
    clearError('phone');
    phoneTimeout = setTimeout(() => {
        const phone = phoneInput.value.trim();
        if (phone === '') {
            clearError('phone');
        } else if (!validatePhone(phone)) {
            showError('phone', 'Please enter a valid phone number');
        } else {
            showSuccess('phone');
        }
    }, 500);
});

// Real-time Password Validation and Strength Check
passwordInput.addEventListener('input', () => {
    const password = passwordInput.value;
    checkPasswordStrength(password);
    
    if (password === '') {
        clearError('password');
    } else if (!validatePassword(password)) {
        showError('password', 'Password must be at least 8 characters');
    } else {
        showSuccess('password');
    }

    // Also check confirm password if it has value
    if (confirmPasswordInput.value) {
        if (password !== confirmPasswordInput.value) {
            showError('confirmPassword', 'Passwords do not match');
        } else {
            showSuccess('confirmPassword');
        }
    }
});

// Real-time Confirm Password Validation
confirmPasswordInput.addEventListener('input', () => {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    
    if (confirmPassword === '') {
        clearError('confirmPassword');
    } else if (password !== confirmPassword) {
        showError('confirmPassword', 'Passwords do not match');
    } else {
        showSuccess('confirmPassword');
    }
});

// Form Submission
const registrationForm = document.getElementById('employeeRegistrationForm');

registrationForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const terms = document.getElementById('terms').checked;
    
    // Get selected role
    const roleAdmin = document.getElementById('roleAdmin');
    const roleAgent = document.getElementById('roleAgent');
    const role = roleAdmin.checked ? 'admin' : roleAgent.checked ? 'rental_agent' : '';

    let isValid = true;

    // Validate Full Name
    if (fullName === '') {
        showError('fullName', 'Full name is required');
        isValid = false;
    } else if (!validateFullName(fullName)) {
        showError('fullName', 'Please enter a valid full name');
        isValid = false;
    } else {
        showSuccess('fullName');
    }

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

    // Validate Phone
    if (phone === '') {
        showError('phone', 'Phone number is required');
        isValid = false;
    } else if (!validatePhone(phone)) {
        showError('phone', 'Please enter a valid phone number');
        isValid = false;
    } else {
        showSuccess('phone');
    }

    // Validate Role Selection
    if (!role) {
        showError('role', 'Please select an employee role');
        isValid = false;
    } else {
        clearError('role');
    }

    // Validate Password
    if (password === '') {
        showError('password', 'Password is required');
        isValid = false;
    } else if (!validatePassword(password)) {
        showError('password', 'Password must be at least 8 characters');
        isValid = false;
    } else {
        showSuccess('password');
    }

    // Validate Confirm Password
    if (confirmPassword === '') {
        showError('confirmPassword', 'Please confirm your password');
        isValid = false;
    } else if (password !== confirmPassword) {
        showError('confirmPassword', 'Passwords do not match');
        isValid = false;
    } else {
        showSuccess('confirmPassword');
    }

    // Validate Terms
    if (!terms) {
        showError('terms', 'You must agree to the terms and conditions');
        isValid = false;
    } else {
        clearError('terms');
    }

    if (!isValid) return;

    // Show loading state
    const submitButton = registrationForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.classList.add('loading');
    submitButton.innerHTML = '<span>Creating Account...</span>';

    try {
        // ── REAL API CALL to /backend/employee_registration.php ──────
        const response = await fetch('https://school-project-psaa.onrender.com/employee.php', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ 
                fullName, 
                email, 
                phone, 
                role, 
                password 
            })
        });

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error('Server returned an unexpected response. Please try again.');
        }

        // If the server signals an error, throw so the catch block handles it
        if (data.status !== 'success') {
            throw new Error(data.message || 'Registration failed. Please try again.');
        }
        // ──────────────────────────────────────────────────────────────

        showNotification('Registration successful! Redirecting to login...', 'success');

        // Redirect to login after success
        setTimeout(() => {
            window.location.href = 'https://school-project-1-xdoe.onrender.com/login.html';
        }, 2000);

    } catch (error) {
        console.error('Registration error:', error);
        showNotification(error.message || 'Registration failed. Please try again.', 'error');
        submitButton.classList.remove('loading');
        submitButton.innerHTML = originalButtonText;
    }
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

// Focus first input on load
window.addEventListener('load', () => {
    fullNameInput.focus();
});

console.log('%cWelcome to Rent A Car Employee Registration! 👥', 'color: #ff6b35; font-size: 20px; font-weight: bold;');
console.log('%cSecure Employee Onboarding System', 'color: #f7931e; font-size: 16px;');