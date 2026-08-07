// ============================================================
// RENI NOW LEARNING — Admin console logic
// Uses Supabase for auth (same project as the student app), then
// calls the backend's /api/* admin routes with the resulting
// access token for everything that needs the service-role key.
// ============================================================
(async function () {
  let { SUPABASE_URL, SUPABASE_ANON_KEY } = window.RENI_CONFIG || {};
  if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT-REF')) {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      if (cfg.SUPABASE_URL) { SUPABASE_URL = cfg.SUPABASE_URL; SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY; }
    } catch (e) { console.warn('[Reni Admin] could not load /api/config', e); }
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let students = [];
  let roadmaps = [];

  // ------------------------------------------------------------
  // API helper — attaches the current session's access token
  // ------------------------------------------------------------
  async function api(path, options = {}) {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try { const body = await res.json(); msg = body.error || msg; } catch (e) {}
      throw new Error(msg);
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res;
  }

  async function apiBlob(path) {
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.blob();
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

  // ------------------------------------------------------------
  // AUTH GATE
  // ------------------------------------------------------------
  const authGate = document.getElementById('authGate');
  const appRoot = document.getElementById('appRoot');
  const authMsg = document.getElementById('authMsg');

  function showGate(msg, isError) {
    authGate.style.display = 'block';
    appRoot.style.display = 'none';
    authMsg.className = 'msg ' + (isError ? 'bad' : '');
    authMsg.textContent = msg || '';
  }
  function showApp() {
    authGate.style.display = 'none';
    appRoot.style.display = 'block';
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    authMsg.textContent = '';
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value
      });
      if (error) throw error;
      await boot();
    } catch (err) {
      showGate(err.message || 'Could not log in.', true);
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    showGate('Logged out.');
  });

  // ------------------------------------------------------------
  // TABS
  // ------------------------------------------------------------
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ------------------------------------------------------------
  // QR MODAL
  // ------------------------------------------------------------
  async function showQr(path, label) {
    try {
      const blob = await apiBlob(path);
      const url = URL.createObjectURL(blob);
      document.getElementById('qrModalImg').src = url;
      document.getElementById('qrModalLabel').textContent = label;
      document.getElementById('qrModal').classList.add('show');
    } catch (err) {
      alert('Could not load QR code: ' + err.message);
    }
  }

  // ------------------------------------------------------------
  // STUDENTS
  // ------------------------------------------------------------
  async function loadStudents() {
    const body = document.getElementById('studentsBody');
    try {
      students = await api('/admin/students');
      if (!students.length) { body.innerHTML = '<tr><td colspan="7">No students yet.</td></tr>'; return; }
      body.innerHTML = students.map(s => `
        <tr>
          <td>${s.full_name || '—'}</td>
          <td>${s.email || '—'}</td>
          <td>${s.phone || '—'}</td>
          <td><span class="pill pill-role">${s.role}</span></td>
          <td>${s.blocked ? '<span class="pill pill-bad">Blocked</span>' : '<span class="pill pill-ok">Active</span>'}</td>
          <td>${fmtDate(s.member_since)}</td>
          <td>
            <div class="row-actions">
              <button class="btn small ${s.blocked ? '' : 'danger'}" data-action="toggle-block" data-id="${s.id}" data-blocked="${s.blocked}">
                ${s.blocked ? 'Unblock' : 'Block'}
              </button>
              <button class="btn secondary small" data-action="qr" data-id="${s.id}" data-name="${(s.full_name || 'Student').replace(/"/g, '')}">QR</button>
            </div>
          </td>
        </tr>
      `).join('');
      populateStudentSelect();
    } catch (err) {
      body.innerHTML = `<tr><td colspan="7">Could not load students: ${err.message}</td></tr>`;
    }
  }

  document.getElementById('studentsBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const msg = document.getElementById('studentsMsg');
    if (btn.dataset.action === 'toggle-block') {
      const nextBlocked = btn.dataset.blocked !== 'true';
      btn.disabled = true;
      try {
        await api(`/admin/students/${id}/block`, { method: 'PATCH', body: JSON.stringify({ blocked: nextBlocked }) });
        msg.className = 'msg good';
        msg.textContent = nextBlocked ? 'Student blocked.' : 'Student unblocked.';
        await loadStudents();
      } catch (err) {
        msg.className = 'msg bad';
        msg.textContent = err.message;
        btn.disabled = false;
      }
    } else if (btn.dataset.action === 'qr') {
      showQr(`/qr/student/${id}`, `Scan to verify: ${btn.dataset.name}`);
    }
  });

  // ------------------------------------------------------------
  // ROADMAP DROPDOWNS (shared across assignment / session / letter forms)
  // ------------------------------------------------------------
  async function loadRoadmaps() {
    try {
      roadmaps = await api('/roadmaps');
    } catch (err) {
      roadmaps = [];
    }
    ['asgRoadmap', 'sesRoadmap', 'letRoadmap'].forEach(id => {
      const sel = document.getElementById(id);
      const current = sel.value;
      sel.innerHTML = '<option value="">— none —</option>' + roadmaps.map(r => `<option value="${r.id}">${r.title}</option>`).join('');
      sel.value = current;
    });
  }

  function populateStudentSelect() {
    const sel = document.getElementById('letStudent');
    sel.innerHTML = '<option value="">Select a student…</option>' +
      students.map(s => `<option value="${s.id}">${s.full_name || s.email || s.id}</option>`).join('');
  }

  // ------------------------------------------------------------
  // ASSIGNMENTS
  // ------------------------------------------------------------
  async function loadAssignments() {
    const body = document.getElementById('assignmentsBody');
    try {
      const list = await api('/assignments');
      if (!list.length) { body.innerHTML = '<tr><td colspan="5">No assignments yet.</td></tr>'; return; }
      body.innerHTML = list.map(a => `
        <tr>
          <td>${a.title}</td>
          <td>${a.roadmaps?.title || '—'}</td>
          <td>${fmtDateTime(a.due_at)}</td>
          <td>${a.max_score}</td>
          <td>${a.published ? '<span class="pill pill-ok">Published</span>' : '<span class="pill pill-role">Draft</span>'}</td>
        </tr>
      `).join('');
    } catch (err) {
      body.innerHTML = `<tr><td colspan="5">Could not load assignments: ${err.message}</td></tr>`;
    }
  }

  document.getElementById('assignmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('assignmentMsg');
    msg.textContent = '';
    try {
      await api('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          title: document.getElementById('asgTitle').value.trim(),
          description: document.getElementById('asgDesc').value.trim(),
          roadmap_id: document.getElementById('asgRoadmap').value || null,
          max_score: Number(document.getElementById('asgMaxScore').value) || 100,
          due_at: document.getElementById('asgDue').value ? new Date(document.getElementById('asgDue').value).toISOString() : null,
          published: document.getElementById('asgPublished').value === 'true'
        })
      });
      msg.className = 'msg good';
      msg.textContent = 'Assignment posted.';
      e.target.reset();
      await loadAssignments();
    } catch (err) {
      msg.className = 'msg bad';
      msg.textContent = err.message;
    }
  });

  // ------------------------------------------------------------
  // SESSIONS / CLASSES
  // ------------------------------------------------------------
  async function loadSessions() {
    const body = document.getElementById('sessionsBody');
    try {
      const list = await api('/sessions');
      if (!list.length) { body.innerHTML = '<tr><td colspan="5">No classes scheduled yet.</td></tr>'; return; }
      body.innerHTML = list.map(s => `
        <tr>
          <td>${s.title}</td>
          <td>${s.roadmaps?.title || '—'}</td>
          <td>${s.instructor_name || '—'}</td>
          <td>${fmtDateTime(s.starts_at)}</td>
          <td>${s.meeting_url ? `<a href="${s.meeting_url}" target="_blank" rel="noopener">Join link</a>` : '—'}</td>
        </tr>
      `).join('');
    } catch (err) {
      body.innerHTML = `<tr><td colspan="5">Could not load classes: ${err.message}</td></tr>`;
    }
  }

  document.getElementById('sessionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('sessionMsg');
    msg.textContent = '';
    try {
      const starts = document.getElementById('sesStarts').value;
      const ends = document.getElementById('sesEnds').value;
      await api('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title: document.getElementById('sesTitle').value.trim(),
          instructor_name: document.getElementById('sesInstructor').value.trim(),
          roadmap_id: document.getElementById('sesRoadmap').value || null,
          starts_at: starts ? new Date(starts).toISOString() : null,
          ends_at: ends ? new Date(ends).toISOString() : null,
          meeting_url: document.getElementById('sesUrl').value.trim() || null
        })
      });
      msg.className = 'msg good';
      msg.textContent = 'Class scheduled.';
      e.target.reset();
      await loadSessions();
    } catch (err) {
      msg.className = 'msg bad';
      msg.textContent = err.message;
    }
  });

  // ------------------------------------------------------------
  // RECOGNITION LETTERS
  // ------------------------------------------------------------
  async function loadLetters() {
    const body = document.getElementById('lettersBody');
    try {
      const list = await api('/letters');
      if (!list.length) { body.innerHTML = '<tr><td colspan="5">No letters issued yet.</td></tr>'; return; }
      body.innerHTML = list.map(l => `
        <tr>
          <td>${l.profiles?.full_name || '—'}</td>
          <td>${l.roadmaps?.title || '—'}</td>
          <td style="font-family:var(--mono);">${l.recognition_code}</td>
          <td>${fmtDate(l.issued_at)}</td>
          <td><button class="btn secondary small" data-action="letter-qr" data-code="${l.recognition_code}">QR</button></td>
        </tr>
      `).join('');
    } catch (err) {
      body.innerHTML = `<tr><td colspan="5">Could not load letters: ${err.message}</td></tr>`;
    }
  }

  document.getElementById('lettersBody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="letter-qr"]');
    if (!btn) return;
    showQr(`/qr/letter/${btn.dataset.code}`, `Certificate ${btn.dataset.code} — scan to verify`);
  });

  document.getElementById('letterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('letterMsg');
    msg.textContent = '';
    try {
      const result = await api('/letters', {
        method: 'POST',
        body: JSON.stringify({
          student_id: document.getElementById('letStudent').value,
          roadmap_id: document.getElementById('letRoadmap').value || null,
          duration_label: document.getElementById('letDuration').value.trim(),
          completed_on: document.getElementById('letCompleted').value || null,
          director_name: document.getElementById('letDirector').value.trim() || undefined
        })
      });
      msg.className = 'msg good';
      msg.textContent = `Letter issued — code ${result.recognition_code}.`;
      e.target.reset();
      await loadLetters();
      showQr(`/qr/letter/${result.recognition_code}`, `Certificate ${result.recognition_code} — scan to verify`);
    } catch (err) {
      msg.className = 'msg bad';
      msg.textContent = err.message;
    }
  });

  // ------------------------------------------------------------
  // BOOT
  // ------------------------------------------------------------
  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showGate(); return; }

    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (error || !profile) { showGate('Could not load your profile.', true); return; }
    if (profile.blocked) { await sb.auth.signOut(); showGate('This account has been blocked.', true); return; }
    if (!['instructor', 'admin'].includes(profile.role)) {
      await sb.auth.signOut();
      showGate('This account does not have admin/instructor access.', true);
      return;
    }

    showApp();
    await loadRoadmaps();
    await loadStudents();
    await loadAssignments();
    await loadSessions();
    await loadLetters();
  }

  boot();
})();
