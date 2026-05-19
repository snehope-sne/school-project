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

// Multi-step form navigation
let currentStep = 1;
const totalSteps = 4;

// Update progress
function updateProgress() {
    const progressFill = document.getElementById('progressFill');
    const percentage = (currentStep / totalSteps) * 100;
    progressFill.style.width = percentage + '%';

    document.querySelectorAll('.step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.remove('active', 'completed');
        if (stepNum === currentStep) {
            step.classList.add('active');
        } else if (stepNum < currentStep) {
            step.classList.add('completed');
        }
    });
}

// Show specific step
function showStep(stepNumber) {
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.remove('active');
    });

    const targetStep = document.querySelector(`.form-step[data-step="${stepNumber}"]`);
    if (targetStep) {
        targetStep.classList.add('active');
        currentStep = stepNumber;
        updateProgress();
        targetStep.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Next button handlers
document.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', async () => {
        const nextStep = parseInt(btn.dataset.next);

        // Step 1 requires async duplicate check before advancing
        if (currentStep === 1) {
            const ok = await validateStep1Async();
            if (ok) showStep(nextStep);
        } else if (validateStep(currentStep)) {
            showStep(nextStep);
        }
    });
});

// Previous button handlers
document.querySelectorAll('[data-prev]').forEach(btn => {
    btn.addEventListener('click', () => {
        const prevStep = parseInt(btn.dataset.prev);
        showStep(prevStep);
    });
});

// Validation Helpers
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    return password.length >= 8;
}

function validatePhone(phone) {
    return phone.length >= 8;
}

function showError(inputId, message) {
    const input = document.getElementById(inputId);
    const errorSpan = document.getElementById(`${inputId}Error`);

    if (input && errorSpan) {
        input.classList.add('error');
        input.classList.remove('success');
        errorSpan.textContent = message;
        errorSpan.classList.add('show');

        input.parentElement.classList.add('shake');
        setTimeout(() => {
            input.parentElement.classList.remove('shake');
        }, 500);
    }
}

function showSuccess(inputId) {
    const input = document.getElementById(inputId);
    const errorSpan = document.getElementById(`${inputId}Error`);

    if (input && errorSpan) {
        input.classList.remove('error');
        input.classList.add('success');
        errorSpan.classList.remove('show');
    }
}

function clearError(inputId) {
    const input = document.getElementById(inputId);
    const errorSpan = document.getElementById(`${inputId}Error`);

    if (input && errorSpan) {
        input.classList.remove('error', 'success');
        errorSpan.classList.remove('show');
    }
}

// -------------------------------------------------------
// Duplicate-check helper (calls the PHP back-end)
// type: 'id' | 'email'
// -------------------------------------------------------
async function checkDuplicate(type, value) {
    try {
        const formData = new FormData();
        formData.append('checkType', type);
        formData.append('value', value);

        const response = await fetch('https://school-project-psaa.onrender.com/check_duplicate.php', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        // Log raw response text first so we can see PHP errors in console
        const rawText = await response.text();
        console.log(`[checkDuplicate] type=${type} status=${response.status} raw:`, rawText);

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            console.error('[checkDuplicate] JSON parse failed. PHP likely returned an error page:', rawText);
            // Return a special flag so callers know the check itself failed
            return { exists: false, checkFailed: true };
        }

        // If PHP included an 'error' key (from our catch block), log it
        if (data.error) {
            console.error('[checkDuplicate] PHP reported DB error:', data.error);
            return { exists: false, checkFailed: true };
        }

        return data; // { exists: true|false, message: '...' }

    } catch (networkErr) {
        console.error('[checkDuplicate] Network/fetch error:', networkErr);
        return { exists: false, checkFailed: true };
    }
}

// -------------------------------------------------------
// Step 1 async validation (ID + email duplicate checks)
// -------------------------------------------------------
async function validateStep1Async() {
    const idNumber = document.getElementById('id_number').value.trim();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirm  = document.getElementById('confirm').value;

    let isValid = true;

    // --- ID Number ---
    if (idNumber === '') {
        showError('id_number', 'National ID is required');
        isValid = false;
    } else if (!/^\d+$/.test(idNumber)) {
        showError('id_number', 'ID Number must contain only digits');
        isValid = false;
    } else if (idNumber.length !== 13) {
        showError('id_number', `ID Number must be exactly 13 digits (you entered ${idNumber.length})`);
        isValid = false;
    } else {
        // Live duplicate check
        const idCheck = await checkDuplicate('id', idNumber);
        if (idCheck.checkFailed) {
            showError('id_number', 'Could not verify ID against database. Please try again.');
            isValid = false;
        } else if (idCheck.exists) {
            showError('id_number', 'An account with this National ID already exists');
            isValid = false;
        } else {
            showSuccess('id_number');
        }
    }

    // --- Email ---
    if (email === '') {
        showError('email', 'Email is required');
        isValid = false;
    } else if (!validateEmail(email)) {
        showError('email', 'Please enter a valid email address');
        isValid = false;
    } else {
        // Live duplicate check
        const emailCheck = await checkDuplicate('email', email);
        if (emailCheck.checkFailed) {
            showError('email', 'Could not verify email against database. Please try again.');
            isValid = false;
        } else if (emailCheck.exists) {
            showError('email', 'An account with this email address already exists');
            isValid = false;
        } else {
            showSuccess('email');
        }
    }

    // --- Password ---
    if (password === '') {
        showError('password', 'Password is required');
        isValid = false;
    } else if (!validatePassword(password)) {
        showError('password', 'Password must be at least 8 characters');
        isValid = false;
    } else {
        showSuccess('password');
    }

    // --- Confirm Password ---
    if (confirm === '') {
        showError('confirm', 'Please confirm your password');
        isValid = false;
    } else if (password !== confirm) {
        showError('confirm', 'Passwords do not match');
        isValid = false;
    } else {
        showSuccess('confirm');
    }

    return isValid;
}

// -------------------------------------------------------
// Synchronous step validation (steps 2, 3, 4)
// -------------------------------------------------------
function validateStep(step) {
    let isValid = true;

    switch (step) {
        case 2: // Personal Information (ID has moved to step 1)
            const firstName = document.getElementById('first_name').value.trim();
            const lastName  = document.getElementById('last_name').value.trim();
            const phone     = document.getElementById('phone').value.trim();
            const address   = document.getElementById('phys_address').value.trim();
            const workPhone = document.getElementById('work_phone').value.trim();
            const city      = document.getElementById('city').value.trim();
            const country   = document.getElementById('country').value.trim();

            if (!firstName || !lastName || !phone || !address || !workPhone || !city || !country) {
                showNotification('Please fill in all required fields', 'error');
                isValid = false;
            } else if (!validatePhone(phone)) {
                showNotification('Please enter a valid phone number', 'error');
                isValid = false;
            } else if (!validatePhone(workPhone)) {
                showNotification('Please enter a valid work phone number', 'error');
                isValid = false;
            }
            break;

        case 3: // License Information
            const licenseFront = document.getElementById('license_front').files[0];
            const licenseBack  = document.getElementById('license_back').files[0];

            if (!licenseFront) {
                showNotification('Please upload the front of your license', 'error');
                isValid = false;
            }
            if (!licenseBack) {
                showNotification('Please upload the back of your license', 'error');
                isValid = false;
            }
            break;
    }

    return isValid;
}

// Toggle Password Visibility
document.getElementById('togglePassword')?.addEventListener('click', function () {
    const passwordInput = document.getElementById('password');
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    this.querySelector('.eye-icon').textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
});

document.getElementById('toggleConfirm')?.addEventListener('click', function () {
    const confirmInput = document.getElementById('confirm');
    const type = confirmInput.getAttribute('type') === 'password' ? 'text' : 'password';
    confirmInput.setAttribute('type', type);
    this.querySelector('.eye-icon').textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
});

// Password Strength Indicator
const passwordInput = document.getElementById('password');
const strengthBar   = document.getElementById('strengthBar');

passwordInput?.addEventListener('input', () => {
    const password = passwordInput.value;
    let strength = 0;

    if (password.length >= 8)         strength++;
    if (/[A-Z]/.test(password))       strength++;
    if (/[0-9]/.test(password))       strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    strengthBar.style.width = ((strength / 4) * 100) + '%';
    if (password) clearError('password');
});

// -------------------------------------------------------
// Real-time Email Validation + live DB duplicate check
// -------------------------------------------------------
const emailInput = document.getElementById('email');
let emailChecking = false;
let emailTimeout;

emailInput?.addEventListener('input', () => {
    // User is editing again — cancel any pending check and reset state
    emailChecking = false;
    clearTimeout(emailTimeout);
    clearError('email');

    const email = emailInput.value.trim();

    if (email === '') return;

    if (!validateEmail(email)) {
        showError('email', 'Please enter a valid email address');
        return;
    }

    // Format valid — show checking state and hit the DB
    setFieldChecking('email');
    emailChecking = true;

    emailTimeout = setTimeout(async () => {
        const check = await checkDuplicate('email', email);
        emailChecking = false;

        if (check.checkFailed) {
            showError('email', '⚠️ Could not verify email — please try again');
        } else if (check.exists) {
            showError('email', '⚠️ An account with this email address already exists');
        } else {
            showSuccess('email');
        }
    }, 600);
});

// -------------------------------------------------------
// Digits-only input guard (blocks non-numeric keystrokes)
// -------------------------------------------------------
function enforceDigitsOnly(input) {
    // Block non-digit key presses (allows: digits, Backspace, Delete, Tab, arrows, Home/End)
    input.addEventListener('keydown', (e) => {
        const allowed = [
            'Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'
        ];
        if (!allowed.includes(e.key) && !/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
        }
    });

    // Strip any non-digit characters that sneak in via paste or autofill
    input.addEventListener('input', () => {
        const pos   = input.selectionStart;
        const clean = input.value.replace(/\D/g, '');
        if (input.value !== clean) {
            input.value = clean;
            input.setSelectionRange(Math.max(0, pos - 1), Math.max(0, pos - 1));
        }
    });
}

// Apply digits-only guard to ID number field
const idInput = document.getElementById('id_number');
if (idInput) enforceDigitsOnly(idInput);

// Apply digits-only + optional leading '+' guard to phone fields
['phone','work_phone','kin_phone'].forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.addEventListener('keydown', (e) => {
        const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
        if (e.key === '+' && el.selectionStart === 0) return;
        if (!allowed.includes(e.key) && !/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
        }
    });
    el.addEventListener('input', () => {
        const hasPlus = el.value.startsWith('+');
        const digits  = el.value.replace(/\D/g, '');
        el.value = hasPlus ? '+' + digits : digits;
    });
});

// -------------------------------------------------------
// Real-time ID Number Validation + live DB duplicate check
// -------------------------------------------------------

// State flags — prevent clearError() from wiping a result
// that came back from the DB after the async check completed
let idChecking   = false;
let idTimeout;

function setFieldChecking(inputId) {
    const input     = document.getElementById(inputId);
    const errorSpan = document.getElementById(`${inputId}Error`);
    if (!input || !errorSpan) return;
    input.classList.remove('error', 'success');
    errorSpan.textContent = '⏳ Checking...';
    errorSpan.style.color = '#888';
    errorSpan.classList.add('show');
}

idInput?.addEventListener('input', () => {
    // User is editing — cancel any pending check and reset state
    idChecking = false;
    clearTimeout(idTimeout);
    clearError('id_number');

    const val = idInput.value.trim();

    if (val === '') return;

    if (!/^\d+$/.test(val)) {
        showError('id_number', 'ID Number must contain only digits');
        return;
    }
    if (val.length > 13) {
        showError('id_number', 'ID Number cannot exceed 13 digits');
        return;
    }
    if (val.length < 13) {
        showError('id_number', `ID Number must be exactly 13 digits (${val.length}/13 entered)`);
        return;
    }

    // Exactly 13 digits — show checking state and hit the DB
    setFieldChecking('id_number');
    idChecking = true;

    idTimeout = setTimeout(async () => {
        const check = await checkDuplicate('id', val);
        // Mark done so future clearError calls are safe
        idChecking = false;

        if (check.checkFailed) {
            showError('id_number', '⚠️ Could not verify ID — please try again');
        } else if (check.exists) {
            showError('id_number', '⚠️ An account with this National ID already exists');
        } else {
            showSuccess('id_number');
        }
    }, 500);
});

// Confirm Password Validation
document.getElementById('confirm')?.addEventListener('input', () => {
    const password = document.getElementById('password').value;
    const confirm  = document.getElementById('confirm').value;

    if (confirm === '') {
        clearError('confirm');
    } else if (password !== confirm) {
        showError('confirm', 'Passwords do not match');
    } else {
        showSuccess('confirm');
    }
});

// File Upload Handlers
function setupFileUpload(inputId, previewId, uploadAreaId) {
    const input      = document.getElementById(inputId);
    const preview    = document.getElementById(previewId);
    const uploadArea = document.getElementById(uploadAreaId);

    if (!input || !preview || !uploadArea) return;

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `<img src="${e.target.result}" alt="License preview">`;
                preview.classList.add('show');
                uploadArea.classList.add('has-file');
            };
            reader.readAsDataURL(file);
        }
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary-orange)';
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#e0e0e0';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#e0e0e0';

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            input.files = e.dataTransfer.files;
            input.dispatchEvent(new Event('change'));
        }
    });
}

setupFileUpload('license_front', 'previewFront', 'frontUploadArea');
setupFileUpload('license_back',  'previewBack',  'backUploadArea');

// Form Submission
const registrationForm = document.getElementById('registrationForm');

registrationForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Full re-validation before submit (step 1 is async)
    const step1Ok = await validateStep1Async();
    if (!step1Ok || !validateStep(2) || !validateStep(3)) {
        showNotification('Please complete all required fields correctly.', 'error');
        return;
    }

    const terms = document.getElementById('terms');
    if (!terms || !terms.checked) {
        showNotification('Please agree to the terms and conditions', 'error');
        return;
    }

    const submitButton      = registrationForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.classList.add('loading');
    submitButton.innerHTML = '<span>Processing...</span>';

    try {
        const formData = new FormData();

        // Step 1 fields (ID now here)
        formData.append('idNumber',        document.getElementById('id_number').value.trim());
        formData.append('email',           document.getElementById('email').value.trim());
        formData.append('password',        document.getElementById('password').value);
        formData.append('confirmPassword', document.getElementById('confirm').value);

        // Step 2 personal fields
        formData.append('firstName', document.getElementById('first_name').value.trim());
        formData.append('lastName',  document.getElementById('last_name').value.trim());
        formData.append('phone',     document.getElementById('phone').value.trim());
        formData.append('address',   document.getElementById('phys_address').value.trim());
        formData.append('workPhone', document.getElementById('work_phone').value.trim());
        formData.append('city',      document.getElementById('city').value.trim());
        formData.append('country',   document.getElementById('country').value.trim());

        // Step 4 next of kin fields
        formData.append('kinFirstName', document.getElementById('kin_first').value.trim());
        formData.append('kinLastName',  document.getElementById('kin_last').value.trim());
        formData.append('kinPhone',     document.getElementById('kin_phone').value.trim());
        formData.append('kinAddress',   document.getElementById('kin_address').value.trim());

        // License files
        formData.append('licenseFront', document.getElementById('license_front').files[0]);
        formData.append('licenseBack',  document.getElementById('license_back').files[0]);

        const response = await fetch('https://school-project-psaa.onrender.com/register.php', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error('Server returned an unexpected response. Please try again.');
        }

        if (data.status !== 'success') {
            const msg = data.errors ? data.errors.join('\n') : (data.message || 'Registration failed.');
            throw new Error(msg);
        }

        showNotification('Registration successful! Redirecting to login...', 'success');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);

    } catch (error) {
        console.error('Registration error:', error);
        showNotification(error.message || 'Registration failed. Please try again.', 'error');
        submitButton.classList.remove('loading');
        submitButton.innerHTML = originalButtonText;
    }
});

// -------------------------------------------------------
// Modal Alert System — stays until user clicks OK
// -------------------------------------------------------
function showNotification(message, type = 'info') {
    // Remove any existing modal first
    const existing = document.getElementById('alertModal');
    if (existing) existing.remove();

    const icon = type === 'success' ? '✅' :
                 type === 'error'   ? '❌' : 'ℹ️';

    const accentColor = type === 'success' ? '#4caf50' :
                        type === 'error'   ? '#e53935' :
                        '#ff6b35';

    const modal = document.createElement('div');
    modal.id = 'alertModal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'alertModalTitle');
    modal.setAttribute('aria-describedby', 'alertModalMsg');

    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        animation: modalFadeIn 0.2s ease;
        padding: 16px;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        padding: 40px 36px 32px;
        max-width: 420px;
        width: 100%;
        text-align: center;
        animation: modalSlideUp 0.25s ease;
        border-top: 5px solid ${accentColor};
    `;

    box.innerHTML = `
        <div style="font-size:3rem; margin-bottom:12px; line-height:1;">${icon}</div>
        <h2 id="alertModalTitle" style="
            margin: 0 0 12px;
            font-size: 1.2rem;
            font-weight: 700;
            color: #1a1a2e;
            text-transform: capitalize;
        ">${type === 'success' ? 'Success' : type === 'error' ? 'Please Fix the Following' : 'Notice'}</h2>
        <p id="alertModalMsg" style="
            margin: 0 0 28px;
            color: #444;
            font-size: 0.97rem;
            line-height: 1.6;
            white-space: pre-line;
        ">${message}</p>
        <button id="alertModalOk" style="
            background: ${accentColor};
            color: #fff;
            border: none;
            padding: 13px 48px;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s, transform 0.15s;
            letter-spacing: 0.03em;
        ">OK</button>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    const okBtn = document.getElementById('alertModalOk');

    function closeModal() {
        modal.style.animation = 'modalFadeOut 0.2s ease forwards';
        setTimeout(() => { if (modal.parentElement) modal.remove(); }, 200);
    }

    okBtn.addEventListener('click', closeModal);
    okBtn.addEventListener('mouseenter', () => { okBtn.style.opacity = '0.88'; okBtn.style.transform = 'scale(1.03)'; });
    okBtn.addEventListener('mouseleave', () => { okBtn.style.opacity = '1';    okBtn.style.transform = 'scale(1)'; });

    // Close on backdrop click
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Close on Escape key
    function onKeyDown(e) {
        if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKeyDown); }
    }
    document.addEventListener('keydown', onKeyDown);

    // Focus OK button for accessibility
    okBtn.focus();
}

// Modal animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes modalFadeIn  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes modalFadeOut { from { opacity: 1; } to { opacity: 0; } }
    @keyframes modalSlideUp {
        from { transform: translateY(30px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
    }
    #alertModalOk:focus { outline: 3px solid rgba(0,0,0,0.25); outline-offset: 2px; }
`;
document.head.appendChild(style);

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    updateProgress();
    showStep(1);

    // Clear all inputs on load to defeat any browser-cached autofill
    document.querySelectorAll('#registrationForm input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]), #registrationForm textarea').forEach(el => {
        el.value = '';
    });

    const idNumberInput = document.getElementById('id_number');
    if (idNumberInput) idNumberInput.focus();
});

// Prevent form resubmission on page refresh
if (window.history.replaceState) {
    window.history.replaceState(null, null, window.location.href);
}

console.log('%cWelcome to Rent A Car Registration! 🚗', 'color: #ff6b35; font-size: 20px; font-weight: bold;');
console.log('%cSecure Registration System', 'color: #f7931e; font-size: 16px;');