// ── API helper ───────────────────────────────────────────────
const VEHICLES_API = '../backend/vehicles.php';

async function fetchVehiclesFromAPI() {
    try {
        const res = await fetch(`${VEHICLES_API}?action=list`);
        const data = await res.json();
        if (data.status === 'success') return data.vehicles;
        console.error('API error:', data.message);
        return [];
    } catch (err) {
        console.error('Failed to fetch vehicles:', err);
        return [];
    }
}

// ── URL helper ───────────────────────────────────────────────
function getURLParameter(name) {
    return new URLSearchParams(window.location.search).get(name);
}

// ── Status badge helpers ─────────────────────────────────────
function formatReturnDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-US', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
    });
}

function buildStatusBadge(vehicle) {
    const status = (vehicle.status || 'Available').trim();
    if (status === 'On Rental') {
        const returnDate = vehicle.rental_return_date ? new Date(vehicle.rental_return_date) : null;
        const isOverdue  = returnDate && returnDate < new Date();

        if (isOverdue) {
            return `<div class="status-badge status-badge--overdue">` +
                   `🔴 On Rental<span class="status-badge-sub">Return Overdue</span></div>`;
        }

        const until = returnDate
            ? `<span class="status-badge-sub">Till ${formatReturnDate(vehicle.rental_return_date)}</span>`
            : '';
        return `<div class="status-badge status-badge--rental">🔴 On Rental${until}</div>`;
    }
    if (status === 'Maintenance') {
        return `<div class="status-badge status-badge--maintenance">🟠 Maintenance</div>`;
    }
    return `<div class="status-badge status-badge--available">🟢 Available</div>`;
}

// ── Build vehicle card ───────────────────────────────────────
function createVehicleCard(vehicle) {
    const fallbackImg = 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=500&fit=crop';
    const imgSrc = vehicle.image || fallbackImg;
    const seats = vehicle.seats || '—';
    const transmission = vehicle.transmission || '—';
    const fuel = vehicle.fuel || '—';
    const engine = vehicle.engine || '—';

    return `
        <div class="vehicle-card-detailed" data-vehicle-id="${vehicle.id}" onclick="openVehicleModal('${vehicle.id}')">
            <div class="vehicle-image-detailed">
                <img src="${imgSrc}" alt="${vehicle.brand} ${vehicle.make}" onerror="this.src='${fallbackImg}'">
                <span class="vehicle-badge">${vehicle.category || ''}</span>
                ${buildStatusBadge(vehicle)}
            </div>
            <div class="vehicle-info-detailed">
                <h3 class="vehicle-name">${vehicle.brand} ${vehicle.make}</h3>
                <p class="vehicle-model">${vehicle.year || ''} · ${vehicle.type || ''}</p>
                <div class="vehicle-specs">
                    <div class="spec-item"><span class="spec-icon">👥</span><span>${seats} Seats</span></div>
                    <div class="spec-item"><span class="spec-icon">⚙️</span><span>${transmission}</span></div>
                    <div class="spec-item"><span class="spec-icon">⛽</span><span>${fuel}</span></div>
                    <div class="spec-item"><span class="spec-icon">🔧</span><span>${engine}</span></div>
                </div>
                <div class="vehicle-price-section">
                    <div class="vehicle-price-detailed">
                        <span class="price-amount">E ${Number(vehicle.daily_rate).toLocaleString()}</span>
                        <span class="price-period">per day</span>
                    </div>
                    <button class="btn-view-details" onclick="event.stopPropagation(); openVehicleModal('${vehicle.id}')">View Details</button>
                </div>
            </div>
        </div>
    `;
}

// ── Render into grids ────────────────────────────────────────
function renderVehicles(vehicles, filterCategory = 'all') {
    const economyGrid  = document.getElementById('economy-grid');
    const suvGrid      = document.getElementById('suv-grid');
    const luxuryGrid   = document.getElementById('luxury-grid');
    const noResults    = document.getElementById('no-results');

    const economySection = document.getElementById('economy-section');
    const suvSection     = document.getElementById('suv-section');
    const luxurySection  = document.getElementById('luxury-section');

    economyGrid.innerHTML = '';
    suvGrid.innerHTML = '';
    luxuryGrid.innerHTML = '';

    const economy = vehicles.filter(v => v.category?.toLowerCase() === 'economy');
    const suv     = vehicles.filter(v => v.category?.toLowerCase() === 'suv');
    const luxury  = vehicles.filter(v => v.category?.toLowerCase() === 'luxury');

    const showEconomy = filterCategory === 'all' || filterCategory === 'economy';
    const showSuv     = filterCategory === 'all' || filterCategory === 'suv';
    const showLuxury  = filterCategory === 'all' || filterCategory === 'luxury';

    economySection.style.display = showEconomy ? 'block' : 'none';
    suvSection.style.display     = showSuv     ? 'block' : 'none';
    luxurySection.style.display  = showLuxury  ? 'block' : 'none';

    if (showEconomy) economy.forEach(v => economyGrid.innerHTML += createVehicleCard(v));
    if (showSuv)     suv.forEach(v => suvGrid.innerHTML += createVehicleCard(v));
    if (showLuxury)  luxury.forEach(v => luxuryGrid.innerHTML += createVehicleCard(v));

    const hasResults = (showEconomy && economy.length > 0)
                    || (showSuv     && suv.length > 0)
                    || (showLuxury  && luxury.length > 0);

    noResults.style.display = hasResults ? 'none' : 'block';
}

// ── Filter buttons ───────────────────────────────────────────
function setupFilterButtons(allVehicles) {
    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', function () {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const category = this.getAttribute('data-category');
            renderVehicles(allVehicles, category);
            const newUrl = category === 'all'
                ? window.location.pathname
                : `${window.location.pathname}?category=${category}`;
            window.history.pushState({}, '', newUrl);
            document.querySelector('.vehicles-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

// ── Modal ────────────────────────────────────────────────────
let allVehiclesCache = [];

function openVehicleModal(vehicleId) {
    // Use loose equality (==) to handle string/number mismatch from PHP API
    const vehicle = allVehiclesCache.find(v => v.id == vehicleId);
    if (!vehicle) return;

    const fallbackImg = 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=500&fit=crop';

    document.getElementById('modal-vehicle-image').src = vehicle.image || fallbackImg;
    document.getElementById('modal-vehicle-image').onerror = function () { this.src = fallbackImg; };
    document.getElementById('modal-vehicle-name').textContent = `${vehicle.brand} ${vehicle.make}`;
    document.getElementById('modal-vehicle-category').textContent = `${(vehicle.category || '').toUpperCase()} · ${vehicle.type || ''}`;
    document.getElementById('modal-vehicle-price').textContent = `E ${Number(vehicle.daily_rate).toLocaleString()}/day`;

    // Features
    const featuresList = document.getElementById('modal-vehicle-features');
    const features = Array.isArray(vehicle.features) ? vehicle.features : [];
    featuresList.innerHTML = features.length
        ? features.map(f => `<li>${f}</li>`).join('')
        : '<li>No features listed</li>';

    // Specs
    const specsGrid = document.getElementById('modal-vehicle-specs');
    specsGrid.innerHTML = `
        <div class="spec-detail">
            <span class="spec-detail-label">Seats</span>
            <span class="spec-detail-value">${vehicle.seats || '—'} Passengers</span>
        </div>
        <div class="spec-detail">
            <span class="spec-detail-label">Transmission</span>
            <span class="spec-detail-value">${vehicle.transmission || '—'}</span>
        </div>
        <div class="spec-detail">
            <span class="spec-detail-label">Fuel Type</span>
            <span class="spec-detail-value">${vehicle.fuel || '—'}</span>
        </div>
        <div class="spec-detail">
            <span class="spec-detail-label">Engine</span>
            <span class="spec-detail-value">${vehicle.engine || '—'}</span>
        </div>
        <div class="spec-detail">
            <span class="spec-detail-label">Drive Type</span>
            <span class="spec-detail-value">${vehicle.drive || '—'}</span>
        </div>
        <div class="spec-detail">
            <span class="spec-detail-label">Mileage / Range</span>
            <span class="spec-detail-value">${vehicle.mileage || '—'}</span>
        </div>
        <div class="spec-detail">
            <span class="spec-detail-label">Condition</span>
            <span class="spec-detail-value">${vehicle.condition || '—'}</span>
        </div>
        <div class="spec-detail">
            <span class="spec-detail-label">Year</span>
            <span class="spec-detail-value">${vehicle.year || '—'}</span>
        </div>
    `;

    document.getElementById('vehicle-modal').classList.add('active');
    document.body.style.overflow = 'hidden';

    // Book button — disabled if not Available
    const bookBtn = document.getElementById('book-vehicle-btn');
    const status = (vehicle.status || 'Available').trim();
    const isBookable = status === 'Available';

    if (isBookable) {
        bookBtn.disabled = false;
        bookBtn.classList.remove('btn-disabled');
        bookBtn.textContent = 'Book This Vehicle';
        bookBtn.onclick = () => bookVehicle(vehicle);
    } else {
        bookBtn.disabled = true;
        bookBtn.classList.add('btn-disabled');
        const returnDate = vehicle.rental_return_date ? new Date(vehicle.rental_return_date) : null;
        const isOverdue  = returnDate && returnDate < new Date();
        if (status === 'On Rental') {
            bookBtn.textContent = isOverdue ? '🔴 On Rental – Return Overdue' : '🔴 Currently On Rental';
        } else {
            bookBtn.textContent = '🟠 Under Maintenance';
        }
        bookBtn.onclick = null;
    }
}

function closeVehicleModal() {
    document.getElementById('vehicle-modal').classList.remove('active');
    document.body.style.overflow = '';
}

// ── Booking ──────────────────────────────────────────────────
function bookVehicle(vehicle) {
    sessionStorage.setItem('selectedVehicle', JSON.stringify({
        id:           vehicle.id,
        name:         `${vehicle.brand} ${vehicle.make}`,
        image:        vehicle.image || '',
        category:     vehicle.category || '',
        seats:        vehicle.seats || '5',
        transmission: vehicle.transmission || '',
        fuel:         vehicle.fuel || '',
        luggage:      vehicle.engine || '',
        price:        vehicle.daily_rate,
        features:     Array.isArray(vehicle.features) ? vehicle.features : []
    }));
    closeVehicleModal();
    showNotification(`${vehicle.brand} ${vehicle.make} selected! Redirecting...`, 'success');
    setTimeout(() => { window.location.href = 'booking.html'; }, 2000);
}

// ── Notification ─────────────────────────────────────────────
function showNotification(message, type = 'info') {
    document.querySelector('.notification')?.remove();
    const n = document.createElement('div');
    n.className = `notification notification-${type}`;
    n.innerHTML = `<span>${message}</span><button class="notification-close">&times;</button>`;
    n.style.cssText = `position:fixed;top:100px;right:20px;background:${type==='success'?'#4caf50':type==='error'?'#f44336':'#ff6b35'};color:white;padding:15px 25px;border-radius:10px;box-shadow:0 5px 20px rgba(0,0,0,.2);z-index:10000;display:flex;align-items:center;gap:15px;max-width:400px;`;
    n.querySelector('.notification-close').style.cssText = 'background:none;border:none;color:white;font-size:1.5rem;cursor:pointer;padding:0;line-height:1;';
    n.querySelector('.notification-close').addEventListener('click', () => n.remove());
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 5000);
}

// ── Loading state ────────────────────────────────────────────
function showLoadingState() {
    ['economy-grid', 'suv-grid', 'luxury-grid'].forEach(id => {
        document.getElementById(id).innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--gray);">
                <div style="font-size:3rem;margin-bottom:15px;">🔄</div>
                <p>Loading vehicles...</p>
            </div>`;
    });
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {

    // ── Auth Nav ──────────────────────────────────────────────
    const isLoggedIn       = sessionStorage.getItem('userLoggedIn') === 'true';
    const userData         = JSON.parse(sessionStorage.getItem('dashboardUser') || 'null');
    const signupBtn        = document.getElementById('signupBtn');
    const loginBtn         = document.getElementById('loginBtn');
    const profileNav       = document.getElementById('profileNav');
    const profileFirstname = document.getElementById('profileFirstname');

    if (isLoggedIn && userData) {
        if (signupBtn)  signupBtn.style.display  = 'none';
        if (loginBtn)   loginBtn.style.display   = 'none';
        if (profileNav) profileNav.style.display = 'flex';

        // Only set the name — do NOT touch profileAvatar, the SVG is already there
        const firstName = userData.firstName || userData.name?.split(' ')[0] || 'User';
        if (profileFirstname) profileFirstname.textContent = firstName;
    } else {
        if (signupBtn)  signupBtn.style.display  = '';
        if (loginBtn)   loginBtn.style.display   = '';
        if (profileNav) profileNav.style.display = 'none';
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
        window.location.href = 'login.html';
    });
    // ─────────────────────────────────────────────────────────

    showLoadingState();

    allVehiclesCache = await fetchVehiclesFromAPI();

    setupFilterButtons(allVehiclesCache);

    const urlCategory = getURLParameter('category');
    if (urlCategory && ['economy', 'suv', 'luxury'].includes(urlCategory)) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-category') === urlCategory);
        });
        renderVehicles(allVehiclesCache, urlCategory);
        setTimeout(() => {
            document.getElementById(`${urlCategory}-section`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    } else {
        renderVehicles(allVehiclesCache, 'all');
    }

    document.querySelector('.modal-close').addEventListener('click', closeVehicleModal);
    document.querySelector('.modal-overlay').addEventListener('click', closeVehicleModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeVehicleModal(); });
});