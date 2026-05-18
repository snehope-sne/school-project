// ============================================================
//  DARKETZ Car Rental — Rental Dashboard JS
//  Real PHP backend version — replaces all mock data.
//  Set API_BASE to point to your PHP backend folder.
// ============================================================

/* ===================== CONFIG ===================== */
// Change this to wherever your PHP files live on your server.
// Examples:
//   Same folder:        const API_BASE = '';
//   Sub-folder:         const API_BASE = '/backend';
//   Remote server:      const API_BASE = 'https://your-server.com/api';
const API_BASE = '/backend';   // ← EDIT THIS

/* ===================== APP STATE ===================== */
let currentUser       = null;
let currentRentalStep = 0;
let rentalData        = {};
let selectedCustomer  = null;
let selectedVehicle   = null;

// In-memory cache (refreshed on each tab visit)
let VEHICLES_CACHE = [];
let RENTALS_CACHE  = [];
let CUSTOMERS_CACHE = [];

/* ===================== HELPERS ===================== */
async function api(endpoint, options = {}) {
    const resp = await fetch(API_BASE + endpoint, {
        credentials: 'include',
        ...options,
        headers: { ...(options.headers || {}) }
    });
    const text = await resp.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error('Non-JSON response from', endpoint, ':', text);
        return { status: 'error', message: `Server returned unexpected response (HTTP ${resp.status}). Check server logs.` };
    }
}

function safeSet(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function formatDate(d) {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function updateClock() {
    const el = document.getElementById('clock');
    if (el) el.textContent = new Date().toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

/* ===================== INIT ===================== */
document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    updateClock();
    setInterval(updateClock, 1000);
});

/* ===================== LOGIN ===================== */
function initLogin() {
    // Check both sessionStorage and localStorage — login.js may use either.
    // Keys tried (in order): 'dashboardUser', 'currentUser', 'user'
    const KEYS    = ['dashboardUser', 'currentUser', 'user'];
    const STORES  = [sessionStorage, localStorage];

    let parsed = null;
    let foundKey = null;

    outer:
    for (const store of STORES) {
        for (const key of KEYS) {
            const raw = store.getItem(key);
            if (!raw) continue;
            try {
                const obj = JSON.parse(raw);
                // Accept any shape — login.php may return DB column names like EMP_FNAME
                if (obj && (obj.name || obj.emp_id || obj.email || obj.EMP_FNAME || obj.EMP_ID || obj.EMAIL || obj.fname)) {
                    parsed   = obj;
                    foundKey = key;
                    break outer;
                }
            } catch (e) {
                // Corrupted entry — remove it so it doesn't block future logins
                store.removeItem(key);
            }
        }
    }

    if (parsed) {
        currentUser = parsed;
        // Build initials if missing
        if (!currentUser.initials && currentUser.name) {
            currentUser.initials = currentUser.name.split(' ')
                .map(w => w[0]).join('').substring(0, 2).toUpperCase();
        }
        // Normalise role — handle 'Admin', 'admin', 'ADMIN', 'rental_agent', etc.
        if (currentUser.role) {
            const r = currentUser.role.toLowerCase().replace(/[_\s]/g, '');
            currentUser.role = (r === 'admin' || r === 'administrator') ? 'admin' : 'agent';
        } else {
            currentUser.role = 'agent'; // safe default
        }
        launchDashboard(currentUser);
        return;
    }

    // Nothing valid found — redirect to login
    console.warn('[DARKETZ] No valid session found. Keys checked:', KEYS, '— redirecting to login.');
    window.location.href = '/RENT2/login.html';
}

function launchDashboard(user) {
    // ── Normalise user object ──────────────────────────────────────────────
    // login.php may return different field names depending on the DB columns.
    // Support both { name, role, emp_id } and { EMP_FNAME, EMP_LNAME, ROLE, EMP_ID }.
    if (!user.name) {
        const fname = user.EMP_FNAME || user.fname || user.first_name || '';
        const lname = user.EMP_LNAME || user.lname || user.last_name  || '';
        user.name = (fname + ' ' + lname).trim() || user.email || 'User';
    }
    if (!user.emp_id) {
        user.emp_id = user.EMP_ID || user.id || null;
    }
    if (!user.role) {
        user.role = (user.ROLE || 'agent');
    }
    // Normalise role to 'admin' or 'agent'
    const roleNorm = String(user.role).toLowerCase().replace(/[_\s]/g, '');
    user.role = (roleNorm === 'admin' || roleNorm === 'administrator') ? 'admin' : 'agent';

    // Build initials
    if (!user.initials && user.name) {
        user.initials = user.name.split(' ')
            .filter(Boolean).map(w => w[0]).join('').substring(0, 2).toUpperCase();
    }

    // ── Show dashboard ─────────────────────────────────────────────────────
    // The HTML has no #login-screen — safe no-op if missing.
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.style.display = 'none';

    const dash = document.getElementById('dashboard');
    if (dash) {
        dash.classList.add('visible');
        dash.style.display = '';
    }

    // ── Populate sidebar ───────────────────────────────────────────────────
    document.getElementById('sidebarUserName').textContent  = user.name;
    document.getElementById('sidebarUserRole').textContent  = user.role === 'admin' ? 'Administrator' : 'Rental Agent';
    document.getElementById('sidebarRoleBadge').textContent = user.role === 'admin' ? 'Admin' : 'Agent';
    document.getElementById('sidebarInitials').textContent  = user.initials || '??';

    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = user.role === 'admin' ? '' : 'none';
    });

    const hint = document.querySelector('.login-hint');
    if (hint) hint.style.display = 'none';

    navigateTo('rental');
    loadStats();
    buildRentalVehiclePicker();
    setRentalStep(0);

    // Run a global sweep to auto-cancel any bookings older than 72h
    api('/rentals.php?action=expire_bookings').then(d => {
        if (d.cancelled > 0) {
            showToast(`ℹ️ ${d.cancelled} expired booking(s) auto-cancelled & vehicles released.`, 'info');
            loadStats();
        }
    }).catch(() => {});
}

function logout() {
    // Clear all possible session keys from both storage types
    ['dashboardUser', 'currentUser', 'user'].forEach(key => {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
    });

    currentUser = null; selectedCustomer = null; selectedVehicle = null;
    rentalData = {}; currentRentalStep = 0;
    VEHICLES_CACHE = []; RENTALS_CACHE = []; CUSTOMERS_CACHE = [];

    window.location.href = '/RENT2/login.html';
}

/* ===================== NAVIGATION ===================== */
function navigateTo(tab) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    if (activeNav) activeNav.classList.add('active');

    const titles = {
        overview: 'Overview', rental: 'Rental Process', rentals: 'Active Rentals',
        returns: 'Returns', customers: 'Customers', vehicles: 'Vehicle Management', reports: 'Reports'
    };
    document.getElementById('topbarTitle').textContent     = titles[tab] || tab;
    document.getElementById('topbarBreadcrumb').textContent = `Dashboard / ${titles[tab] || tab}`;

    document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) panel.classList.add('active');

    if (tab === 'vehicles')  renderVehiclesGrid();
    if (tab === 'customers') renderCustomersTable();
    if (tab === 'rentals')   renderRentalsTable();
    if (tab === 'returns')   renderReturnsSection();
}

/* ===================== STATS ===================== */
async function loadStats() {
    try {
        const data = await api('/get_stats.php');
        if (data.status === 'success') {
            safeSet('statAvailable',  data.stats.available);
            safeSet('statBooked',     data.stats.booked);
            safeSet('statOnRental',   data.stats.on_rental);
            safeSet('statActiveRent', data.stats.active_rentals);
            safeSet('statLate',       data.stats.late_returns);
            const badge = document.getElementById('navBadgeRentals');
            if (badge) badge.textContent = data.stats.active_rentals;
        }
    } catch (e) {
        console.error('Stats load failed', e);
    }
}

/* ===================== RENTAL PROCESS ===================== */
function setRentalStep(step) {
    currentRentalStep = step;
    for (let i = 0; i <= 3; i++) {
        const dot   = document.getElementById(`rdot-${i}`);
        const label = document.getElementById(`rlabel-${i}`);
        const conn  = document.getElementById(`rconn-${i}`);
        if (!dot) continue;
        dot.className   = 'step-dot'        + (i < step ? ' done' : i === step ? ' active' : '');
        if (label) label.className = 'step-label-text' + (i < step ? ' done' : i === step ? ' active' : '');
        if (conn)  conn.className  = 'step-connector'  + (i < step ? ' done' : '');
    }
    document.querySelectorAll('.rental-step-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById(`rspanel-${step}`);
    if (panel) panel.style.display = '';
}

// STEP 0
function chooseCustomerType(type) {
    rentalData.customerType = type;
    document.getElementById('rs0-walkin').style.display   = type === 'walk-in'  ? '' : 'none';
    document.getElementById('rs0-existing').style.display = type === 'existing' ? '' : 'none';
}

async function lookupCustomer() {
    const idVal   = document.getElementById('lookupIdInput').value.trim();
    const cardEl  = document.getElementById('customerFoundCard');
    const notEl   = document.getElementById('customerNotFound');

    if (!idVal) { showToast('Please enter a customer ID number', 'error'); return; }

    try {
        const data = await api(`/customers.php?action=lookup&id_no=${encodeURIComponent(idVal)}`);

        if (data.status === 'success') {
            const c = data.customer;
            selectedCustomer = {
                cust_id:      c.cust_id,
                fname:        c.fname,
                lname:        c.lname,
                email:        c.email,
                phone:        c.phone,
                work_phone:   c.work_phone,
                address:      c.address,
                id_no:        c.id_no,
                is_verified:  c.is_verified,
                kin_fname:    c.kin_fname,
                kin_lname:    c.kin_lname,
                kin_phone:    c.kin_phone,
            };

            cardEl.classList.add('show');
            notEl.style.display = 'none';
            document.getElementById('cfName').textContent  = `${c.fname} ${c.lname}`;
            document.getElementById('cfEmail').textContent = `${c.email || '—'} · ${c.phone || '—'}`;
            document.getElementById('cfInitials').textContent = (c.fname[0] + c.lname[0]).toUpperCase();

            // ── Also check for an existing Booked rental ─────────────
            try {
                const bkData = await api(`/rentals.php?action=lookup_booking&cust_id=${encodeURIComponent(c.cust_id)}`);
                if (bkData.status === 'success') {
                    selectedCustomer.existing_booking = bkData.booking;
                    showToast(`Customer found: ${c.fname} ${c.lname} — Active booking detected!`, 'success');
                    renderBookingBadge(bkData.booking);
                } else {
                    selectedCustomer.existing_booking = null;
                    clearBookingBadge();
                    showToast(`Customer found: ${c.fname} ${c.lname}`, 'success');
                }
            } catch (_) {
                selectedCustomer.existing_booking = null;
                clearBookingBadge();
            }

        } else {
            cardEl.classList.remove('show');
            notEl.style.display = '';
            selectedCustomer = null;
            clearBookingBadge();
            showToast('Customer not found.', 'error');
        }
    } catch (err) {
        showToast('Server error during lookup.', 'error');
    }
}

// ── Show a booking info badge below the found-customer card ──
function renderBookingBadge(bk) {
    let el = document.getElementById('existingBookingBadge');
    if (!el) {
        el = document.createElement('div');
        el.id = 'existingBookingBadge';
        const card = document.getElementById('customerFoundCard');
        card.parentNode.insertBefore(el, card.nextSibling);
    }

    // Countdown styling: warn if < 12h left
    const hoursLeft = Math.floor(bk.remaining_seconds / 3600);
    const urgentColor = hoursLeft < 12 ? 'var(--error)' : 'var(--primary-orange)';

    el.innerHTML = `
        <div style="margin-top:12px;padding:14px 16px;background:rgba(255,107,53,0.08);
                    border:1.5px solid var(--border-orange);border-radius:10px;font-size:0.86rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <strong style="color:var(--primary-orange);">📅 Existing Booking Found</strong>
                <span style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;
                             color:${urgentColor};font-weight:700;">
                    ⏱ ${bk.remaining_label}
                </span>
            </div>
            <div style="color:var(--text-secondary);">
                Rental #<strong>${bk.rental_id}</strong> &nbsp;·&nbsp;
                ${bk.brand} ${bk.make} &nbsp;·&nbsp;
                Plate: <strong style="font-family:'JetBrains Mono',monospace;">${bk.plate}</strong>
            </div>
            <div style="margin-top:4px;color:var(--text-muted);">
                Pickup: <strong>${formatDate(bk.start_date)}</strong> &nbsp;→&nbsp;
                Return: <strong>${formatDate(bk.return_date)}</strong>
                &nbsp;·&nbsp; E ${bk.total?.toLocaleString()}
            </div>
            <div style="margin-top:6px;font-size:0.8rem;">
                <span style="color:var(--success);">🪪 License: ${bk.license_status}</span>
                &nbsp;&nbsp;
                <span style="color:var(--text-muted);">
                    Booking expires: <strong style="color:${urgentColor};">${formatDateTime(bk.booking_expiry)}</strong>
                </span>
            </div>
        </div>`;
    el.style.display = '';
}

function clearBookingBadge() {
    const el = document.getElementById('existingBookingBadge');
    if (el) el.style.display = 'none';
}

function formatDateTime(d) {
    if (!d) return 'N/A';
    return new Date(d).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

async function proceedFromStep0() {
    if (rentalData.customerType === 'existing' && !selectedCustomer) {
        showToast('Please look up a customer first', 'error'); return;
    }

    if (rentalData.customerType === 'walk-in') {
        const fn      = document.getElementById('wi_fname')?.value.trim();
        const ln      = document.getElementById('wi_lname')?.value.trim();
        const id      = document.getElementById('wi_id')?.value.trim();
        const phone   = document.getElementById('wi_phone')?.value.trim();
        const email   = document.getElementById('wi_email')?.value.trim();
        const address = document.getElementById('wi_address')?.value.trim();
        const kin_fn  = document.getElementById('wi_kin_name')?.value.trim().split(' ')[0] || '';
        const kin_ln  = document.getElementById('wi_kin_name')?.value.trim().split(' ').slice(1).join(' ') || '';
        const kin_ph  = document.getElementById('wi_kin_phone')?.value.trim();

        if (!fn || !ln || !id) { showToast('First name, last name and ID number are required', 'error'); return; }

        try {
            const body = new URLSearchParams({
                action: 'walkin', fname: fn, lname: ln, id_no: id,
                phone, email, address,
                kin_fname: kin_fn, kin_lname: kin_ln, kin_phone: kin_ph
            });
            const data = await api('/customers.php', { method: 'POST', body });

            if (data.status === 'success' || data.status === 'created') {
                selectedCustomer = data.customer;
                showToast(`New customer ${fn} ${ln} registered!`, 'success');
            } else {
                showToast(data.message || 'Registration failed.', 'error'); return;
            }
        } catch (err) {
            showToast('Server error during registration.', 'error'); return;
        }
    }

    populateStep1Customer();
    await buildRentalVehiclePicker();
    setRentalStep(1);
}

function populateStep1Customer() {
    if (!selectedCustomer) return;
    safeSet('rv_cust_name',    `${selectedCustomer.fname} ${selectedCustomer.lname}`);
    safeSet('rv_cust_id',      selectedCustomer.id_no);
    safeSet('rv_cust_phone',   selectedCustomer.phone || '-');

    const bk = selectedCustomer.existing_booking;
    safeSet('rv_cust_license', bk?.license_no || selectedCustomer.license_no || 'Provided');
    safeSet('rv_lic_expiry',
        bk ? formatDateTime(bk.booking_expiry) + ' ⏱'
           : (selectedCustomer.license_expiry || '—'));
}

// STEP 1 — Vehicle picker
async function buildRentalVehiclePicker() {
    const grid = document.getElementById('rentalVehiclePicker');
    if (!grid) return;

    // ── If the customer has an existing Booked rental, show that vehicle ──
    if (selectedCustomer?.existing_booking) {
        const bk = selectedCustomer.existing_booking;

        // Auto-select this vehicle in state
        selectedVehicle = {
            id:         bk.vin,
            brand:      bk.brand,
            make:       bk.make,
            model:      '',
            plate:      bk.plate,
            daily_rate: bk.daily_rate,
            image:      bk.image_url,
            rental_id:  bk.rental_id,   // keep ref so confirmRental can activate it
        };

        // Countdown urgency
        const hoursLeft   = Math.floor(bk.remaining_seconds / 3600);
        const urgentColor = hoursLeft < 12 ? 'var(--error)' : 'var(--primary-orange)';
        const expiryBg    = hoursLeft < 12 ? 'rgba(244,67,54,0.08)' : 'rgba(255,107,53,0.08)';
        const expiryBorder= hoursLeft < 12 ? 'rgba(244,67,54,0.4)'  : 'var(--border-orange)';
        const fallbackImg = 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=250&fit=crop';

        grid.innerHTML = `
            <div style="grid-column:1/-1;">
                <!-- Customer header -->
                <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;
                            background:var(--dark);border:1px solid var(--border);
                            border-radius:10px;margin-bottom:14px;">
                    <div style="width:44px;height:44px;border-radius:50%;background:var(--primary-orange);
                                display:flex;align-items:center;justify-content:center;
                                font-weight:700;font-size:1rem;color:#fff;flex-shrink:0;">
                        ${(bk.cust_name || '??').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase()}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:700;font-size:0.95rem;">${bk.cust_name}</div>
                        <div style="font-size:0.78rem;color:var(--text-muted);font-family:'JetBrains Mono',monospace;">
                            ID: ${bk.cust_id}
                        </div>
                        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">
                            📞 ${bk.cust_phone || '—'} &nbsp;·&nbsp; ✉ ${bk.cust_email || '—'}
                        </div>
                    </div>
                    <div style="text-align:right;font-size:0.8rem;">
                        <div style="color:var(--success);font-weight:600;margin-bottom:4px;">🪪 License: ${bk.license_status}</div>
                        ${bk.license_no !== 'Provided' && bk.license_no
                            ? `<div style="font-family:'JetBrains Mono',monospace;color:var(--text-muted);">${bk.license_no}</div>`
                            : ''}
                    </div>
                </div>

                <!-- Pre-selected vehicle card -->
                <div style="display:flex;gap:0;border:2px solid var(--primary-orange);
                            border-radius:14px;overflow:hidden;background:var(--orange-glow);
                            box-shadow:0 0 0 3px rgba(255,107,53,0.15);">
                    <img src="${bk.image_url || fallbackImg}"
                         style="width:220px;min-height:160px;object-fit:cover;flex-shrink:0;"
                         onerror="this.src='${fallbackImg}'" loading="lazy">
                    <div style="padding:18px 20px;flex:1;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <span style="font-size:1.15rem;font-weight:800;">${bk.brand} ${bk.make}</span>
                            <span class="badge badge-success" style="font-size:0.72rem;">✓ Pre-booked</span>
                        </div>
                        <div style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;
                                    color:var(--text-muted);margin-bottom:4px;">
                            ${bk.plate}
                        </div>
                        <div style="color:var(--primary-orange);font-weight:700;font-size:1.05rem;margin-bottom:12px;">
                            E ${bk.daily_rate?.toLocaleString()}/day
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.83rem;">
                            <div style="color:var(--text-secondary);">
                                📅 Pickup: <strong>${formatDate(bk.start_date)}</strong>
                            </div>
                            <div style="color:var(--text-secondary);">
                                📅 Return: <strong>${formatDate(bk.return_date)}</strong>
                            </div>
                            <div style="color:var(--text-secondary);">
                                ⏱ Duration: <strong>${bk.days} day(s)</strong>
                            </div>
                            <div style="color:var(--text-secondary);">
                                💰 Total: <strong>E ${bk.total?.toLocaleString()}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Booking expiry banner -->
                <div style="margin-top:12px;padding:12px 16px;
                            background:${expiryBg};border:1.5px solid ${expiryBorder};
                            border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-size:0.85rem;color:var(--text-secondary);">
                        🕐 Booking expires:
                        <strong style="color:${urgentColor};">${formatDateTime(bk.booking_expiry)}</strong>
                    </div>
                    <div style="font-family:'JetBrains Mono',monospace;font-weight:700;
                                font-size:0.9rem;color:${urgentColor};"
                         id="bookingCountdownDisplay">
                        ${bk.remaining_label}
                    </div>
                </div>
            </div>`;

        // Live countdown ticker
        startBookingCountdown(bk.remaining_seconds);

        // Show the "selected vehicle" info bar too
        safeSet('selectedVehName',  `${bk.brand} ${bk.make}`);
        safeSet('selectedVehPlate', bk.plate);
        safeSet('selectedVehRate',  `E ${bk.daily_rate?.toLocaleString()} / day`);
        document.getElementById('selectedVehicleInfo').style.display = '';
        return;
    }

    // ── No existing booking — show all available vehicles ────────────────
    grid.innerHTML = '<div style="padding:20px;color:var(--text-muted);">Loading vehicles…</div>';

    try {
        const data = await api('/vehicles.php?action=available');
        if (data.status !== 'success' || !data.vehicles.length) {
            grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🚗</div><h4>No vehicles available</h4></div>`;
            return;
        }
        VEHICLES_CACHE = data.vehicles;
        grid.innerHTML = data.vehicles.map(v => `
            <div class="rental-vehicle-option" data-vid="${v.id}"
                 style="background:var(--card);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;transition:all 0.2s;"
                 onclick="selectVehicleForRental('${v.id}')"
                 onmouseover="this.style.borderColor='var(--border-orange)'"
                 onmouseout="if(!this.classList.contains('selected'))this.style.borderColor='var(--border)'">
                <img src="${v.image || 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=250&fit=crop'}"
                     style="width:100%;height:120px;object-fit:cover;" loading="lazy">
                <div style="padding:12px;">
                    <div style="font-weight:700;font-size:0.92rem;">${v.brand} ${v.make}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">${v.plate} · ${v.category}</div>
                    <div style="color:var(--primary-orange);font-weight:700;margin-top:6px;">E ${v.daily_rate.toLocaleString()}/day</div>
                </div>
            </div>`).join('');

        const style = document.getElementById('rentalPickerStyle') || document.createElement('style');
        style.id = 'rentalPickerStyle';
        style.textContent = `.rental-vehicle-option.selected { border-color: var(--primary-orange) !important; background: var(--orange-glow) !important; box-shadow: 0 0 0 2px var(--primary-orange); }`;
        document.head.appendChild(style);

    } catch (err) {
        grid.innerHTML = `<div style="color:var(--error);padding:20px;">Failed to load vehicles.</div>`;
    }
}

// Live countdown for the booking expiry display
let _countdownTimer = null;
function startBookingCountdown(initialSeconds) {
    if (_countdownTimer) clearInterval(_countdownTimer);
    let secs = initialSeconds;
    function tick() {
        secs = Math.max(0, secs - 1);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        const el = document.getElementById('bookingCountdownDisplay');
        if (el) el.textContent = `${h}h ${m}m ${s}s remaining`;
        if (secs === 0) {
            clearInterval(_countdownTimer);
            showToast('⚠️ Booking has expired. The vehicle has been released.', 'warning');
            // Refresh vehicle picker to show all available
            selectedCustomer.existing_booking = null;
            selectedVehicle = null;
            buildRentalVehiclePicker();
        }
    }
    _countdownTimer = setInterval(tick, 1000);
}

function selectVehicleForRental(vehicleId) {
    const v = VEHICLES_CACHE.find(x => String(x.id) === String(vehicleId));
    if (!v) return;
    selectedVehicle = v;
    document.querySelectorAll('.rental-vehicle-option').forEach(el => {
        el.classList.toggle('selected', String(el.dataset.vid) === String(vehicleId));
    });
    safeSet('selectedVehName',  `${v.brand} ${v.make} ${v.model}`);
    safeSet('selectedVehPlate', v.plate);
    safeSet('selectedVehRate',  `E ${v.daily_rate.toLocaleString()} / day`);
    document.getElementById('selectedVehicleInfo').style.display = '';
    showToast(`${v.brand} ${v.make} selected`, 'info');
}

function proceedFromStep1() {
    if (!selectedVehicle) { showToast('Please select a vehicle', 'error'); return; }
    setRentalStep(2);
}

// STEP 2
function updateTotalCost() {
    const start = document.getElementById('rd_start_date')?.value;
    const end   = document.getElementById('rd_end_date')?.value;
    if (start && end && selectedVehicle) {
        const days  = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000));
        const total = days * selectedVehicle.daily_rate;
        safeSet('rd_days',  `${days} day${days > 1 ? 's' : ''}`);
        safeSet('rd_total', `E ${total.toLocaleString()}`);
        rentalData.days  = days;
        rentalData.total = total;
    }
}

function proceedFromStep2() {
    // If converting an existing booking, rental dates are already fixed
    if (selectedCustomer?.existing_booking && selectedVehicle?.rental_id) {
        const bk = selectedCustomer.existing_booking;
        rentalData.start_date = bk.start_date;
        rentalData.end_date   = bk.return_date;
        rentalData.purpose    = document.getElementById('rd_purpose')?.value.trim() || 'Customer Booking';
        rentalData.mileage    = document.getElementById('rd_mileage')?.value;
        rentalData.days       = bk.days;
        rentalData.total      = bk.total;
        if (!rentalData.purpose) { showToast('Please enter rental purpose', 'error'); return; }
        buildReviewStep();
        setRentalStep(3);
        return;
    }

    const start   = document.getElementById('rd_start_date')?.value;
    const end     = document.getElementById('rd_end_date')?.value;
    const purpose = document.getElementById('rd_purpose')?.value.trim();
    if (!start || !end) { showToast('Please select rental dates', 'error'); return; }
    if (!purpose)        { showToast('Please enter rental purpose', 'error'); return; }
    rentalData.start_date = start;
    rentalData.end_date   = end;
    rentalData.purpose    = purpose;
    rentalData.mileage    = document.getElementById('rd_mileage')?.value;
    buildReviewStep();
    setRentalStep(3);
}

// STEP 3
function buildReviewStep() {
    const bk = selectedCustomer?.existing_booking;

    const rows = [
        { label: 'Customer',        value: `${selectedCustomer.fname} ${selectedCustomer.lname}` },
        { label: 'ID Number',       value: selectedCustomer.id_no },
        { label: 'Vehicle',         value: `${selectedVehicle.brand} ${selectedVehicle.make} ${selectedVehicle.model || ''}`.trim() },
        { label: 'Plate Number',    value: selectedVehicle.plate },
        { label: 'Start Date',      value: formatDate(rentalData.start_date) },
        { label: 'Expected Return', value: formatDate(rentalData.end_date) },
        { label: 'Duration',        value: `${rentalData.days} day(s)` },
        { label: 'Purpose',         value: rentalData.purpose },
        { label: 'Daily Rate',      value: `E ${selectedVehicle.daily_rate.toLocaleString()}` },
    ];

    if (bk) {
        rows.push({ label: '🪪 License',       value: bk.license_status });
        rows.push({ label: '⏱ Booking Expiry', value: formatDateTime(bk.booking_expiry) + ' (' + bk.remaining_label + ')' });
        rows.push({ label: '🔄 Action',         value: 'Converting booking → On Rental (keys handed over)' });
    }

    const container = document.getElementById('reviewRows');
    if (!container) return;
    container.innerHTML = rows.map(r =>
        `<div class="receipt-row"><span class="label">${r.label}</span><span class="value">${r.value}</span></div>`
    ).join('');
    safeSet('reviewTotal', `E ${rentalData.total?.toLocaleString() || '0'}`);
}

async function confirmRental() {
    if (!selectedCustomer || !selectedVehicle) { showToast('Missing data', 'error'); return; }
    const btn = document.querySelector('#rspanel-3 .btn-primary');
    if (btn) { btn.textContent = 'Confirming…'; btn.disabled = true; }

    try {
        let data;

        if (selectedCustomer.existing_booking && selectedVehicle.rental_id) {
            // ── Convert an existing Booking → On Rental (admin confirmed payment at pickup) ──
            const body = new URLSearchParams({
                action:     'activate',
                rental_id:  selectedVehicle.rental_id,
                emp_id:     currentUser.emp_id,
                mileage:    rentalData.mileage || '',
            });
            data = await api('/rentals.php', { method: 'POST', body });
        } else {
            // ── Brand-new walk-in rental ──
            const body = new URLSearchParams({
                action:      'create',
                cust_id:     selectedCustomer.cust_id,
                vin:         selectedVehicle.id,
                start_date:  rentalData.start_date,
                return_date: rentalData.end_date,
                purpose:     rentalData.purpose,
                mileage:     rentalData.mileage || '',
                emp_id:      currentUser.emp_id,
            });
            data = await api('/rentals.php', { method: 'POST', body });
        }

        if (data.status === 'success') {
            if (_countdownTimer) clearInterval(_countdownTimer);
            loadStats();
            const rid = data.rental_id || selectedVehicle.rental_id;
            showToast(`Rental #${rid} confirmed! Keys handed over.`, 'success');
            buildConfirmationCard(rid);
            selectedCustomer = null;
            selectedVehicle  = null;
            rentalData       = {};
        } else {
            showToast(data.message || 'Failed to create rental.', 'error');
            if (btn) { btn.textContent = '✅ Confirm & Hand Over Keys'; btn.disabled = false; }
        }
    } catch (err) {
        showToast('Server error. Please try again.', 'error');
        if (btn) { btn.textContent = '✅ Confirm & Hand Over Keys'; btn.disabled = false; }
    }
}

function buildConfirmationCard(rentalId) {
    const el = document.getElementById('rentalConfirmCard');
    if (!el) return;
    el.innerHTML = `
        <div style="text-align:center;padding:30px;">
            <div style="font-size:3.5rem;margin-bottom:14px;">🎉</div>
            <h3 style="color:var(--success);font-size:1.4rem;margin-bottom:8px;">Rental Confirmed!</h3>
            <p style="color:var(--text-muted);margin-bottom:22px;">Rental ID: <strong style="color:var(--primary-orange);font-family:'JetBrains Mono',monospace;">#${rentalId}</strong></p>
            <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:28px;">The vehicle has been handed over. Rental is now active.</p>
            <button class="btn btn-primary btn-lg" onclick="startNewRental()">Start New Rental</button>
        </div>`;
    el.style.display = '';
    document.getElementById('rentalStepsContainer').style.display = 'none';
}

function startNewRental() {
    if (_countdownTimer) clearInterval(_countdownTimer);
    document.getElementById('rentalConfirmCard').style.display = 'none';
    document.getElementById('rentalStepsContainer').style.display = '';
    document.getElementById('customerFoundCard').classList.remove('show');
    document.getElementById('customerNotFound').style.display = 'none';
    document.getElementById('lookupIdInput').value = '';
    document.getElementById('rs0-walkin').style.display = 'none';
    document.getElementById('rs0-existing').style.display = 'none';
    document.getElementById('selectedVehicleInfo').style.display = 'none';
    rentalData = {}; selectedCustomer = null; selectedVehicle = null;
    setRentalStep(0);
}

/* ===================== ACTIVE RENTALS TABLE ===================== */
async function renderRentalsTable() {
    const tbody = document.getElementById('rentalsTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">Loading…</td></tr>`;

    try {
        const data = await api('/rentals.php?action=list');
        if (data.status !== 'success' || !data.rentals.length) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><h4>No rentals found</h4></div></td></tr>`;
            return;
        }
        RENTALS_CACHE = data.rentals;
        tbody.innerHTML = data.rentals.map(r => {
            // Map every possible status to a badge
            const badgeMap = {
                'Booked':        '<span class="badge" style="background:rgba(33,150,243,0.15);color:#42a5f5;border:1px solid rgba(33,150,243,0.35);">🗓 Booked</span>',
                'On Rental':     '<span class="badge badge-success">🔑 On Rental</span>',
                'Late':          '<span class="badge badge-error">⚠ Late</span>',
                'Returned':      '<span class="badge badge-info">↩ Returned</span>',
                'Returned Late': '<span class="badge" style="background:rgba(255,152,0,0.15);color:#ffa726;border:1px solid rgba(255,152,0,0.35);">↩ Returned Late</span>',
                'Cancelled':     '<span class="badge" style="background:rgba(158,158,158,0.15);color:#9e9e9e;border:1px solid rgba(158,158,158,0.35);">✕ Cancelled</span>',
                'Maintenance':   '<span class="badge badge-warning">🔧 Maintenance</span>',
            };
            const statusBadge = badgeMap[r.status] || `<span class="badge badge-warning">${r.status}</span>`;

            // Action column logic
            let actionCell;
            if (r.status === 'Booked') {
                actionCell = `<button class="btn btn-sm btn-primary" onclick="activateBookedRental(${r.rental_id}, '${r.vehicle}')">✅ Activate</button>`;
            } else if (r.status === 'On Rental' || r.status === 'Late') {
                actionCell = `<button class="btn btn-sm btn-danger" onclick="processReturn(${r.rental_id})">↩ Return</button>`;
            } else {
                actionCell = `<span style="color:var(--text-muted);font-size:0.8rem;">—</span>`;
            }

            return `
            <tr>
                <td><strong style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;">#${r.rental_id}</strong></td>
                <td><strong>${r.customer}</strong></td>
                <td>${r.vehicle}</td>
                <td><span style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;">${r.plate}</span></td>
                <td>${formatDate(r.start)}</td>
                <td>${formatDate(r.expected_return)}</td>
                <td>${statusBadge}</td>
                <td>${actionCell}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="color:var(--error);text-align:center;padding:30px;">Failed to load rentals.</td></tr>`;
    }
}

/* ===================== ACTIVATE BOOKED RENTAL ===================== */
async function activateBookedRental(rentalId, vehicleName) {
    if (!confirm(`Activate rental #${rentalId} for ${vehicleName}?\n\nThis confirms the customer has paid and keys are being handed over.\nVehicle status will change from Booked → On Rental.`)) return;

    try {
        const body = new URLSearchParams({
            action:    'activate',
            rental_id: rentalId,
            emp_id:    currentUser.emp_id,
        });
        const data = await api('/rentals.php', { method: 'POST', body });
        if (data.status === 'success') {
            showToast(data.message, 'success');
            loadStats();
            renderRentalsTable();
        } else {
            showToast(data.message || 'Activation failed.', 'error');
        }
    } catch (err) {
        showToast('Server error during activation.', 'error');
    }
}

/* ===================== RETURNS ===================== */

// ── Tab entry point ──────────────────────────────────────────
async function renderReturnsSection() {
    const el = document.getElementById('returnsList');
    if (!el) return;
    el.innerHTML = '<div style="padding:20px;color:var(--text-muted);">Loading…</div>';

    try {
        const data = await api('/returns.php?action=pending');
        if (data.status !== 'success' || !data.pending?.length) {
            el.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">✅</div>
                    <h4>No pending returns</h4>
                    <p>All rentals have been returned</p>
                </div>`;
            return;
        }
        el.innerHTML = data.pending.map(r => buildReturnCard(r)).join('');
    } catch (err) {
        el.innerHTML = `<div style="color:var(--error);padding:20px;">Failed to load returns. Check server connection.</div>`;
    }
}

// ── Card builder ─────────────────────────────────────────────
function buildReturnCard(r) {
    const isLate   = r.is_late;
    const lateBadge = isLate
        ? `<span class="badge badge-error" style="margin-bottom:6px;display:inline-block;">
               ⚠ ${r.hours_late}h late
           </span>`
        : `<span class="badge badge-success" style="margin-bottom:6px;display:inline-block;">✓ On Time</span>`;

    const lateFeeBlock = isLate ? `
        <div style="margin-top:12px;padding:12px 16px;
             background:rgba(244,67,54,0.08);border:1px solid rgba(244,67,54,0.25);
             border-radius:10px;font-size:0.85rem;">
            <div style="color:var(--error);font-weight:700;margin-bottom:6px;">⏱ Late Return Fee</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;color:var(--text-secondary);">
                <div><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Hours Late</div>
                     <div style="font-weight:700;color:#f87171;">${r.hours_late}h</div></div>
                <div><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Late Fee</div>
                     <div style="font-weight:700;color:#f87171;">E ${r.late_fee.toLocaleString()}</div></div>
                <div><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Grand Total</div>
                     <div style="font-weight:700;color:#ff6b35;">E ${r.grand_total.toLocaleString()}</div></div>
            </div>
        </div>` : `
        <div style="margin-top:12px;padding:10px 16px;
             background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);
             border-radius:10px;font-size:0.85rem;color:var(--text-secondary);">
            Base total: <strong style="color:#4ade80;">E ${r.base_total.toLocaleString()}</strong>
            &nbsp;(${r.rental_days} day${r.rental_days !== 1 ? 's' : ''} × E ${r.daily_rate.toLocaleString()}/day)
        </div>`;

    return `
    <div class="card" style="margin-bottom:16px;" id="rcard-${r.rental_id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.78rem;color:var(--text-muted);font-family:'JetBrains Mono',monospace;margin-bottom:4px;">#${r.rental_id}</div>
                <div style="font-size:1.05rem;font-weight:700;">${escHtml(r.customer)}</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:2px;">
                    ${escHtml(r.vehicle)} · <span style="font-family:'JetBrains Mono',monospace;">${escHtml(r.plate)}</span>
                </div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">
                    📅 Due: ${formatDate(r.expected_return)} &nbsp;|&nbsp; Daily: E ${r.daily_rate.toLocaleString()}
                </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                ${lateBadge}
            </div>
        </div>
        ${lateFeeBlock}
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-success btn-sm" onclick="openReturnModal(${JSON.stringify(r).replace(/"/g, '&quot;')})">
                ↩ Process Return
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openChargeTableAdmin()">
                ⚙ Late Charge Table
            </button>
        </div>
    </div>`;
}

// ── Escape HTML ───────────────────────────────────────────────
function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Process Return Modal ──────────────────────────────────────
function openReturnModal(rental) {
    // Remove any old modal
    document.getElementById('returnModal')?.remove();

    const now = new Date();
    const expectedDt = new Date(rental.expected_return);
    const defaultActual = now.toISOString().slice(0, 16); // datetime-local value

    // Compute initial hours late
    let hoursLate = Math.max(0, Math.ceil((now - expectedDt) / 3600000));
    let isLate = hoursLate > 0;

    const modal = document.createElement('div');
    modal.id = 'returnModal';
    modal.style.cssText = `
        position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.75);
        display:flex;align-items:center;justify-content:center;padding:20px;
        backdrop-filter:blur(4px);`;
    modal.innerHTML = `
        <div style="background:var(--dark,#111);border:1px solid rgba(255,107,53,0.25);
             border-radius:18px;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;
             box-shadow:0 24px 80px rgba(0,0,0,0.8);">
            <!-- Header -->
            <div style="padding:24px 28px 18px;border-bottom:1px solid rgba(255,107,53,0.12);
                 background:linear-gradient(135deg,rgba(255,107,53,0.1) 0%,transparent 60%);
                 border-radius:18px 18px 0 0;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="font-size:0.78rem;color:var(--text-muted);font-family:'JetBrains Mono',monospace;margin-bottom:4px;">
                            RETURN — #${rental.rental_id}
                        </div>
                        <div style="font-size:1.2rem;font-weight:800;">${escHtml(rental.customer)}</div>
                        <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:2px;">
                            ${escHtml(rental.vehicle)} · <span style="font-family:'JetBrains Mono',monospace;">${escHtml(rental.plate)}</span>
                        </div>
                    </div>
                    <button onclick="document.getElementById('returnModal').remove()"
                        style="background:rgba(255,255,255,0.06);border:none;color:var(--text-muted);
                               border-radius:50%;width:34px;height:34px;font-size:1.1rem;cursor:pointer;">✕</button>
                </div>
            </div>

            <!-- Body -->
            <div style="padding:24px 28px;">
                <!-- Actual return date/time -->
                <div style="margin-bottom:18px;">
                    <label style="font-size:0.78rem;font-weight:700;text-transform:uppercase;
                           letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:8px;">
                        Actual Return Date &amp; Time
                    </label>
                    <input type="datetime-local" id="rmActualDate" value="${defaultActual}"
                        oninput="rmRecalculate(${rental.rental_id}, '${rental.expected_return}', ${rental.daily_rate}, ${rental.base_total})"
                        style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
                               border-radius:8px;padding:10px 14px;color:var(--text-primary,#f0f0f0);font-size:0.92rem;">
                </div>

                <!-- Late status indicator (dynamic) -->
                <div id="rmLateBlock" style="margin-bottom:18px;"></div>

                <!-- Admin charge entry -->
                <div id="rmChargeBlock" style="margin-bottom:18px;display:none;">
                    <label style="font-size:0.78rem;font-weight:700;text-transform:uppercase;
                           letter-spacing:.5px;color:#ff6b35;display:block;margin-bottom:8px;">
                        ⚠ Late Charge Amount (E)
                    </label>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <input type="number" id="rmLateCharge" min="0" step="0.01"
                            oninput="rmUpdateTotal(${rental.base_total})"
                            style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(244,67,54,0.4);
                                   border-radius:8px;padding:10px 14px;color:#f87171;font-size:1rem;font-weight:700;">
                        <button class="btn btn-secondary btn-sm" onclick="rmLookupCharge(${rental.daily_rate})"
                            style="white-space:nowrap;">📊 Lookup Table</button>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">
                        Admin can override the auto-calculated amount above.
                    </div>
                </div>

                <!-- Total summary (dynamic) -->
                <div id="rmTotalBlock" style="padding:14px 18px;
                     background:rgba(255,107,53,0.06);border:1px solid rgba(255,107,53,0.18);
                     border-radius:10px;margin-bottom:18px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:0.85rem;">
                        <div>
                            <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Base Total</div>
                            <div style="font-weight:700;">E ${rental.base_total.toLocaleString()}</div>
                        </div>
                        <div>
                            <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Late Fee</div>
                            <div id="rmDispLateFee" style="font-weight:700;color:#f87171;">E 0</div>
                        </div>
                        <div>
                            <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Grand Total</div>
                            <div id="rmDispGrandTotal" style="font-weight:800;color:#ff6b35;font-size:1.05rem;">E ${rental.base_total.toLocaleString()}</div>
                        </div>
                    </div>
                </div>

                <!-- Comments -->
                <div style="margin-bottom:20px;">
                    <label style="font-size:0.78rem;font-weight:700;text-transform:uppercase;
                           letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:8px;">
                        Inspection Notes / Comments
                    </label>
                    <textarea id="rmComments" rows="3" placeholder="Vehicle condition, damages, mileage…"
                        style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
                               border-radius:8px;padding:10px 14px;color:var(--text-primary,#f0f0f0);
                               font-size:0.88rem;resize:vertical;box-sizing:border-box;"></textarea>
                </div>

                <!-- Actions -->
                <div style="display:flex;gap:12px;">
                    <button class="btn btn-success" style="flex:1;font-weight:700;"
                        onclick="finalizeReturn2(${rental.rental_id}, ${rental.base_total})">
                        ✓ Confirm Return &amp; Generate Receipt
                    </button>
                    <button class="btn btn-secondary" onclick="document.getElementById('returnModal').remove()">
                        Cancel
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Initial recalculate
    rmRecalculate(rental.rental_id, rental.expected_return, rental.daily_rate, rental.base_total);
}

// ── Dynamic recalculation inside modal ───────────────────────
async function rmRecalculate(rentalId, expectedReturn, dailyRate, baseTotal) {
    const actualVal = document.getElementById('rmActualDate')?.value;
    if (!actualVal) return;

    const actual   = new Date(actualVal);
    const expected = new Date(expectedReturn);
    const hoursLate = Math.max(0, Math.ceil((actual - expected) / 3600000));
    const isLate   = hoursLate > 0;

    const lateBlock   = document.getElementById('rmLateBlock');
    const chargeBlock = document.getElementById('rmChargeBlock');
    const chargeInput = document.getElementById('rmLateCharge');

    if (lateBlock) {
        lateBlock.innerHTML = isLate ? `
            <div style="padding:10px 14px;background:rgba(244,67,54,0.1);
                 border:1px solid rgba(244,67,54,0.3);border-radius:8px;
                 font-size:0.85rem;color:#f87171;font-weight:600;">
                ⚠ Vehicle is <strong>${hoursLate} hour(s) late</strong>.
                Expected: ${new Date(expected).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
            </div>` : `
            <div style="padding:10px 14px;background:rgba(34,197,94,0.08);
                 border:1px solid rgba(34,197,94,0.25);border-radius:8px;
                 font-size:0.85rem;color:#4ade80;font-weight:600;">
                ✓ On time return. No late fee applicable.
            </div>`;
    }

    if (chargeBlock) chargeBlock.style.display = isLate ? 'block' : 'none';

    // Auto-fill late charge from lookup if field is empty
    if (isLate && chargeInput && (!chargeInput.value || chargeInput.value === '0')) {
        try {
            const data = await api('/returns.php?action=charge_table');
            if (data.status === 'success') {
                const fee = lookupFeeFromRates(data.rates, hoursLate, dailyRate);
                chargeInput.value = fee.toFixed(2);
            }
        } catch (_) {}
    }

    rmUpdateTotal(baseTotal);
}

// ── Client-side fee lookup (mirrors PHP logic) ────────────────
function lookupFeeFromRates(rates, hoursLate, dailyRate) {
    let extraDays = 0;
    if (hoursLate > 4) {
        extraDays = Math.floor((hoursLate - 1) / 24);
        hoursLate = Math.min(4, hoursLate - (extraDays * 24));
        if (hoursLate < 1) hoursLate = 1;
    }
    const lookupHours = Math.min(4, Math.max(1, hoursLate));
    const candidates  = rates
        .filter(r => parseInt(r.HOURS_LATE) === lookupHours && parseFloat(r.RATE_BRACKET) <= dailyRate)
        .sort((a, b) => parseFloat(b.RATE_BRACKET) - parseFloat(a.RATE_BRACKET));
    let fee = candidates.length
        ? parseFloat(candidates[0].CHARGE_AMOUNT)
        : dailyRate * 1.5 * Math.max(1, Math.ceil(hoursLate / 24));
    if (extraDays > 0) fee += extraDays * dailyRate;
    return Math.round(fee * 100) / 100;
}

// ── Helper: lookup button inside modal ────────────────────────
async function rmLookupCharge(dailyRate) {
    const actualVal  = document.getElementById('rmActualDate')?.value;
    const expectedEl = document.getElementById('rmLateBlock');
    if (!actualVal) return;

    // Parse hours late from the late block text
    const match = expectedEl?.textContent?.match(/(\d+) hour/);
    const hoursLate = match ? parseInt(match[1]) : 1;

    try {
        const data = await api('/returns.php?action=charge_table');
        if (data.status !== 'success') { showToast('Could not load charge table', 'error'); return; }
        openChargeTableViewer(data.rates, dailyRate, hoursLate);
    } catch (_) {
        showToast('Server error loading charge table', 'error');
    }
}

// ── Update totals ─────────────────────────────────────────────
function rmUpdateTotal(baseTotal) {
    const chargeInput = document.getElementById('rmLateCharge');
    const lateFee = parseFloat(chargeInput?.value || 0) || 0;
    const grand   = baseTotal + lateFee;
    const dispLate  = document.getElementById('rmDispLateFee');
    const dispGrand = document.getElementById('rmDispGrandTotal');
    if (dispLate)  dispLate.textContent  = `E ${lateFee.toLocaleString('en-ZA', {minimumFractionDigits:2})}`;
    if (dispGrand) dispGrand.textContent = `E ${grand.toLocaleString('en-ZA', {minimumFractionDigits:2})}`;
}

// ── Finalize return ───────────────────────────────────────────
async function finalizeReturn2(rentalId, baseTotal) {
    const actualVal  = document.getElementById('rmActualDate')?.value;
    const comments   = document.getElementById('rmComments')?.value || '';
    const chargeInput = document.getElementById('rmLateCharge');
    const lateCharge = parseFloat(chargeInput?.value || 0) || 0;
    const actual     = actualVal ? new Date(actualVal) : new Date();

    // Format to MySQL datetime
    const actualDate = actual.getFullYear() + '-' +
        String(actual.getMonth()+1).padStart(2,'0') + '-' +
        String(actual.getDate()).padStart(2,'0') + ' ' +
        String(actual.getHours()).padStart(2,'0') + ':' +
        String(actual.getMinutes()).padStart(2,'0') + ':00';

    // Compute hours late
    const expectedMatch = document.getElementById('rmLateBlock')?.textContent?.match(/(\d+) hour/);
    const hoursLate = expectedMatch ? parseInt(expectedMatch[1]) : 0;

    try {
        const body = JSON.stringify({
            action: 'process',
            rental_id: rentalId,
            comments,
            actual_date: actualDate,
            hours_late: hoursLate,
            late_charge: lateCharge,
        });
        const data = await api('/returns.php?action=process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        if (data.status === 'success') {
            document.getElementById('returnModal')?.remove();
            showToast(data.message, 'success');
            loadStats?.();
            renderReturnsSection();
            renderRentalsTable?.();
            // Auto-open receipt
            setTimeout(() => openReceipt(rentalId), 600);
        } else {
            showToast(data.message || 'Return failed.', 'error');
        }
    } catch (err) {
        showToast('Server error during return.', 'error');
    }
}

// ── Open receipt (after return) ───────────────────────────────
async function openReceipt(rentalId) {
    document.getElementById('receiptModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'receiptModal';
    modal.style.cssText = `
        position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.85);
        display:flex;align-items:flex-start;justify-content:center;padding:30px 20px;
        backdrop-filter:blur(6px);overflow-y:auto;`;
    modal.innerHTML = `
        <div style="background:#fff;color:#111;width:100%;max-width:680px;border-radius:12px;
             box-shadow:0 32px 100px rgba(0,0,0,0.9);overflow:hidden;" id="receiptContent">
            <div style="padding:40px;font-family:'Courier New',monospace;font-size:0.88rem;color:#222;">
                <div style="text-align:center;margin-bottom:24px;padding-bottom:24px;
                     border-bottom:2px dashed #ccc;">
                    <div style="font-size:0.7rem;letter-spacing:3px;color:#888;margin-bottom:6px;">OFFICIAL RECEIPT</div>
                    <div style="font-size:1.8rem;font-weight:900;letter-spacing:-1px;color:#000;">DARKETZ</div>
                    <div style="font-size:0.75rem;color:#666;margin-top:4px;">CAR RENTAL MANAGEMENT</div>
                    <div style="font-size:0.72rem;color:#aaa;margin-top:2px;">Loading receipt…</div>
                </div>
            </div>
        </div>
        <button onclick="document.getElementById('receiptModal').remove()"
            style="position:fixed;top:20px;right:20px;background:rgba(255,255,255,0.1);
                   border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:50%;
                   width:40px;height:40px;font-size:1.2rem;cursor:pointer;">✕</button>`;
    document.body.appendChild(modal);

    try {
        const data = await api(`/returns.php?action=receipt&rental_id=${rentalId}`);
        if (data.status === 'success') {
            renderReceiptContent(data.receipt);
        } else {
            document.getElementById('receiptContent').innerHTML =
                `<div style="padding:40px;color:red;">Failed to load receipt: ${data.message}</div>`;
        }
    } catch (_) {
        document.getElementById('receiptContent').innerHTML =
            `<div style="padding:40px;color:red;">Server error loading receipt.</div>`;
    }
}

// ── Render receipt HTML ───────────────────────────────────────
function renderReceiptContent(r) {
    const rc = document.getElementById('receiptContent');
    if (!rc) return;

    const fmtMoney = v => `E ${parseFloat(v||0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const fmtDt    = s => s ? new Date(s).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'N/A';

    const lateRow = r.is_late ? `
        <tr style="color:#c00;">
            <td style="padding:6px 0;border-bottom:1px solid #eee;">
                Late Fee (${r.hours_late}h late)
            </td>
            <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;">
                ${fmtMoney(r.late_fee)}
            </td>
        </tr>` : '';

    rc.innerHTML = `
        <div style="padding:40px;font-family:'Courier New',monospace;font-size:0.88rem;color:#222;">
            <!-- Header -->
            <div style="text-align:center;margin-bottom:28px;padding-bottom:20px;border-bottom:2px dashed #ccc;">
                <div style="font-size:0.7rem;letter-spacing:3px;color:#888;margin-bottom:6px;">OFFICIAL RECEIPT</div>
                <div style="font-size:2rem;font-weight:900;letter-spacing:-1px;color:#000;">DARKETZ</div>
                <div style="font-size:0.75rem;color:#666;margin-top:2px;">CAR RENTAL MANAGEMENT</div>
                <div style="margin-top:14px;font-size:0.78rem;color:#aaa;">
                    Receipt #RTN-${String(r.rental_id).padStart(5,'0')} &nbsp;|&nbsp; ${fmtDt(r.actual_return)}
                </div>
            </div>

            <!-- Customer -->
            <div style="margin-bottom:20px;">
                <div style="font-size:0.65rem;letter-spacing:2px;color:#999;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:4px;">
                    CUSTOMER DETAILS
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                    <tr><td style="padding:3px 0;color:#666;width:40%;">Name</td><td style="font-weight:700;">${escHtml(r.customer_name)}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">ID / Passport</td><td>${escHtml(r.customer_id)}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">Phone</td><td>${escHtml(r.customer_phone||'—')}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">Email</td><td>${escHtml(r.customer_email||'—')}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">Licence No.</td><td>${escHtml(r.license_no||'—')}</td></tr>
                </table>
            </div>

            <!-- Vehicle -->
            <div style="margin-bottom:20px;">
                <div style="font-size:0.65rem;letter-spacing:2px;color:#999;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:4px;">
                    VEHICLE DETAILS
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                    <tr><td style="padding:3px 0;color:#666;width:40%;">Vehicle</td><td style="font-weight:700;">${escHtml(r.vehicle_name)}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">Plate Number</td><td style="font-family:'Courier New',monospace;font-weight:700;">${escHtml(r.plate)}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">VIN</td><td style="font-family:'Courier New',monospace;font-size:0.78rem;">${escHtml(r.vin)}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">Type</td><td>${escHtml(r.vehicle_type||'—')}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">Purpose</td><td>${escHtml(r.purpose||'—')}</td></tr>
                </table>
            </div>

            <!-- Rental period -->
            <div style="margin-bottom:20px;">
                <div style="font-size:0.65rem;letter-spacing:2px;color:#999;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:4px;">
                    RENTAL PERIOD
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                    <tr><td style="padding:3px 0;color:#666;width:40%;">Start Date</td><td>${fmtDt(r.start_date)}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">Expected Return</td><td>${fmtDt(r.expected_return)}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">Actual Return</td>
                        <td style="${r.is_late ? 'color:#c00;font-weight:700;' : ''}">${fmtDt(r.actual_return)}</td></tr>
                    <tr><td style="padding:3px 0;color:#666;">Days Rented</td><td>${r.rental_days} day${r.rental_days!==1?'s':''}</td></tr>
                    ${r.is_late ? `<tr><td style="padding:3px 0;color:#c00;">Hours Late</td><td style="color:#c00;font-weight:700;">${r.hours_late} hour(s)</td></tr>` : ''}
                </table>
            </div>

            <!-- Charges -->
            <div style="margin-bottom:24px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;padding:16px;">
                <div style="font-size:0.65rem;letter-spacing:2px;color:#999;margin-bottom:12px;">CHARGES SUMMARY</div>
                <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                    <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #eee;">
                            Base Rental (${r.rental_days}d × ${fmtMoney(r.daily_rate)}/day)
                        </td>
                        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;">${fmtMoney(r.base_total)}</td>
                    </tr>
                    ${lateRow}
                    <tr style="font-size:1rem;font-weight:900;color:#000;">
                        <td style="padding:10px 0 0;">GRAND TOTAL</td>
                        <td style="padding:10px 0 0;text-align:right;">${fmtMoney(r.grand_total)}</td>
                    </tr>
                </table>
            </div>

            ${r.is_late ? `
            <!-- Late return notice -->
            <div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;padding:14px;margin-bottom:20px;font-size:0.78rem;color:#991b1b;">
                <strong>LATE RETURN NOTICE:</strong> This vehicle was returned ${r.hours_late} hour(s) after the agreed return time.
                A late fee of ${fmtMoney(r.late_fee)} has been applied in accordance with the rental agreement.
                Cars will not be received after 5:00PM.
            </div>` : ''}

            ${r.comments ? `
            <div style="margin-bottom:20px;font-size:0.8rem;color:#555;padding:10px;background:#f5f5f5;border-radius:6px;">
                <strong>Inspection Notes:</strong> ${escHtml(r.comments)}
            </div>` : ''}

            <!-- T&C snippet -->
            <div style="font-size:0.7rem;color:#aaa;border-top:1px dashed #ddd;padding-top:16px;line-height:1.5;">
                The deposit paid upon rental will only be returned in full if the vehicle is returned in the same condition.
                Vehicle to be driven only by the person that rented the car or deposit will be forfeited.
                Client is liable for up to E7,000 (sedan) / E10,000 (van/SUV) in case of accident or theft.
            </div>

            <!-- Signature -->
            <div style="margin-top:32px;display:flex;justify-content:space-between;font-size:0.8rem;color:#888;">
                <div>Customer Signature: ___________________________</div>
                <div>Agent: ___________________________</div>
            </div>
        </div>

        <!-- Print / PDF actions -->
        <div style="padding:16px 40px 24px;display:flex;gap:12px;background:#f5f5f5;
             border-top:1px solid #e0e0e0;">
            <button onclick="printReceipt()"
                style="background:#111;color:#fff;border:none;border-radius:8px;padding:10px 24px;
                       font-size:0.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;">
                🖨 Print / Save as PDF
            </button>
            <button onclick="document.getElementById('receiptModal').remove()"
                style="background:#e5e5e5;color:#333;border:none;border-radius:8px;padding:10px 20px;
                       font-size:0.88rem;cursor:pointer;">
                Close
            </button>
        </div>`;
}

// ── Print / Save as PDF ───────────────────────────────────────
function printReceipt() {
    const content = document.getElementById('receiptContent');
    if (!content) return;

    const printWin = window.open('', '_blank', 'width=800,height=900');
    printWin.document.write(`<!DOCTYPE html>
<html><head>
<title>DARKETZ — Return Receipt</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Courier New',monospace; font-size:12px; color:#111; background:#fff; }
  @media print {
    body { margin:0; }
    .no-print { display:none !important; }
    @page { margin:15mm; size:A4; }
  }
</style>
</head><body>
${content.innerHTML}
<script>
  // Remove the print/close button row inside the popup
  document.querySelector('[style*="background:#f5f5f5"]')?.remove();
  window.onload = () => { window.print(); }
<\/script>
</body></html>`);
    printWin.document.close();
}

// ── Charge Table Admin Viewer ─────────────────────────────────
async function openChargeTableAdmin() {
    document.getElementById('chargeTableModal')?.remove();

    let rates = [];
    try {
        const data = await api('/returns.php?action=charge_table');
        if (data.status === 'success') rates = data.rates;
    } catch (_) {}

    const BRACKETS = [400, 450, 500, 550, 600, 700, 900];
    const HOURS    = [1, 2, 3, 4];

    // Build a lookup map
    const rateMap = {};
    rates.forEach(r => {
        rateMap[`${r.HOURS_LATE}_${parseFloat(r.RATE_BRACKET)}`] = parseFloat(r.CHARGE_AMOUNT);
    });

    const headerCells = BRACKETS.map(b => `<th style="background:#1a1a1a;padding:10px 14px;font-size:0.78rem;color:#ff6b35;">E ${b}</th>`).join('');
    const bodyRows = HOURS.map(h => {
        const cells = BRACKETS.map(b => {
            const key = `${h}_${b}`;
            const val = rateMap[key] ?? '';
            return `<td style="padding:6px;"><input type="number" data-h="${h}" data-b="${b}"
                value="${val}" min="0" step="0.01"
                style="width:80px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
                       border-radius:6px;padding:6px 8px;color:#f0f0f0;font-size:0.85rem;text-align:right;"></td>`;
        }).join('');
        return `<tr>
            <td style="padding:8px 14px;font-weight:700;color:#ff6b35;white-space:nowrap;font-size:0.85rem;">
                ${h} hr${h>1?'s':''} late
            </td>${cells}
        </tr>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'chargeTableModal';
    modal.style.cssText = `
        position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,0.8);
        display:flex;align-items:center;justify-content:center;padding:20px;
        backdrop-filter:blur(4px);`;
    modal.innerHTML = `
        <div style="background:var(--dark,#111);border:1px solid rgba(255,107,53,0.25);
             border-radius:18px;width:100%;max-width:760px;max-height:90vh;overflow-y:auto;
             box-shadow:0 24px 80px rgba(0,0,0,0.8);">
            <div style="padding:24px 28px 16px;border-bottom:1px solid rgba(255,107,53,0.12);
                 display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-weight:800;font-size:1.05rem;">⚙ Late Return Charge Table</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">
                        Edit amounts (E) per hours-late × daily-rate bracket. Save to update the database.
                    </div>
                </div>
                <button onclick="document.getElementById('chargeTableModal').remove()"
                    style="background:rgba(255,255,255,0.06);border:none;color:var(--text-muted);
                           border-radius:50%;width:34px;height:34px;font-size:1.1rem;cursor:pointer;">✕</button>
            </div>
            <div style="padding:20px 28px;overflow-x:auto;">
                <table style="border-collapse:collapse;width:100%;min-width:560px;">
                    <thead>
                        <tr>
                            <th style="background:#1a1a1a;padding:10px 14px;font-size:0.78rem;color:var(--text-muted);text-align:left;">
                                Hours Late / Daily Rate
                            </th>
                            ${headerCells}
                        </tr>
                    </thead>
                    <tbody id="ctBody">${bodyRows}</tbody>
                </table>
            </div>
            <div style="padding:16px 28px 24px;display:flex;gap:12px;border-top:1px solid rgba(255,107,53,0.1);">
                <button class="btn btn-success" onclick="saveChargeTable()" style="font-weight:700;">
                    💾 Save Charge Table
                </button>
                <button class="btn btn-secondary" onclick="document.getElementById('chargeTableModal').remove()">
                    Cancel
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function saveChargeTable() {
    const inputs = document.querySelectorAll('#ctBody input');
    const rows   = [];
    inputs.forEach(inp => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) {
            rows.push({
                hours_late: parseInt(inp.dataset.h),
                rate_bracket: parseFloat(inp.dataset.b),
                charge_amount: v,
            });
        }
    });

    try {
        const data = await api('/returns.php?action=save_charge_table', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rows),
        });
        if (data.status === 'success' || data.status === 'partial') {
            showToast(data.message, data.status === 'success' ? 'success' : 'warning');
            document.getElementById('chargeTableModal')?.remove();
        } else {
            showToast(data.message || 'Save failed.', 'error');
        }
    } catch (_) {
        showToast('Server error saving charge table.', 'error');
    }
}

// ── Charge table viewer (inline lookup from modal) ────────────
function openChargeTableViewer(rates, dailyRate, hoursLate) {
    const fee = lookupFeeFromRates(rates, hoursLate, dailyRate);
    const chargeInput = document.getElementById('rmLateCharge');
    if (chargeInput) {
        chargeInput.value = fee.toFixed(2);
        // Find parent modal's base total
        const disp = document.getElementById('rmDispGrandTotal');
        const baseTotalText = document.querySelector('#rmTotalBlock')?.children?.[0]?.children?.[1]?.textContent || '';
        const baseTotal = parseFloat(baseTotalText.replace(/[^0-9.]/g,'')) || 0;
        rmUpdateTotal(baseTotal);
    }
    showToast(`Auto-filled: E ${fee.toFixed(2)} (${hoursLate}h late, E ${dailyRate}/day bracket)`, 'info');
}

// ── Compat shim for old button in active rentals table ────────
function processReturn(rentalId) { navigateTo('returns'); }

// ── Old finalizeReturn shim (keep for safety) ─────────────────
async function finalizeReturn(rentalId, isLate, daysLate) {
    const comments = isLate ? `Vehicle returned ${daysLate} day(s) late.` : '';
    try {
        const body = new URLSearchParams({ action: 'process', rental_id: rentalId, comments });
        const data = await api('/returns.php', { method: 'POST', body });
        if (data.status === 'success') {
            showToast(data.message, 'success');
            loadStats?.();
            renderReturnsSection();
            renderRentalsTable?.();
        } else {
            showToast(data.message || 'Return failed.', 'error');
        }
    } catch (err) {
        showToast('Server error during return.', 'error');
    }
}

function inspectionNote(rentalId) {
    showToast(`Inspection form for rental #${rentalId} — use the ↩ Process Return button`, 'info');
}

/* ===================== CUSTOMERS TABLE ===================== */
async function renderCustomersTable() {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">Loading…</td></tr>`;

    try {
        const data = await api('/customers.php?action=list');
        if (data.status !== 'success' || !data.customers.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">No customers found.</td></tr>`;
            return;
        }
        CUSTOMERS_CACHE = data.customers;
        tbody.innerHTML = data.customers.map(c => `
            <tr>
                <td><strong style="font-family:'JetBrains Mono',monospace;">${c.id_no}</strong></td>
                <td><strong>${c.fname} ${c.lname}</strong></td>
                <td style="font-size:0.82rem;">${c.email || '—'}</td>
                <td>${c.phone || '—'}</td>
                <td>${c.license_no || '<span style="color:var(--text-muted)">Not set</span>'}</td>
                <td>${c.is_verified
                    ? '<span class="badge badge-success">Verified</span>'
                    : '<span class="badge badge-warning">Pending</span>'}</td>
                <td><button class="btn btn-sm btn-secondary" onclick="viewCustomerDetail('${c.cust_id}')">View</button></td>
            </tr>`).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="color:var(--error);text-align:center;padding:30px;">Failed to load customers.</td></tr>`;
    }
}

/* ===================== CUSTOMER PROFILE MODAL ===================== */
async function viewCustomerDetail(custId) {
    // Open modal immediately with loading state
    openCustomerProfileModal();
    setCustomerModalLoading(true);

    try {
        const data = await api(`/customers.php?action=profile&cust_id=${encodeURIComponent(custId)}`);
        if (data.status !== 'success') {
            closeCustomerProfileModal();
            showToast(data.message || 'Failed to load customer profile.', 'error');
            return;
        }
        renderCustomerProfileModal(data.customer);
    } catch (err) {
        closeCustomerProfileModal();
        showToast('Server error loading customer profile.', 'error');
    } finally {
        setCustomerModalLoading(false);
    }
}

function openCustomerProfileModal() {
    const modal = document.getElementById('customerProfileModal');
    if (modal) {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeCustomerProfileModal() {
    const modal = document.getElementById('customerProfileModal');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

function setCustomerModalLoading(isLoading) {
    const loadingEl = document.getElementById('cpm-loading');
    const contentEl = document.getElementById('cpm-content');
    if (loadingEl) loadingEl.style.display = isLoading ? 'flex' : 'none';
    if (contentEl) contentEl.style.display = isLoading ? 'none' : 'block';
}

function renderCustomerProfileModal(c) {
    const isVerified = parseInt(c.is_verified) === 1;

    // Header info
    const nameEl = document.getElementById('cpm-name');
    const idEl   = document.getElementById('cpm-id');
    const statusEl = document.getElementById('cpm-status');
    if (nameEl) nameEl.textContent = `${c.fname} ${c.lname}`;
    if (idEl)   idEl.textContent   = `ID: ${c.id_no}`;
    if (statusEl) {
        statusEl.textContent = isVerified ? 'Verified' : 'Pending Verification';
        statusEl.className   = 'cpm-status-badge ' + (isVerified ? 'verified' : 'pending');
    }

    // Profile image
    const profileImg = document.getElementById('cpm-profile-img');
    const profileInitials = document.getElementById('cpm-profile-initials');
    if (c.profile_img) {
        if (profileImg) { profileImg.src = c.profile_img; profileImg.style.display = 'block'; }
        if (profileInitials) profileInitials.style.display = 'none';
    } else {
        if (profileImg) profileImg.style.display = 'none';
        if (profileInitials) {
            profileInitials.textContent = `${(c.fname||'?')[0]}${(c.lname||'?')[0]}`.toUpperCase();
            profileInitials.style.display = 'flex';
        }
    }

    // Personal info fields
    const fields = {
        'cpm-email':      c.email      || '—',
        'cpm-phone':      c.phone      || '—',
        'cpm-work-phone': c.work_phone || '—',
        'cpm-address':    [c.address, c.city, c.country].filter(Boolean).join(', ') || '—',
        'cpm-license-no': c.license_no || '—',
        'cpm-created':    c.created_at ? formatDate(c.created_at) : '—',
        'cpm-kin-name':   (c.kin_fname || c.kin_lname) ? `${c.kin_fname || ''} ${c.kin_lname || ''}`.trim() : '—',
        'cpm-kin-phone':  c.kin_phone   || '—',
        'cpm-kin-addr':   c.kin_address || '—',
    };
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // License images
    renderLicenseImage('cpm-license-front', 'cpm-license-front-placeholder', c.license_front_url, 'Front of License');
    renderLicenseImage('cpm-license-back',  'cpm-license-back-placeholder',  c.license_back_url,  'Back of License');

    // Verify button
    const verifyBtn = document.getElementById('cpm-verify-btn');
    if (verifyBtn) {
        if (isVerified) {
            verifyBtn.textContent = '✓ Customer Verified';
            verifyBtn.disabled = true;
            verifyBtn.classList.add('btn-verified-done');
        } else {
            verifyBtn.textContent = '✔ Verify Customer';
            verifyBtn.disabled = false;
            verifyBtn.classList.remove('btn-verified-done');
            verifyBtn.onclick = () => verifyCustomerFromModal(c.cust_id);
        }
    }
}

function renderLicenseImage(imgId, placeholderId, url, label) {
    const imgEl  = document.getElementById(imgId);
    const phEl   = document.getElementById(placeholderId);
    if (!imgEl || !phEl) return;

    if (url) {
        // Show loading state first
        imgEl.style.display = 'none';
        phEl.style.display  = 'flex';
        phEl.innerHTML      = '<span style="font-size:1.5rem;opacity:0.4;">⏳</span><span>Loading…</span>';

        imgEl.onload = () => {
            imgEl.style.display = 'block';
            phEl.style.display  = 'none';
            imgEl.onclick = () => openImageLightbox(url, label);
        };
        imgEl.onerror = () => {
            // Broken/wrong URL — show placeholder instead of error page
            imgEl.style.display = 'none';
            phEl.style.display  = 'flex';
            phEl.innerHTML      = '<span style="font-size:2rem;opacity:0.4;">📷</span><span>Image unavailable</span>';
        };
        imgEl.src = url;
    } else {
        imgEl.style.display = 'none';
        phEl.style.display  = 'flex';
        phEl.innerHTML      = '<span style="font-size:2rem;opacity:0.4;">📷</span><span>No image on file</span>';
    }
}

function openImageLightbox(src, label) {
    const lb = document.getElementById('cpm-lightbox');
    const lbImg = document.getElementById('cpm-lightbox-img');
    const lbLabel = document.getElementById('cpm-lightbox-label');
    if (lb && lbImg) {
        lbImg.src = src;
        if (lbLabel) lbLabel.textContent = label || '';
        lb.classList.add('open');
    }
}

function closeLightbox() {
    const lb = document.getElementById('cpm-lightbox');
    if (lb) lb.classList.remove('open');
}

async function verifyCustomerFromModal(custId) {
    const verifyBtn = document.getElementById('cpm-verify-btn');
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying…'; }

    try {
        const body = new URLSearchParams({ action: 'verify', cust_id: custId });
        const data = await api('/customers.php', { method: 'POST', body });

        if (data.status === 'success') {
            showToast('Customer successfully verified!', 'success');
            // Update UI immediately
            const statusEl = document.getElementById('cpm-status');
            if (statusEl) {
                statusEl.textContent = 'Verified';
                statusEl.className = 'cpm-status-badge verified';
            }
            if (verifyBtn) {
                verifyBtn.textContent = '✓ Customer Verified';
                verifyBtn.classList.add('btn-verified-done');
                verifyBtn.disabled = true;
            }
            // Refresh the customers table in the background
            renderCustomersTable();
        } else {
            showToast(data.message || 'Verification failed.', 'error');
            if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = '✔ Verify Customer'; }
        }
    } catch (err) {
        showToast('Server error during verification.', 'error');
        if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = '✔ Verify Customer'; }
    }
}

/* ===================== VEHICLES GRID ===================== */
async function renderVehiclesGrid() {
    const grid = document.getElementById('vehiclesMgmtGrid');
    if (!grid) return;
    grid.innerHTML = '<div style="padding:20px;color:var(--text-muted);">Loading…</div>';

    try {
        const data = await api('/vehicles.php?action=list');
        if (data.status !== 'success' || !data.vehicles.length) {
            grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🚗</div><h4>No vehicles found</h4></div>`;
            return;
        }
        VEHICLES_CACHE = data.vehicles;
        const badgeMap = {
            'Available':   '<span class="badge badge-success">Available</span>',
            'On Rental':   '<span class="badge badge-orange">On Rental</span>',
            'Maintenance': '<span class="badge badge-warning">Maintenance</span>',
        };
        grid.innerHTML = data.vehicles.map(v => `
            <div class="vehicle-mgmt-card">
                <div class="vehicle-mgmt-img">
                    <img src="${v.image || 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=250&fit=crop'}" alt="${v.make}" loading="lazy">
                    <div class="vehicle-status-dot">${badgeMap[v.status] || ''}</div>
                </div>
                <div class="vehicle-mgmt-body">
                    <div class="vehicle-mgmt-name">${v.brand} ${v.make} ${v.model}</div>
                    <div class="vehicle-mgmt-meta">${v.plate} · ${v.category} · E ${v.daily_rate.toLocaleString()}/day</div>
                    <div class="vehicle-mgmt-actions">
                        <button class="btn btn-sm btn-secondary" onclick="editVehicle('${v.id}')">✏ Edit</button>
                        <button class="btn btn-sm ${v.status === 'Maintenance' ? 'btn-success' : 'btn-danger'}"
                                onclick="toggleVehicleStatus('${v.id}')">
                            ${v.status === 'Maintenance' ? '✓ Mark Available' : '🔧 Maintenance'}
                        </button>
                        <button class="btn btn-sm btn-delete-vehicle" onclick="deleteVehicle('${v.id}', '${(v.brand+' '+v.make+' '+v.model).replace(/'/g,"\\'")}', '${v.status}')">🗑 Delete</button>
                    </div>
                </div>
            </div>`).join('');
    } catch (err) {
        grid.innerHTML = `<div style="color:var(--error);padding:20px;">Failed to load vehicles.</div>`;
    }
}

async function toggleVehicleStatus(vehicleId) {
    try {
        const body = new URLSearchParams({ action: 'toggle_status', vehicle_id: vehicleId });
        const data = await api('/vehicles.php', { method: 'POST', body });
        if (data.status === 'success') {
            showToast(data.message, 'success');
            loadStats();
            renderVehiclesGrid();
        } else {
            showToast(data.message || 'Failed to update status.', 'error');
        }
    } catch (err) {
        showToast('Server error.', 'error');
    }
}

async function deleteVehicle(vehicleId, vehicleName, vehicleStatus) {
    // Block deletion if vehicle is currently on rental
    if (vehicleStatus === 'On Rental') {
        showToast(`Cannot delete "${vehicleName}" — it is currently On Rental.`, 'error');
        return;
    }

    // Confirmation dialog
    const confirmed = confirm(
        `⚠️ Delete Vehicle\n\n"${vehicleName}"\n\nThis action cannot be undone. Are you sure?`
    );
    if (!confirmed) return;

    try {
        const body = new URLSearchParams({ action: 'delete', vehicle_id: vehicleId });
        const data = await api('/vehicles.php', { method: 'POST', body });
        if (data.status === 'success') {
            showToast(`"${vehicleName}" deleted successfully.`, 'success');
            loadStats();
            renderVehiclesGrid();
        } else {
            showToast(data.message || 'Failed to delete vehicle.', 'error');
        }
    } catch (err) {
        showToast('Server error while deleting vehicle.', 'error');
    }
}

function editVehicle(vehicleId) {
    const v = VEHICLES_CACHE.find(x => x.id == vehicleId);  // loose == handles string VIN
    if (!v) return;

    // Reset form first so previous state is cleared
    document.getElementById('addVehicleForm').reset();
    delete document.getElementById('addVehicleForm').dataset.editId;
    document.getElementById('av_image_preview').style.display = 'none';
    document.getElementById('av_image_placeholder').style.display = 'block';

    // Populate basic fields
    // API returns: id(VIN), brand, make, year(=MODEL_YEAR), plate, type, category, condition, daily_rate
    const fieldMap = { vin: 'id', brand: 'brand', make: 'make', year: 'year',
                       year_of_manu: 'year_of_manu', plate: 'plate', type: 'type',
                       category: 'category', condition: 'condition', daily_rate: 'daily_rate' };
    Object.entries(fieldMap).forEach(([htmlId, apiKey]) => {
        const el = document.getElementById(`av_${htmlId}`);
        if (el) el.value = v[apiKey] ?? '';
    });

    // Populate spec fields
    ['seats','transmission','fuel','engine','mileage','drive'].forEach(f => {
        const el = document.getElementById(`av_${f}`);
        if (el) el.value = v[f] ?? '';
    });

    // Populate features checkboxes
    const featureArr = Array.isArray(v.features) ? v.features : [];
    document.querySelectorAll('#addVehicleForm input[type="checkbox"]').forEach(cb => {
        cb.checked = featureArr.includes(cb.value);
    });

    // Show existing image preview if available
    if (v.image) {
        const previewImg = document.getElementById('av_image_preview_img');
        if (previewImg) previewImg.src = v.image;
        document.getElementById('av_image_preview').style.display = 'block';
        document.getElementById('av_image_placeholder').style.display = 'none';
    }

    document.getElementById('addVehicleForm').dataset.editId = vehicleId;
    document.getElementById('addVehicleModalTitle').textContent = `Edit Vehicle — ${v.brand} ${v.make}`;
    document.getElementById('addVehicleModal').classList.add('show');
}

function openAddVehicleModal() {
    document.getElementById('addVehicleModal').classList.add('show');
}

function closeAddVehicleModal() {
    document.getElementById('addVehicleModal').classList.remove('show');
    document.getElementById('addVehicleModalTitle').textContent = 'Add New Vehicle';
    document.getElementById('addVehicleForm').reset();
    delete document.getElementById('addVehicleForm').dataset.editId;
    document.getElementById('av_image_preview').style.display = 'none';
    document.getElementById('av_image_placeholder').style.display = 'block';
}

async function saveVehicle() {
    const form       = document.getElementById('addVehicleForm');
    const editId     = form.dataset.editId;
    const brand      = document.getElementById('av_brand')?.value.trim();
    const make       = document.getElementById('av_make')?.value.trim();
    const plate      = document.getElementById('av_plate')?.value.trim();
    const daily_rate = document.getElementById('av_daily_rate')?.value;
    

    if (!brand || !make || !plate || !daily_rate) {
        showToast('Please fill all required fields', 'error'); return;
    }
    

    const formData = new FormData();
    formData.append('action',     editId ? 'edit' : 'add');
    if (editId) {
        formData.append('vehicle_id', editId);  // VIN used as edit identifier
    } else {
        // Try av_vin first, fall back to av_model (some admin forms reuse that field for VIN)
        const vinEl = document.getElementById('av_vin') || document.getElementById('av_model');
        const vin   = vinEl?.value.trim();
        if (!vin) {
            showToast('VIN is required. Add an input with id="av_vin" to your form.', 'error');
            return;
        }
        formData.append('vin', vin);
    }

    // Basic fields — map JS field names to what PHP expects
    formData.append('brand',      document.getElementById('av_brand')?.value.trim() || '');
    formData.append('make',       document.getElementById('av_make')?.value.trim()  || '');
    formData.append('model_year', document.getElementById('av_year')?.value.trim()  || '');  // PHP: model_year
    formData.append('year_of_manu', document.getElementById('av_year_of_manu')?.value.trim() || document.getElementById('av_year')?.value.trim() || '');
    formData.append('plate',      document.getElementById('av_plate')?.value.trim()    || '');
    formData.append('type',       document.getElementById('av_type')?.value.trim()     || '');
    formData.append('category',   document.getElementById('av_category')?.value.trim() || '');
    formData.append('condition',  document.getElementById('av_condition')?.value.trim()|| '');
    formData.append('daily_rate', daily_rate);

    // Specifications — field names already match PHP
    ['seats','transmission','fuel','engine','mileage','drive'].forEach(f => {
        formData.append(f, document.getElementById(`av_${f}`)?.value || '');
    });

    // Features — checked boxes + any custom comma-separated ones
    const checkedFeatures = Array.from(
        document.querySelectorAll('#addVehicleForm input[type="checkbox"]:checked')
    ).map(cb => cb.value);
    const extraFeatures = (document.getElementById('av_extra_features')?.value || '')
        .split(',').map(f => f.trim()).filter(Boolean);
    formData.append('features', JSON.stringify([...checkedFeatures, ...extraFeatures]));

    const imgFile = document.getElementById('av_image')?.files[0];
    if (imgFile) formData.append('image', imgFile);

    try {
        const data = await api('/vehicles.php', { method: 'POST', body: formData });
        if (data.status === 'success') {
            showToast(data.message, 'success');
            closeAddVehicleModal();
            renderVehiclesGrid();
            loadStats();
        } else {
            showToast(data.message || 'Failed to save vehicle.', 'error');
        }
    } catch (err) {
        console.error('saveVehicle error:', err);
        showToast('Network error saving vehicle. Check your connection.', 'error');
    }
}

/* ===================== REPORTS ===================== */
// Opens the standalone reports page, jumping straight to the requested report.
function openReport(type) {
    const valid = ['revenue', 'fleet', 'customers', 'late_returns'];
    if (!valid.includes(type)) { showToast('Unknown report type', 'error'); return; }
    window.open(`reports.html#${type}`, '_blank');
}

// Legacy alias — any old onclick="loadReport(...)" calls still work.
function loadReport(type) {
    openReport(type);
}

/* ===================== IMAGE HELPERS ===================== */
function previewVehicleImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('av_image_preview_img').src = e.target.result;
        document.getElementById('av_image_preview').style.display = 'block';
        document.getElementById('av_image_placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function handleVehicleImageDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        document.getElementById('av_image').files = event.dataTransfer.files;
        previewVehicleImage({ target: { files: [file] } });
    }
}

/* ===================== TOAST ===================== */
function showToast(msg, type = 'info') {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(60px)';
        toast.style.transition = '0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/* ===================== EXPOSE TO WINDOW ===================== */
window.navigateTo           = navigateTo;
window.logout               = logout;
window.chooseCustomerType   = chooseCustomerType;
window.lookupCustomer       = lookupCustomer;
window.proceedFromStep0     = proceedFromStep0;
window.selectVehicleForRental = selectVehicleForRental;
window.proceedFromStep1     = proceedFromStep1;
window.updateTotalCost      = updateTotalCost;
window.proceedFromStep2     = proceedFromStep2;
window.confirmRental        = confirmRental;
window.startNewRental       = startNewRental;
window.processReturn        = processReturn;
window.finalizeReturn       = finalizeReturn;
window.finalizeReturn2      = finalizeReturn2;
window.inspectionNote       = inspectionNote;
window.openReturnModal      = openReturnModal;
window.openReceipt          = openReceipt;
window.printReceipt         = printReceipt;
window.openChargeTableAdmin = openChargeTableAdmin;
window.saveChargeTable      = saveChargeTable;
window.rmRecalculate        = rmRecalculate;
window.rmUpdateTotal        = rmUpdateTotal;
window.rmLookupCharge       = rmLookupCharge;
window.viewCustomerDetail   = viewCustomerDetail;
window.renderVehiclesGrid   = renderVehiclesGrid;
window.toggleVehicleStatus  = toggleVehicleStatus;
window.editVehicle          = editVehicle;
window.deleteVehicle        = deleteVehicle;
window.openAddVehicleModal  = openAddVehicleModal;
window.closeAddVehicleModal = closeAddVehicleModal;
window.saveVehicle          = saveVehicle;
window.buildRentalVehiclePicker = buildRentalVehiclePicker;
window.setRentalStep        = setRentalStep;
window.previewVehicleImage  = previewVehicleImage;
window.handleVehicleImageDrop = handleVehicleImageDrop;
window.loadReport           = loadReport;
window.openReport           = openReport;
window.renderBookingBadge   = renderBookingBadge;
window.clearBookingBadge    = clearBookingBadge;
window.startBookingCountdown = startBookingCountdown;
window.activateBookedRental  = activateBookedRental;