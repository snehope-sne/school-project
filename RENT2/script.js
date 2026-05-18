// Mobile Navigation Toggle
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

hamburger?.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    hamburger.classList.toggle('active');
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        if (hamburger) hamburger.classList.remove('active');
    });
});

// Smooth Scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar Background Change on Scroll
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.15)';
    } else {
        navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
    }
});

// Active Navigation Link on Scroll
const sections = document.querySelectorAll('section[id]');

function updateActiveNavLink() {
    const scrollY = window.pageYOffset;

    sections.forEach(current => {
        const sectionHeight = current.offsetHeight;
        const sectionTop = current.offsetTop - 100;
        const sectionId = current.getAttribute('id');

        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            document.querySelector(`.nav-link[href="#${sectionId}"]`)?.classList.add('active');
        } else {
            document.querySelector(`.nav-link[href="#${sectionId}"]`)?.classList.remove('active');
        }
    });
}

window.addEventListener('scroll', updateActiveNavLink);

// Booking Form Validation and Submission
const bookingForm = document.getElementById('bookingForm');

if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const pickupLocation = document.getElementById('pickupLocation').value;
        const dropoffLocation = document.getElementById('dropoffLocation').value;
        const pickupDate = document.getElementById('pickupDate').value;
        const returnDate = document.getElementById('returnDate').value;
        const vehicleType = document.getElementById('vehicleType').value;

        const pickup = new Date(pickupDate);
        const returnD = new Date(returnDate);
        const today = new Date();

        if (pickup < today) {
            showNotification('Pickup date cannot be in the past', 'error');
            return;
        }

        if (returnD <= pickup) {
            showNotification('Return date must be after pickup date', 'error');
            return;
        }

        const duration = Math.ceil((returnD - pickup) / (1000 * 60 * 60 * 24));

        const bookingData = {
            pickupLocation,
            dropoffLocation,
            pickupDate,
            returnDate,
            vehicleType,
            duration
        };

        sessionStorage.setItem('bookingData', JSON.stringify(bookingData));

        showNotification(`Searching for ${vehicleType} vehicles for ${duration} days...`, 'success');

        setTimeout(() => {
            console.log('Booking Data:', bookingData);
            alert(`Booking submitted successfully!\n\nPickup: ${pickupLocation}\nDrop-off: ${dropoffLocation}\nDuration: ${duration} days\nVehicle Type: ${vehicleType}`);
        }, 1500);
    });
}

// Set minimum date for datetime inputs to today
function setMinDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const minDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

    const pickupDateEl = document.getElementById('pickupDate');
    const returnDateEl = document.getElementById('returnDate');
    if (pickupDateEl) pickupDateEl.min = minDateTime;
    if (returnDateEl) returnDateEl.min = minDateTime;
}

if (document.getElementById('pickupDate')) setMinDateTime();

// Update return date minimum based on pickup date
document.getElementById('pickupDate')?.addEventListener('change', function () {
    const pickupDate = new Date(this.value);
    const returnDateInput = document.getElementById('returnDate');

    pickupDate.setHours(pickupDate.getHours() + 1);

    const year = pickupDate.getFullYear();
    const month = String(pickupDate.getMonth() + 1).padStart(2, '0');
    const day = String(pickupDate.getDate()).padStart(2, '0');
    const hours = String(pickupDate.getHours()).padStart(2, '0');
    const minutes = String(pickupDate.getMinutes()).padStart(2, '0');

    returnDateInput.min = `${year}-${month}-${day}T${hours}:${minutes}`;
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

    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#ff6b35'};
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 15px;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
    `;

    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    `;

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

// Add animation styles
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

// Vehicle card "Book Now" buttons
document.querySelectorAll('.vehicle-card .btn-small').forEach(button => {
    button.addEventListener('click', function (e) {
        e.preventDefault();
        const vehicleCard = this.closest('.vehicle-card');
        const vehicleName = vehicleCard.querySelector('h3').textContent;

        const bookingSection = document.getElementById('booking');
        if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });

        const vehicleTypeSelect = document.getElementById('vehicleType');
        if (vehicleTypeSelect) {
            const vehicleTypeValue = vehicleName.toLowerCase();
            for (let option of vehicleTypeSelect.options) {
                if (option.value === vehicleTypeValue) {
                    vehicleTypeSelect.value = vehicleTypeValue;
                    break;
                }
            }
        }

        const bookingCard = document.querySelector('.booking-card');
        if (bookingCard) {
            bookingCard.style.animation = 'pulse 1s ease';
            setTimeout(() => { bookingCard.style.animation = ''; }, 1000);
        }
    });
});

// Add pulse animation
const pulseStyle = document.createElement('style');
pulseStyle.textContent = `
    @keyframes pulse {
        0%, 100% {
            transform: scale(1);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
        }
        50% {
            transform: scale(1.02);
            box-shadow: 0 15px 50px rgba(255, 107, 53, 0.3);
        }
    }
`;
document.head.appendChild(pulseStyle);

// Intersection Observer for scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.8s ease forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.feature-card, .vehicle-card').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
});

// ── Auth State: Show profile avatar or login/signup buttons ──
function updateNavAuth() {
    const isLoggedIn = sessionStorage.getItem('userLoggedIn') === 'true';
    const userData   = JSON.parse(sessionStorage.getItem('dashboardUser') || 'null');

    const signupBtn        = document.getElementById('signupBtn');
    const loginBtn         = document.getElementById('loginBtn');
    const profileNav       = document.getElementById('profileNav');
    const profileAvatar    = document.getElementById('profileAvatar');
    const profileFirstname = document.getElementById('profileFirstname');

    if (isLoggedIn && userData) {
        if (signupBtn) signupBtn.style.display = 'none';
        if (loginBtn)  loginBtn.style.display  = 'none';
        if (profileNav) profileNav.style.display = 'flex';

        const firstName = userData.firstName || userData.name?.split(' ')[0] || 'User';
        if (profileFirstname) profileFirstname.textContent = firstName;

        // Render saved photo or default SVG in navbar avatar
        if (profileAvatar) {
            const savedPhoto = sessionStorage.getItem('profileAvatarData');
            if (savedPhoto) {
                profileAvatar.innerHTML = `<img src="${savedPhoto}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                profileAvatar.innerHTML = `
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                        <circle cx="50" cy="50" r="50" fill="url(#avatarGrad)"/>
                        <circle cx="50" cy="38" r="18" fill="rgba(255,255,255,0.95)"/>
                        <ellipse cx="50" cy="82" rx="26" ry="20" fill="rgba(255,255,255,0.95)"/>
                        <defs>
                            <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#ff6b35"/>
                                <stop offset="100%" style="stop-color:#f7931e"/>
                            </linearGradient>
                        </defs>
                    </svg>`;
            }
        }

    } else {
        if (signupBtn) signupBtn.style.display = '';
        if (loginBtn)  loginBtn.style.display  = '';
        if (profileNav) profileNav.style.display = 'none';
    }
}

// Toggle dropdown on avatar click
document.getElementById('profileNav')?.addEventListener('click', function (e) {
    const dropdown = document.getElementById('profileDropdown');
    dropdown.classList.toggle('open');
    e.stopPropagation();
});

// Close dropdown when clicking outside
document.addEventListener('click', function () {
    document.getElementById('profileDropdown')?.classList.remove('open');
});

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', function () {
    sessionStorage.removeItem('userLoggedIn');
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('dashboardUser');
    window.location.reload();
});

// Run auth check on load
updateNavAuth();

// Console greeting
console.log('%cWelcome to Rent A Car! 🚗', 'color: #ff6b35; font-size: 20px; font-weight: bold;');
console.log('%cTaking You Places', 'color: #f7931e; font-size: 16px;');