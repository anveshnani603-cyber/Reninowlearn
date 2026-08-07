// js/attendance.js
//
// Two features, both talking to the RPCs added in 05_attendance.sql:
//   1. renderStudentQR()      -> student's own "attendance code" as a QR image
//   2. AdminAttendanceScanner -> admin points a camera at a student's QR to
//                                check them in to a specific live_sessions row
//
// Include AFTER js/config.js and the supabase-js + qrcode + html5-qrcode
// CDN scripts (see snippet at the bottom of this file), and pass in the
// same supabase client instance your app.js already created.

// ------------------------------------------------------------
// 1. STUDENT: show my QR code
// ------------------------------------------------------------
/**
 * @param {SupabaseClient} supabase - your existing client
 * @param {string} containerId - id of the element to render the QR into
 */
async function renderStudentQR(supabase, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    el.innerHTML = '<p>Please log in to see your attendance QR.</p>';
    return;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('attendance_code, full_name')
    .eq('id', user.id)
    .single();

  if (error || !profile?.attendance_code) {
    el.innerHTML = '<p>Could not load your attendance QR.</p>';
    return;
  }

  el.innerHTML = `
    <div class="attendance-qr-card">
      <canvas id="attendance-qr-canvas"></canvas>
      <p class="attendance-qr-name">${profile.full_name}</p>
      <p class="attendance-qr-code">${profile.attendance_code}</p>
      <p class="attendance-qr-hint">Show this at the start of a live session</p>
    </div>
  `;

  // requires the "qrcode" CDN script (window.QRCode)
  QRCode.toCanvas(
    document.getElementById('attendance-qr-canvas'),
    profile.attendance_code,
    { width: 220, margin: 2 }
  );
}

// ------------------------------------------------------------
// 2. ADMIN: scan a student's QR to check them in
// ------------------------------------------------------------
class AdminAttendanceScanner {
  /**
   * @param {SupabaseClient} supabase
   * @param {string} sessionId - live_sessions.id for the session in progress
   * @param {string} readerId - id of the div where the camera view renders
   * @param {string} listId - id of the element to render the check-in list into
   */
  constructor(supabase, sessionId, readerId, listId) {
    this.supabase = supabase;
    this.sessionId = sessionId;
    this.readerId = readerId;
    this.listId = listId;
    this.html5QrCode = null;
    this.busy = false; // debounce so one QR isn't submitted 30x/sec
  }

  async start() {
    // requires the "html5-qrcode" CDN script (window.Html5Qrcode)
    this.html5QrCode = new Html5Qrcode(this.readerId);
    await this.html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => this._onScan(decodedText),
      () => {} // ignore per-frame "no QR found" noise
    );
    await this.refreshList();
  }

  async stop() {
    if (this.html5QrCode) {
      await this.html5QrCode.stop();
      await this.html5QrCode.clear();
    }
  }

  async _onScan(code) {
    if (this.busy) return;
    this.busy = true;
    this._flash('Checking in…');

    const { data, error } = await this.supabase.rpc('mark_session_attendance', {
      p_session_id: this.sessionId,
      p_code: code,
    });

    if (error) {
      this._flash(error.message.includes('not recognized')
        ? 'Unrecognized QR code'
        : 'Error: ' + error.message, true);
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      this._flash(
        row.already_checked_in
          ? `${row.full_name} was already checked in`
          : `✓ ${row.full_name} checked in`
      );
      await this.refreshList();
    }

    // brief cooldown so the same badge held in frame doesn't double-fire
    setTimeout(() => { this.busy = false; }, 1500);
  }

  async refreshList() {
    const listEl = document.getElementById(this.listId);
    if (!listEl) return;

    const { data, error } = await this.supabase.rpc('get_session_attendance', {
      p_session_id: this.sessionId,
    });
    if (error || !data) return;

    listEl.innerHTML = data.length
      ? data.map(r => `
          <li>
            <span>${r.full_name}</span>
            <time>${new Date(r.checked_in_at).toLocaleTimeString()}</time>
          </li>
        `).join('')
      : '<li class="empty">No one checked in yet</li>';
  }

  _flash(message, isError = false) {
    const readerEl = document.getElementById(this.readerId);
    if (!readerEl) return;
    let banner = readerEl.querySelector('.scan-flash');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'scan-flash';
      readerEl.appendChild(banner);
    }
    banner.textContent = message;
    banner.classList.toggle('scan-flash-error', isError);
    banner.classList.add('scan-flash-show');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => banner.classList.remove('scan-flash-show'), 1400);
  }
}

/*
--------------------------------------------------------------
CDN scripts to add in index.html <head>, alongside your
existing supabase-js include:

  <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
  <script src="js/attendance.js"></script>

Student profile page:

  <div id="my-qr"></div>
  <script>renderStudentQR(supabase, 'my-qr');</script>   // `supabase` = your existing client var

Admin sessions page — for the session currently live:

  <div id="qr-reader" style="width:300px"></div>
  <ul id="checked-in-list"></ul>
  <script>
    const scanner = new AdminAttendanceScanner(supabase, sessionId, 'qr-reader', 'checked-in-list');
    scanner.start();
    // call scanner.stop() when the admin closes the modal / navigates away
  </script>
--------------------------------------------------------------
*/
