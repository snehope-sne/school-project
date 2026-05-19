// ─────────────────────────────────────────────────────────────
//  DARKETZ Car Rental — Booking Form JS
//  Updated: policy enforcement, payment step, account lookup
// ─────────────────────────────────────────────────────────────

// ── Auth Guard ────────────────────────────────────────────────
(function () {
    if (sessionStorage.getItem('userLoggedIn') !== 'true') {
        window.location.replace('login.html');
    }
})();

// ── Config ───────────────────────────────────────────────────
const BOOKING_API = 'https://school-project-psaa.onrender.com/booking.php';   // adjust path if needed

// ── Booking Fee Policy ────────────────────────────────────────
// Returns { fee, label } based on how many days ahead the pickup is
function getBookingFeeInfo(pickupDateStr) {
    if (!pickupDateStr) return { fee: 50, label: 'Today (within 24 hrs)', days: 1 };

    const now     = new Date();
    const pickup  = new Date(pickupDateStr);
    const diffMs  = pickup - now;
    const diffHrs = diffMs / (1000 * 60 * 60);

    // Even if pickup is same day (diffHrs <= 0 or tiny), treat as today
    if (diffHrs <= 24) return { fee: 50,  label: 'Today (within 24 hrs)',    days: 1 };
    if (diffHrs <= 48) return { fee: 100, label: 'Tomorrow (within 48 hrs)', days: 2 };
    return               { fee: 150, label: 'In 3 days (within 72 hrs)',  days: 3 };
}

// ── State ────────────────────────────────────────────────────
let currentStep    = 0;
const totalSteps   = 5;   // 0-4
let selectedVehicle = null;
let currentFieldToFocus = null;
let isValidating   = false;
let activePayTab   = 'card';   // 'card' | 'account'
let customerAccount = null;    // fetched account info (or null)

// ── Mobile Navigation Toggle ─────────────────────────────────
const hamburger = document.querySelector('.hamburger');
const navLinks  = document.querySelector('.nav-links');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        hamburger.classList.toggle('active');
    });
}

// ── Initialize ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // Auth Nav
    const userData         = JSON.parse(sessionStorage.getItem('dashboardUser') || 'null');
    const profileNav       = document.getElementById('profileNav');
    const profileFirstname = document.getElementById('profileFirstname');

    if (userData && profileNav) {
        profileNav.style.display = 'flex';
        const firstName = userData.firstName || userData.name?.split(' ')[0] || 'User';
        if (profileFirstname) profileFirstname.textContent = firstName;
    }

    if (profileNav) {
        profileNav.addEventListener('click', function (e) {
            e.stopPropagation();
            document.getElementById('profileDropdown')?.classList.toggle('open');
        });
    }

    document.addEventListener('click', function () {
        document.getElementById('profileDropdown')?.classList.remove('open');
    });

    document.getElementById('logoutBtn')?.addEventListener('click', function (e) {
        e.stopPropagation();
        sessionStorage.removeItem('userLoggedIn');
        sessionStorage.removeItem('userEmail');
        sessionStorage.removeItem('dashboardUser');
        sessionStorage.removeItem('selectedVehicle');
        window.location.href = 'login.html';
    });

    loadSelectedVehicle();
    setMinMaxDateTime();
    setupDateListeners();
    setupInputFilters();
    setupSequentialFieldValidation();
    autoFillCustomerProfile();
    setupCardInputFormatting();
});

// ── Load selected vehicle from sessionStorage ─────────────────
function loadSelectedVehicle() {
    const vehicleData = sessionStorage.getItem('selectedVehicle');

    if (!vehicleData) {
        showNotification('Please select a vehicle first', 'error');
        setTimeout(() => { window.location.href = 'vehicles.html'; }, 2000);
        return;
    }

    selectedVehicle = JSON.parse(vehicleData);

    if (!selectedVehicle.price && selectedVehicle.daily_rate) {
        selectedVehicle.price = selectedVehicle.daily_rate;
    }
    if (!selectedVehicle.luggage && selectedVehicle.engine) {
        selectedVehicle.luggage = selectedVehicle.engine;
    }

    displayVehicleConfirmation(selectedVehicle);
}

// ── Auto-fill personal info ───────────────────────────────────
async function autoFillCustomerProfile() {
    const userData = JSON.parse(sessionStorage.getItem('dashboardUser') || 'null');
    const email    = userData?.email || sessionStorage.getItem('userEmail') || '';

    if (!email) return;

    try {
        const res  = await fetch(`${BOOKING_API}?action=getprofile&email=${encodeURIComponent(email)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== 'success') return;

        const c   = data.customer;
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el && val) el.value = val;
        };

        set('idNo',        c.idNumber);
        set('custFname',   c.firstName);
        set('custLname',   c.lastName);
        set('email',       c.email);
        set('phone',       c.phone);
        set('physAddress', c.physAddress);
        set('workPhone',   c.workPhone);
        set('city',        c.city);

        if (c.country) {
            const sel = document.getElementById('country');
            if (sel) sel.value = c.country;
        }

    } catch (err) {
        console.warn('Could not load customer profile:', err);
    }
}

// ── Display vehicle confirmation ──────────────────────────────
function displayVehicleConfirmation(vehicle) {
    const fallbackImg = 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=500&fit=crop';
    const price  = vehicle.price   || vehicle.daily_rate || null;
    const engine = vehicle.luggage || vehicle.engine     || '—';

    const set     = (id, val)       => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setAttr = (id, attr, val) => { const el = document.getElementById(id); if (el) el[attr] = val; };

    setAttr('confirmVehicleImage',    'src', vehicle.image || fallbackImg);
    setAttr('confirmVehicleImage',    'alt', vehicle.name || '');
    set('confirmVehicleName',         vehicle.name || '—');
    set('confirmVehicleCategory',     (vehicle.category || '').toUpperCase());
    set('confirmVehicleSeats',        vehicle.seats ? `${vehicle.seats} Seats` : '—');
    set('confirmVehicleTransmission', vehicle.transmission || '—');
    set('confirmVehicleFuel',         vehicle.fuel || '—');
    set('confirmVehicleEngine',       engine);
    set('confirmVehiclePrice',        price ? `E${price}/day` : '—');

    const featuresList = document.getElementById('confirmVehicleFeatures');
    if (featuresList) {
        const features = Array.isArray(vehicle.features) ? vehicle.features : [];
        featuresList.innerHTML = features.length
            ? features.map(f => `<li>${f}</li>`).join('')
            : '<li>No features listed</li>';
    }

    setAttr('vehicleId',   'value', vehicle.id       || '');
    setAttr('vehicleType', 'value', vehicle.category || '');
    set('summaryVehicleName', vehicle.name || '—');
    set('summaryDailyRate',   price ? `E${price}` : '—');
}

// ── Input filters ─────────────────────────────────────────────
function setupInputFilters() {
    const idNoInput = document.getElementById('idNo');
    if (idNoInput) {
        idNoInput.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '').slice(0, 13);
        });
        idNoInput.addEventListener('blur', function () {
            if (this.value && !isValidating) validateFieldImmediately(this);
        });
    }

    ['custFname', 'custLname'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', function () { this.value = this.value.replace(/[^a-zA-Z\s]/g, ''); });
        el.addEventListener('blur',  function () { if (this.value && !isValidating) validateFieldImmediately(this); });
    });

    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function () { this.value = this.value.replace(/[^0-9]/g, '').slice(0, 8); });
        phoneInput.addEventListener('blur',  function () { if (this.value && !isValidating) validateFieldImmediately(this); });
    }
}

// ── Card input live formatting ────────────────────────────────
function setupCardInputFormatting() {
    const cardNumberInput = document.getElementById('cardNumber');
    const cardHolderInput = document.getElementById('cardHolder');
    const cardExpiryInput = document.getElementById('cardExpiry');

    if (cardNumberInput) {
        cardNumberInput.addEventListener('input', function () {
            let val = this.value.replace(/\D/g, '').slice(0, 16);
            this.value = val.replace(/(.{4})/g, '$1 ').trim();
            const preview = document.getElementById('cardPreviewNumber');
            if (preview) {
                const padded = val.padEnd(16, '*');
                preview.textContent = padded.replace(/(.{4})/g, '$1 ').trim();
                preview.className   = val.length > 0 ? 'card-number-display filled' : 'card-number-display';
            }
        });
    }

    if (cardHolderInput) {
        cardHolderInput.addEventListener('input', function () {
            const preview = document.getElementById('cardPreviewName');
            if (preview) preview.textContent = this.value.toUpperCase() || 'YOUR NAME';
        });
    }

    if (cardExpiryInput) {
        cardExpiryInput.addEventListener('input', function () {
            let val = this.value.replace(/\D/g, '').slice(0, 4);
            if (val.length >= 3) val = val.slice(0, 2) + '/' + val.slice(2);
            this.value = val;
            const preview = document.getElementById('cardPreviewExpiry');
            if (preview) preview.textContent = this.value || 'MM/YY';
        });
    }

    // CVV — just numbers
    const cvvInput = document.getElementById('cardCvv');
    if (cvvInput) {
        cvvInput.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 3);
        });
    }
}

// ── Sequential field validation ───────────────────────────────
function setupSequentialFieldValidation() {
    const step2Fields = ['pickupDate', 'returnDate'];
    step2Fields.forEach((fieldId, index) => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.addEventListener('focus', function () {
            for (let i = 0; i < index; i++) {
                const prevField = document.getElementById(step2Fields[i]);
                if (prevField && (!prevField.value || !prevField.value.trim())) {
                    isValidating = true;
                    showValidationErrorModal(
                        `Please fill in ${prevField.labels[0]?.textContent.replace(' *', '') || 'the previous field'} before proceeding.`
                    );
                    currentFieldToFocus = prevField;
                    return;
                }
            }
        });
    });
}

// ── Validate single field on blur ─────────────────────────────
function validateFieldImmediately(field) {
    if (!field.value || !field.value.trim()) return;

    const rules = {
        idNo:      { fn: validateIdFormat,    msg: 'ID Number must be exactly 13 digits' },
        custFname: { fn: validateNameFormat,  msg: 'First Name must have at least 2 characters and cannot have 3 consecutive same letters' },
        custLname: { fn: validateNameFormat,  msg: 'Last Name must have at least 2 characters and cannot have 3 consecutive same letters' },
        phone:     { fn: validatePhoneFormat, msg: 'Phone number must be exactly 8 digits' },
        workPhone: { fn: validatePhoneFormat, msg: 'Work Phone number must be exactly 8 digits' },
    };

    const rule = rules[field.id];
    if (rule && !rule.fn(field.value)) {
        showValidationErrorModal(rule.msg);
        currentFieldToFocus = field;
    }
}

// ── Format helpers ────────────────────────────────────────────
function validateNameFormat(name) {
    if (!name || name.trim().length < 2) return false;
    const clean = name.replace(/\s/g, '');
    for (let i = 0; i < clean.length - 2; i++) {
        if (clean[i].toLowerCase() === clean[i+1].toLowerCase() &&
            clean[i+1].toLowerCase() === clean[i+2].toLowerCase()) return false;
    }
    return true;
}
function validateIdFormat(id)       { return id && id.length === 13 && /^\d{13}$/.test(id); }
function validatePhoneFormat(phone) { return phone && phone.length === 8 && /^\d{8}$/.test(phone); }

function getFirstInvalidField(step) {
    if (step === 0 || step === 1) return null;

    const stepEl = document.querySelector(`.form-step[data-step="${step}"]`);
    if (!stepEl) return null;

    const inputs = stepEl.querySelectorAll(
        'input[required]:not([type="hidden"]):not([readonly]), select[required]:not([disabled])'
    );

    for (let input of inputs) {
        if (!input.value || !input.value.trim()) {
            return {
                field:   input,
                message: `Please fill in the ${input.labels[0]?.textContent.replace(' *', '') || 'required field'}`
            };
        }
    }

    if (step === 2) {
        const pickup = document.getElementById('pickupDate').value;
        const ret    = document.getElementById('returnDate').value;
        if (!pickup) return { field: document.getElementById('pickupDate'), message: 'Please select a pickup date and time.' };
        if (!ret)    return { field: document.getElementById('returnDate'),  message: 'Please select a return date and time.' };
        if (new Date(ret) <= new Date(pickup))
            return { field: document.getElementById('returnDate'), message: 'Return date must be after the pickup date.' };
    }

    return null;
}

// ── Validation error modal ────────────────────────────────────
function showValidationErrorModal(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('validationErrorModal').classList.remove('hidden');
}

function closeValidationErrorModal() {
    document.getElementById('validationErrorModal').classList.add('hidden');
    if (currentFieldToFocus) {
        setTimeout(() => {
            currentFieldToFocus.focus();
            currentFieldToFocus = null;
            isValidating = false;
        }, 100);
    }
}

// ── Step navigation ───────────────────────────────────────────
function nextStep() {
    const invalidField = getFirstInvalidField(currentStep);
    if (invalidField) {
        showValidationErrorModal(invalidField.message);
        currentFieldToFocus = invalidField.field;
        return;
    }

    if (currentStep < totalSteps - 1) {
        document.querySelector(`.step[data-step="${currentStep}"]`).classList.add('completed');
        document.querySelector(`.step[data-step="${currentStep}"]`).classList.remove('active');
        currentStep++;
        document.querySelector(`.step[data-step="${currentStep}"]`).classList.add('active');
        document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
        document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.add('active');

        if (currentStep === 3) updateReview();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function prevStep() {
    if (currentStep > 0) {
        document.querySelector(`.step[data-step="${currentStep}"]`).classList.remove('active');
        currentStep--;
        document.querySelector(`.step[data-step="${currentStep}"]`).classList.remove('completed');
        document.querySelector(`.step[data-step="${currentStep}"]`).classList.add('active');
        document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
        document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ── Go to Payment Step (from Review) ─────────────────────────
function goToPayment() {
    if (!document.getElementById('termsAccepted').checked) {
        showValidationErrorModal('Please accept the Terms and Conditions and Privacy Policy before proceeding to payment.');
        return;
    }

    // Advance to step 4
    document.querySelector(`.step[data-step="3"]`).classList.add('completed');
    document.querySelector(`.step[data-step="3"]`).classList.remove('active');
    currentStep = 4;
    document.querySelector(`.step[data-step="4"]`).classList.add('active');
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    document.querySelector(`.form-step[data-step="4"]`).classList.add('active');

    loadPaymentStep();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Load Payment Step Data ────────────────────────────────────
function loadPaymentStep() {
    const pickupStr = document.getElementById('pickupDate').value;
    const feeInfo   = getBookingFeeInfo(pickupStr);

    // Payment summary
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('paySummaryVehicle', selectedVehicle?.name || '-');
    setText('paySummaryWindow',  feeInfo.label);
    setText('paySummaryFee',     `E${feeInfo.fee}`);

    // Pre-fill card holder name from customer info
    const fname = document.getElementById('custFname').value;
    const lname = document.getElementById('custLname').value;
    const cardHolderEl = document.getElementById('cardHolder');
    if (cardHolderEl && fname) {
        cardHolderEl.value = `${fname} ${lname}`.trim();
        const preview = document.getElementById('cardPreviewName');
        if (preview) preview.textContent = cardHolderEl.value.toUpperCase();
    }
}

// ── Load Customer Account Info ────────────────────────────────
async function loadCustomerAccount() {
    const custId     = document.getElementById('idNo').value;
    const loadingMsg = document.getElementById('accountLoadingMsg');
    const infoDisp   = document.getElementById('accountInfoDisplay');
    const newAccForm = document.getElementById('newAccountForm');
    const confirmSec = document.getElementById('confirmAccountSection');

    if (!custId) return;

    // Reset
    if (loadingMsg)  loadingMsg.style.display  = 'block';
    if (infoDisp)    infoDisp.style.display    = 'none';
    if (newAccForm)  newAccForm.style.display  = 'none';
    if (confirmSec)  confirmSec.style.display  = 'none';

    try {
        const res  = await fetch(`${BOOKING_API}?action=getaccount&cust_id=${encodeURIComponent(custId)}`);
        const data = await res.json();

        if (loadingMsg) loadingMsg.style.display = 'none';

        if (data.status === 'success' && data.account) {
            customerAccount = data.account;

            // Show existing account info
            if (infoDisp) infoDisp.style.display = 'block';
            const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setText('displayAccNo',      data.account.acc_no);
            setText('displayAccName',    data.account.acc_holder_name);
            setText('displayAccBalance', `E${parseFloat(data.account.balance || 0).toFixed(2)}`);

            // Check if balance is sufficient
            const pickupStr = document.getElementById('pickupDate').value;
            const feeInfo   = getBookingFeeInfo(pickupStr);
            const balance   = parseFloat(data.account.balance || 0);
            const balanceWarning = document.getElementById('balanceWarning');

            if (balance < feeInfo.fee) {
                if (balanceWarning) balanceWarning.style.display = 'block';
            } else {
                if (balanceWarning) balanceWarning.style.display = 'none';
            }

            // Show PIN confirmation
            if (confirmSec) confirmSec.style.display = 'block';

        } else {
            // No account found — show registration form
            customerAccount = null;
            if (newAccForm) newAccForm.style.display = 'block';
        }

    } catch (err) {
        if (loadingMsg) loadingMsg.style.display = 'none';
        customerAccount = null;
        if (newAccForm) newAccForm.style.display = 'block';
        console.warn('Could not load account:', err);
    }
}

// ── switchPayTab kept as stub (account tab removed) ──────────
function switchPayTab(tab) { /* account tab removed — card only */ }

// ── Date helpers ──────────────────────────────────────────────
function setMinMaxDateTime() {
    const now = new Date();

    // Min pickup: today at 08:00 (or now if it's already past 08:00 today, but still ≤ 17:00)
    // We allow from now (if within business hours) or start of next business window
    const minPickup = new Date(now);
    // Round up to next full minute + 1
    minPickup.setSeconds(0, 0);
    minPickup.setMinutes(minPickup.getMinutes() + 1);

    // Clamp to 08:00 if earlier
    if (minPickup.getHours() < 8 || (minPickup.getHours() === 8 && minPickup.getMinutes() < 0)) {
        minPickup.setHours(8, 0, 0, 0);
    }

    // Max pickup: end of day 2 days from today (today = day 1, so +2 calendar days), at 17:00
    const maxPickup = new Date(now);
    maxPickup.setDate(maxPickup.getDate() + 2);
    maxPickup.setHours(17, 0, 0, 0);

    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const pickupInput = document.getElementById('pickupDate');
    const returnInput = document.getElementById('returnDate');

    if (pickupInput) {
        pickupInput.min = fmt(minPickup);
        pickupInput.max = fmt(maxPickup);
    }
    if (returnInput) {
        returnInput.min = fmt(now);
    }
}

function setupDateListeners() {
    const pickupInput = document.getElementById('pickupDate');
    const returnInput = document.getElementById('returnDate');

    if (pickupInput) {
        pickupInput.addEventListener('change', () => {
            // Enforce 08:00–17:00 pickup time
            if (pickupInput.value) {
                const chosen = new Date(pickupInput.value);
                const hour   = chosen.getHours();
                const minute = chosen.getMinutes();

                if (hour < 8) {
                    // Before 8am — set to 08:00
                    chosen.setHours(8, 0, 0, 0);
                    const pad = n => String(n).padStart(2, '0');
                    pickupInput.value = `${chosen.getFullYear()}-${pad(chosen.getMonth()+1)}-${pad(chosen.getDate())}T08:00`;
                    showValidationErrorModal('Pickup time cannot be before 08:00 AM. Time has been adjusted to 8:00 AM.');
                } else if (hour > 17 || (hour === 17 && minute > 0)) {
                    // After 5pm — set to 17:00
                    chosen.setHours(17, 0, 0, 0);
                    const pad = n => String(n).padStart(2, '0');
                    pickupInput.value = `${chosen.getFullYear()}-${pad(chosen.getMonth()+1)}-${pad(chosen.getDate())}T17:00`;
                    showValidationErrorModal('Pickup time cannot be after 05:00 PM (17:00). The latest pickup time is 5:00 PM.');
                }
            }

            updateRentalSummary();
            if (pickupInput.value && returnInput) {
                const nextDay = new Date(pickupInput.value);
                nextDay.setDate(nextDay.getDate() + 1);
                const pad = n => String(n).padStart(2, '0');
                returnInput.min = `${nextDay.getFullYear()}-${pad(nextDay.getMonth()+1)}-${pad(nextDay.getDate())}T${pad(nextDay.getHours())}:${pad(nextDay.getMinutes())}`;
            }
        });
    }

    if (returnInput) {
        returnInput.addEventListener('change', updateRentalSummary);
    }
}

// ── Rental Summary ────────────────────────────────────────────
function updateRentalSummary() {
    const pickupVal  = document.getElementById('pickupDate').value;
    const returnVal  = document.getElementById('returnDate').value;
    const summaryDiv = document.getElementById('rentalSummary');
    const price      = selectedVehicle ? (selectedVehicle.price || selectedVehicle.daily_rate || 0) : 0;

    if (!pickupVal) {
        summaryDiv.style.display = 'none';
        return;
    }

    // Always show summary once pickup is chosen
    const feeInfo = getBookingFeeInfo(pickupVal);

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    // Fallback: if diffHrs is tiny (just selected today), still show a valid label
    const windowLabel = (feeInfo.label && feeInfo.label !== '-') ? feeInfo.label : 'Today (within 24 hrs)';
    const windowFee   = feeInfo.fee > 0 ? feeInfo.fee : 50;

    setText('summaryCollectionWindow', windowLabel);
    setText('summaryBookingFee', `E${windowFee}`);

    if (returnVal) {
        const duration = Math.ceil((new Date(returnVal) - new Date(pickupVal)) / (1000 * 60 * 60 * 24));
        setText('rentalDuration', `${duration} day${duration > 1 ? 's' : ''}`);
        setText('estimatedCost',  price > 0 ? `E${(duration * price).toFixed(2)}` : '-');
    } else {
        setText('rentalDuration', '-');
        setText('estimatedCost',  '-');
    }

    summaryDiv.style.display = 'block';
}


// ── Review Section ────────────────────────────────────────────
function updateReview() {
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setText('reviewName',      `${document.getElementById('custFname').value} ${document.getElementById('custLname').value}`);
    setText('reviewEmail',     document.getElementById('email').value);
    setText('reviewPhone',     document.getElementById('phone').value);
    setText('reviewWorkPhone', document.getElementById('workPhone').value);
    setText('reviewIdNo',      document.getElementById('idNo').value);
    setText('reviewAddress',   `${document.getElementById('physAddress').value}, ${document.getElementById('city').value}, ${document.getElementById('country').value}`);

    if (selectedVehicle) setText('reviewVehicle', selectedVehicle.name);

    const pickupDate = new Date(document.getElementById('pickupDate').value);
    const returnDate = new Date(document.getElementById('returnDate').value);
    const opts       = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };

    setText('reviewPickup', pickupDate.toLocaleString('en-US', opts));
    setText('reviewReturn', returnDate.toLocaleString('en-US', opts));

    const duration = Math.ceil((returnDate - pickupDate) / (1000 * 60 * 60 * 24));
    setText('reviewDuration', `${duration} day${duration > 1 ? 's' : ''}`);

    // Collection window & booking fee in review
    const feeInfo = getBookingFeeInfo(document.getElementById('pickupDate').value);
    setText('reviewCollectionWindow', feeInfo.label);
    setText('reviewBookingFee',       `E${feeInfo.fee}`);

    if (selectedVehicle) {
        const price = selectedVehicle.price || selectedVehicle.daily_rate || 0;
        setText('reviewTotalCost', `E${(duration * price).toFixed(2)}`);
    }
}

// ─────────────────────────────────────────────────────────────
//  PAYMENT PROCESSING
// ─────────────────────────────────────────────────────────────
async function processPayment() {
    const pickupStr = document.getElementById('pickupDate').value;
    const feeInfo   = getBookingFeeInfo(pickupStr);

    if (!validateCardInputs()) return;

    // Show processing overlay
    showProcessingOverlay('Processing Payment...', 'Please do not close this window');

    // Simulate payment processing delay (1.5 – 2.5 sec)
    await simulateDelay(1500 + Math.random() * 1000);

    // Update processing message
    document.getElementById('processingTitle').textContent = 'Confirming Booking...';
    document.getElementById('processingMsg').textContent   = 'Saving your reservation...';

    // Submit booking + payment to backend
    await submitBookingWithPayment(feeInfo);
}

function validateCardInputs() {
    const number = document.getElementById('cardNumber').value.replace(/\s/g, '');
    const holder = document.getElementById('cardHolder').value.trim();
    const expiry = document.getElementById('cardExpiry').value.trim();
    const cvv    = document.getElementById('cardCvv').value.trim();

    if (number.length !== 16 || !/^\d{16}$/.test(number)) {
        showValidationErrorModal('Please enter a valid 16-digit card number.');
        return false;
    }
    if (holder.length < 3) {
        showValidationErrorModal('Please enter the card holder name.');
        return false;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        showValidationErrorModal('Please enter a valid expiry date (MM/YY).');
        return false;
    }
    // Check expiry not in the past
    const [mm, yy] = expiry.split('/').map(Number);
    const expDate  = new Date(2000 + yy, mm - 1);
    if (expDate < new Date()) {
        showValidationErrorModal('Your card has expired. Please use a different card.');
        return false;
    }
    if (cvv.length !== 3) {
        showValidationErrorModal('Please enter a valid 3-digit CVV.');
        return false;
    }
    return true;
}

function validateAccountInputs(requiredFee) {
    if (customerAccount) {
        // Existing account — verify PIN
        const pin = document.getElementById('confirmAccPin').value.trim();
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            showValidationErrorModal('Please enter your 4-digit account PIN.');
            return false;
        }
        const balance = parseFloat(customerAccount.balance || 0);
        if (balance < requiredFee) {
            showValidationErrorModal(`Insufficient account balance. You need E${requiredFee} but your balance is E${balance.toFixed(2)}. Please use card payment.`);
            return false;
        }
    } else {
        // New account — validate all fields
        const accNo     = document.getElementById('newAccNo').value.trim();
        const bank      = document.getElementById('newAccBank').value.trim();
        const holder    = document.getElementById('newAccHolder').value.trim();
        const pin       = document.getElementById('newAccPin').value.trim();

        if (!accNo)               { showValidationErrorModal('Please enter your account number.'); return false; }
        if (!bank)                { showValidationErrorModal('Please enter your bank name.'); return false; }
        if (holder.length < 3)   { showValidationErrorModal('Please enter the account holder name.'); return false; }
        if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            showValidationErrorModal('Please enter a 4-digit PIN for your account.'); return false;
        }
    }
    return true;
}

// ── Submit booking + payment ──────────────────────────────────
async function submitBookingWithPayment(feeInfo) {
    const pickupDate  = document.getElementById('pickupDate').value;
    const returnDate  = document.getElementById('returnDate').value;
    const duration    = Math.ceil((new Date(returnDate) - new Date(pickupDate)) / (1000 * 60 * 60 * 24));
    const price       = selectedVehicle.price || selectedVehicle.daily_rate || 0;

    // Build payment method payload (card only)
    const paymentPayload = {
        method:      'card',
        cardNumber:  document.getElementById('cardNumber').value.replace(/\s/g, ''),
        cardHolder:  document.getElementById('cardHolder').value.trim(),
        cardExpiry:  document.getElementById('cardExpiry').value.trim(),
    };

    const formData = {
        customer: {
            idNumber:        document.getElementById('idNo').value,
            firstName:       document.getElementById('custFname').value,
            lastName:        document.getElementById('custLname').value,
            email:           document.getElementById('email').value,
            phone:           document.getElementById('phone').value,
            workPhone:       document.getElementById('workPhone').value,
            physicalAddress: document.getElementById('physAddress').value,
            city:            document.getElementById('city').value,
            country:         document.getElementById('country').value,
        },
        booking: {
            vehicleId:       selectedVehicle.id,
            vehicleName:     selectedVehicle.name,
            vehicleCategory: selectedVehicle.category,
            dailyRate:       price,
            pickupDate:      pickupDate,
            returnDate:      returnDate,
            dateBooked:      new Date().toISOString(),
            duration:        duration,
            totalCost:       duration * price,
            bookingFee:      feeInfo.fee,
            collectionWindow: feeInfo.label,
        },
        payment: paymentPayload,
    };

    try {
        const response = await fetch(`${BOOKING_API}?action=submitwithpayment`, {
            method:      'POST',
            headers:     { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body:        JSON.stringify(formData),
        });

        const result = await response.json();
        hideProcessingOverlay();

        if (response.ok && result.status === 'success') {
            sessionStorage.removeItem('selectedVehicle');
            showBookingSuccessModal(result, formData, duration, feeInfo);
        } else {
            let msg = result.message || 'Booking failed. Please try again.';
            if (result.errors && result.errors.length) msg += '\n• ' + result.errors.join('\n• ');
            showValidationErrorModal(msg);
        }

    } catch (err) {
        hideProcessingOverlay();
        console.error('Booking submission error:', err);
        showValidationErrorModal('A network error occurred. Please check your connection and try again.');
    }
}

// ── Processing Overlay ────────────────────────────────────────
function showProcessingOverlay(title, msg) {
    document.getElementById('processingTitle').textContent = title;
    document.getElementById('processingMsg').textContent   = msg;
    document.getElementById('paymentProcessingOverlay').classList.add('active');
}

function hideProcessingOverlay() {
    document.getElementById('paymentProcessingOverlay').classList.remove('active');
}

function simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Success Modal / Receipt ────────────────────────────────────
function showBookingSuccessModal(result, formData, duration, feeInfo) {
    const modal = document.getElementById('bookingSuccessModal');
    if (!modal) return;

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const opts    = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };

    const refNo = `#${result.rsv_id}`;
    const price = selectedVehicle?.price || selectedVehicle?.daily_rate || 0;

    setText('receiptRefNo',      refNo);
    setText('receiptFooterRef',  `Ref: ${refNo}`);
    setText('receiptDateIssued', new Date().toLocaleString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }));
    setText('receiptCustName',   `${formData.customer.firstName} ${formData.customer.lastName}`);
    setText('receiptIdNo',       formData.customer.idNumber || '—');
    setText('receiptEmail',      formData.customer.email || '—');
    setText('receiptPhone',      formData.customer.phone || '—');
    setText('receiptVehicle',    formData.booking.vehicleName);
    setText('receiptDailyRate',  `E${price}/day`);
    setText('receiptDuration',   `${duration} day${duration > 1 ? 's' : ''}`);
    setText('receiptPickup',     new Date(formData.booking.pickupDate).toLocaleString('en-US', opts));
    setText('receiptReturn',     new Date(formData.booking.returnDate).toLocaleString('en-US', opts));
    setText('receiptWindow',     feeInfo.label);
    setText('receiptRentalTotal', `E${formData.booking.totalCost.toFixed(2)}`);
    setText('receiptBookingFee', `E${feeInfo.fee}`);

    modal.classList.remove('hidden');
}

function printReceipt() {
    // Gather all receipt field values directly
    const get = id => { const el = document.getElementById(id); return el ? el.textContent : ''; };

    const refNo       = get('receiptRefNo');
    const dateIssued  = get('receiptDateIssued');
    const custName    = get('receiptCustName');
    const idNo        = get('receiptIdNo');
    const email       = get('receiptEmail');
    const phone       = get('receiptPhone');
    const vehicle     = get('receiptVehicle');
    const dailyRate   = get('receiptDailyRate');
    const duration    = get('receiptDuration');
    const pickup      = get('receiptPickup');
    const ret         = get('receiptReturn');
    const window_lbl  = get('receiptWindow');
    const rentalTotal = get('receiptRentalTotal');
    const bookingFee  = get('receiptBookingFee');
    const footerRef   = get('receiptFooterRef');

    const printWindow = window.open('', '_blank', 'width=750,height=1000');
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payment Receipt ${refNo} - Rent A Car</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: #f0f4f8;
            display: flex;
            justify-content: center;
            padding: 30px 20px;
        }
        @media print {
            @page { size: A4; margin: 10mm; }
            body {
                background: #fff;
                padding: 0;
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
            }
            .no-print { display: none !important; }
            .receipt-wrap { box-shadow: none; max-width: 100%; }
        }
        .receipt-wrap {
            background: #fff;
            border-radius: 16px;
            overflow: hidden;
            width: 100%;
            max-width: 600px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.13);
        }

        /* Header */
        .receipt-header {
            background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%);
            color: #fff;
            padding: 28px 32px 20px;
            position: relative;
            overflow: hidden;
        }
        .receipt-header::before {
            content:''; position:absolute; top:-30px; right:-30px;
            width:120px; height:120px; border-radius:50%;
            background:rgba(255,107,53,0.18);
        }
        .receipt-header::after {
            content:''; position:absolute; bottom:-40px; right:40px;
            width:150px; height:150px; border-radius:50%;
            background:rgba(247,147,30,0.10);
        }
        .header-top {
            display:flex; justify-content:space-between; align-items:flex-start;
            position:relative; z-index:1;
        }
        .brand { font-size:1.4rem; font-weight:800; letter-spacing:1px; }
        .brand-sub { font-size:0.72rem; color:#aac4e0; margin-top:3px; }
        .paid-badge {
            background:#ff6b35; color:#fff; border-radius:20px;
            padding:5px 14px; font-size:0.75rem; font-weight:700; letter-spacing:0.5px;
        }
        .header-title {
            margin-top:18px; padding-top:16px;
            border-top:1px solid rgba(255,255,255,0.15);
            position:relative; z-index:1;
        }
        .header-title .lbl { font-size:1rem; font-weight:700; color:#f7931e; letter-spacing:0.5px; }
        .header-title .sub { font-size:0.75rem; color:#aac4e0; margin-top:2px; }

        /* Reference strip */
        .ref-strip {
            background:#f8f9fb; border-bottom:1px dashed #dde3ed;
            padding:14px 32px;
            display:flex; justify-content:space-between; align-items:center;
        }
        .ref-strip .lbl  { font-size:0.68rem; color:#999; text-transform:uppercase; letter-spacing:0.5px; }
        .ref-strip .val  { font-size:1.05rem; font-weight:800; color:#1a1a2e; letter-spacing:1px; margin-top:2px; }
        .ref-strip .val2 { font-size:0.82rem; font-weight:600; color:#333; margin-top:2px; }

        /* Body */
        .receipt-body { padding:24px 32px; }

        /* Section */
        .section { margin-bottom:20px; }
        .section-title {
            font-size:0.68rem; font-weight:700; color:#ff6b35;
            text-transform:uppercase; letter-spacing:0.8px;
            border-bottom:2px solid #fff0ea; padding-bottom:6px; margin-bottom:10px;
        }
        .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; font-size:0.83rem; }
        .grid-2 .span2 { grid-column:1/-1; }
        .grid-2 span.lbl { color:#888; }
        .grid-2 strong   { color:#222; }

        /* Divider */
        .divider { border:none; border-top:1px dashed #dde3ed; margin:16px 0; }

        /* Payment rows */
        .pay-row {
            display:flex; justify-content:space-between;
            font-size:0.83rem; color:#555; padding:5px 0;
        }
        .pay-row.note { font-size:0.75rem; color:#aaa; font-style:italic; }

        /* Fee box */
        .fee-box {
            margin-top:12px;
            background:linear-gradient(135deg,#fff8f0,#fff3e6);
            border:1.5px solid #ff6b35; border-radius:10px;
            padding:14px 18px;
            display:flex; justify-content:space-between; align-items:center;
        }
        .fee-box .fee-lbl  { font-size:0.72rem; color:#c94f00; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; }
        .fee-box .fee-sub  { font-size:0.72rem; color:#888; margin-top:2px; }
        .fee-box .fee-amt  { font-size:1.6rem; font-weight:800; color:#ff6b35; }

        /* Notice */
        .notice {
            background:#f0f4f8; border-radius:8px;
            padding:12px 14px; font-size:0.74rem; color:#556; line-height:1.6;
            margin-top:16px;
        }

        /* Footer */
        .receipt-footer {
            border-top:2px dashed #dde3ed;
            padding:14px 32px;
            background:#f8f9fb;
            display:flex; justify-content:space-between; align-items:center;
            font-size:0.7rem; color:#aaa;
        }

        /* Print button (screen only) */
        .print-btn-bar {
            text-align:center; padding:20px;
        }
        .print-btn {
            background:linear-gradient(135deg,#1a1a2e,#0f3460);
            color:#fff; border:none; border-radius:10px;
            padding:12px 32px; font-size:0.92rem; font-weight:600;
            cursor:pointer; letter-spacing:0.3px;
        }
        .print-btn:hover { opacity:0.9; }
    </style>
</head>
<body>
    <div>
        <div class="receipt-wrap">
            <!-- Header -->
            <div class="receipt-header">
                <div class="header-top">
                    <div>
                        <div class="brand">🚗 Rent A Car</div>
                        <div class="brand-sub">Mbabane, Eswatini &nbsp;|&nbsp; info@rentacar.co.sz</div>
                    </div>
                    <div class="paid-badge">PAID ✓</div>
                </div>
                <div class="header-title">
                    <div class="lbl">PAYMENT RECEIPT</div>
                    <div class="sub">Booking Confirmation &amp; Fee Receipt</div>
                </div>
            </div>

            <!-- Reference strip -->
            <div class="ref-strip">
                <div>
                    <div class="lbl">Booking Reference</div>
                    <div class="val">${refNo}</div>
                </div>
                <div style="text-align:right;">
                    <div class="lbl">Date Issued</div>
                    <div class="val2">${dateIssued}</div>
                </div>
            </div>

            <!-- Body -->
            <div class="receipt-body">

                <!-- Customer -->
                <div class="section">
                    <div class="section-title">Customer Details</div>
                    <div class="grid-2">
                        <div><span class="lbl">Name: </span><strong>${custName}</strong></div>
                        <div><span class="lbl">ID No: </span><strong>${idNo}</strong></div>
                        <div><span class="lbl">Email: </span><strong>${email}</strong></div>
                        <div><span class="lbl">Phone: </span><strong>${phone}</strong></div>
                    </div>
                </div>

                <!-- Vehicle -->
                <div class="section">
                    <div class="section-title">Vehicle Details</div>
                    <div class="grid-2">
                        <div class="span2"><span class="lbl">Vehicle: </span><strong style="font-size:0.95rem;">${vehicle}</strong></div>
                        <div><span class="lbl">Daily Rate: </span><strong>${dailyRate}</strong></div>
                        <div><span class="lbl">Duration: </span><strong>${duration}</strong></div>
                    </div>
                </div>

                <!-- Rental Period -->
                <div class="section">
                    <div class="section-title">Rental Period</div>
                    <div class="grid-2">
                        <div><span class="lbl">Pickup:</span><br><strong>${pickup}</strong></div>
                        <div><span class="lbl">Return:</span><br><strong>${ret}</strong></div>
                    </div>
                </div>

                <hr class="divider">

                <!-- Payment -->
                <div class="section">
                    <div class="section-title">Payment Breakdown</div>
                    <div class="pay-row"><span>Estimated Rental Total</span><span>${rentalTotal}</span></div>
                    <div class="pay-row"><span>Collection Window</span><span>${window_lbl}</span></div>
                    <div class="pay-row note"><span><em>Booking fee will be deducted from total at pickup</em></span></div>
                    <div class="fee-box">
                        <div>
                            <div class="fee-lbl">Booking Fee Paid Now</div>
                            <div class="fee-sub">Payment Method: Card</div>
                        </div>
                        <div class="fee-amt">${bookingFee}</div>
                    </div>
                </div>

                <!-- Notice -->
                <div class="notice">
                    📋 <strong>Important:</strong> Please collect your vehicle within the stated collection window.
                    Failure to collect will result in automatic cancellation. Present this receipt at pickup.
                </div>
            </div>

            <!-- Footer -->
            <div class="receipt-footer">
                <span>© 2026 Rent A Car · rentacar.co.sz</span>
                <span>${footerRef}</span>
            </div>
        </div>

        <!-- Print button (hidden when printing) -->
        <div class="print-btn-bar no-print">
            <button class="print-btn" onclick="window.print()">🖨️ Save as PDF / Print</button>
        </div>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
        };
    <\/script>
</body>
</html>`);
    printWindow.document.close();
}

function closeBookingSuccessModal() {
    document.getElementById('bookingSuccessModal').classList.add('hidden');
    window.location.href = 'index.html';
}

// ── Validation error modal ────────────────────────────────────
function closeValidationErrorModal() {
    document.getElementById('validationErrorModal').classList.add('hidden');
    if (currentFieldToFocus) {
        setTimeout(() => {
            currentFieldToFocus.focus();
            currentFieldToFocus = null;
            isValidating = false;
        }, 100);
    }
}

// ── Notification Toast ────────────────────────────────────────
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="notification-close">&times;</button>
    `;
    notification.querySelector('.notification-close').addEventListener('click', () => {
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

// ── Navbar scroll shadow ──────────────────────────────────────
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) navbar.style.boxShadow = window.scrollY > 50
        ? '0 5px 20px rgba(0,0,0,0.15)'
        : '0 2px 10px rgba(0,0,0,0.1)';
});

// ── Input lift on focus ───────────────────────────────────────
document.querySelectorAll('input, select').forEach(input => {
    input.addEventListener('focus', function () { this.parentElement.style.transform = 'translateY(-2px)'; });
    input.addEventListener('blur',  function () { this.parentElement.style.transform = 'translateY(0)'; });
});

console.log('%cWelcome to Rent A Car Booking! 🚗', 'color: #ff6b35; font-size: 20px; font-weight: bold;');
console.log('%cTaking You Places', 'color: #f7931e; font-size: 16px;');