// ============================================================
//  DARKETZ Car Rental — Returns Module  (v2)
//  Drop-in replacement for the /* RETURNS */ section in
//  rental_dashboard.js.  Paste this over the existing block
//  that runs from "/* === RETURNS ===" to "inspectionNote()".
//
//  New features:
//   • Late flag computed by comparing actual vs expected date
//   • Charge lookup from late_charge_rate DB table
//   • Admin can review/edit the charge table before confirming
//   • Full printable PDF receipt generated in-browser via HTML
//   • All amounts in Emalangeni (E)
// ============================================================

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