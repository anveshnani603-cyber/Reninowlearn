// ============================================================
// RENI NOW LEARNING — Admin console logic
// Depends on: @supabase/supabase-js (UMD), window.RENI_CONFIG (config.js)
// Only works once 05_admin_access.sql has been run and the signed-in
// user's profiles.role is 'admin' or 'instructor'.
// ============================================================
(async function () {
  let { SUPABASE_URL, SUPABASE_ANON_KEY } = window.RENI_CONFIG || {};
  if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      if (cfg.SUPABASE_URL) { SUPABASE_URL = cfg.SUPABASE_URL; SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY; }
    } catch (e) { console.warn('[Reni Admin] Could not load /api/config', e); }
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let currentProfile = null;
  const authGate = document.getElementById('authGate');
  const appRoot = document.getElementById('appRoot');
  const authError = document.getElementById('authError');

  function fmtDate(d) { return d ? new Date(d).toLocaleString() : '—'; }
  function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ------------------------------------------------------------
  // AUTH GATE
  // ------------------------------------------------------------
  async function tryEnter(session) {
    if (!session) { showGate(); return; }
    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (error || !profile) { authError.textContent = 'Could not load your profile.'; await sb.auth.signOut(); showGate(); return; }
    if (profile.role !== 'admin' && profile.role !== 'instructor') {
      authError.textContent = 'This account does not have staff access.';
      await sb.auth.signOut();
      showGate();
      return;
    }
    currentProfile = profile;
    showApp();
  }

  function showGate() { authGate.style.display = 'flex'; appRoot.classList.remove('ready'); appRoot.style.display = 'none'; }
  function showApp() {
    authGate.style.display = 'none';
    appRoot.style.display = 'flex';
    document.getElementById('rolePill').textContent = currentProfile.role;
    loadEverything();
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { authError.textContent = error.message; return; }
    await tryEnter(data.session);
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    showGate();
  });

  const { data: { session } } = await sb.auth.getSession();
  await tryEnter(session);

  // ------------------------------------------------------------
  // NAV
  // ------------------------------------------------------------
  const titles = {overview:'Overview',students:'Students',roadmaps:'Roadmaps',assignments:'Assignments',
    assessments:'Assessments',sessions:'Live Sessions',content:'Content Library',letters:'Recognition Letters'};
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item[data-page]').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const target = item.dataset.page;
      document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + target));
      document.getElementById('topbarTitle').textContent = titles[target];
    });
  });

  // ------------------------------------------------------------
  // SHARED STATE
  // ------------------------------------------------------------
  let roadmaps = [];
  let students = [];

  function roadmapOptions(selectEl, selectedId) {
    selectEl.innerHTML = '<option value="">— none —</option>' +
      roadmaps.map(r => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${esc(r.title)}</option>`).join('');
  }
  function studentOptions(selectEl, selectedId) {
    selectEl.innerHTML = students.map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.full_name || 'Student')}</option>`).join('');
  }

  async function loadEverything() {
    await Promise.all([loadOverview(), loadStudents(), loadRoadmaps()]);
    await Promise.all([loadAssignments(), loadAssessments(), loadSessions(), loadContent()]);
    populateLetterPickers();
  }

  // ------------------------------------------------------------
  // OVERVIEW
  // ------------------------------------------------------------
  async function loadOverview() {
    const cards = document.querySelectorAll('#overviewStats .stat-num');
    const [{ count: studentCount }, { count: pendingCount }, { count: upcomingCount }, { count: publishedRoadmaps }] = await Promise.all([
      sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
      sb.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
      sb.from('live_sessions').select('id', { count: 'exact', head: true }).gte('starts_at', new Date().toISOString()),
      sb.from('roadmaps').select('id', { count: 'exact', head: true }).eq('published', true)
    ]);
    cards[0].textContent = studentCount ?? '0';
    cards[1].textContent = pendingCount ?? '0';
    cards[2].textContent = upcomingCount ?? '0';
    cards[3].textContent = publishedRoadmaps ?? '0';
  }

  // ------------------------------------------------------------
  // STUDENTS
  // ------------------------------------------------------------
  async function loadStudents() {
    const { data, error } = await sb.from('profiles').select('*').order('member_since', { ascending: false });
    const tbody = document.getElementById('studentsTable');
    if (error) { tbody.innerHTML = `<tr><td colspan="6" class="muted">${esc(error.message)}</td></tr>`; return; }
    students = (data || []).filter(p => p.role === 'student');
    const xpByStudent = {};
    const { data: xp } = await sb.from('xp_events').select('student_id, amount');
    (xp || []).forEach(e => { xpByStudent[e.student_id] = (xpByStudent[e.student_id] || 0) + e.amount; });

    tbody.innerHTML = (data || []).map(p => `
      <tr>
        <td>${esc(p.full_name || 'Unnamed')}</td>
        <td>${esc(p.phone || '—')}</td>
        <td><span class="pill pill-role-${p.role}">${p.role}</span></td>
        <td>${p.member_since || '—'}</td>
        <td>${xpByStudent[p.id] || 0}</td>
        <td>
          ${currentProfile.role === 'admin' ? `
          <select data-role-select="${p.id}" style="padding:6px 8px;border-radius:6px;border:1px solid var(--line);background:var(--bg-deep);color:var(--text);font-size:12.5px;">
            <option value="student" ${p.role==='student'?'selected':''}>student</option>
            <option value="instructor" ${p.role==='instructor'?'selected':''}>instructor</option>
            <option value="admin" ${p.role==='admin'?'selected':''}>admin</option>
          </select>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">No profiles yet.</td></tr>';

    tbody.querySelectorAll('[data-role-select]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.roleSelect;
        const { error } = await sb.from('profiles').update({ role: sel.value }).eq('id', id);
        if (error) { alert('Could not update role: ' + error.message); }
        else { await loadStudents(); await loadOverview(); }
      });
    });
  }

  // ------------------------------------------------------------
  // ROADMAPS
  // ------------------------------------------------------------
  async function loadRoadmaps() {
    const { data, error } = await sb.from('roadmaps').select('*').order('created_at', { ascending: false });
    const tbody = document.getElementById('roadmapsTable');
    if (error) { tbody.innerHTML = `<tr><td colspan="5" class="muted">${esc(error.message)}</td></tr>`; return; }
    roadmaps = data || [];
    [document.getElementById('as_roadmap'), document.getElementById('ax_roadmap'),
     document.getElementById('sess_roadmap'), document.getElementById('ct_roadmap'),
     document.getElementById('lt_roadmap')].forEach(sel => roadmapOptions(sel));

    tbody.innerHTML = roadmaps.map(r => `
      <tr>
        <td>${esc(r.title)}</td><td class="muted">${esc(r.slug)}</td><td>${r.total_modules}</td>
        <td><span class="pill ${r.published ? 'pill-graded' : 'pill-pending'}">${r.published ? 'Published' : 'Draft'}</span></td>
        <td><button class="btn btn-outline btn-sm" data-edit-rm="${r.id}">Edit</button> <button class="btn btn-danger btn-sm" data-del-rm="${r.id}">Delete</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">No roadmaps yet.</td></tr>';

    tbody.querySelectorAll('[data-edit-rm]').forEach(b => b.addEventListener('click', () => {
      const r = roadmaps.find(x => x.id === b.dataset.editRm);
      document.getElementById('rm_id').value = r.id;
      document.getElementById('rm_slug').value = r.slug;
      document.getElementById('rm_title').value = r.title;
      document.getElementById('rm_track').value = r.track_label || '';
      document.getElementById('rm_icon').value = r.icon || '';
      document.getElementById('rm_modules').value = r.total_modules;
      document.getElementById('rm_published').checked = r.published;
      document.getElementById('rm_desc').value = r.description || '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    tbody.querySelectorAll('[data-del-rm]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this roadmap? This cannot be undone.')) return;
      const { error } = await sb.from('roadmaps').delete().eq('id', b.dataset.delRm);
      if (error) alert(error.message); else await loadRoadmaps();
    }));
  }

  document.getElementById('roadmapForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('rm_id').value;
    const payload = {
      slug: document.getElementById('rm_slug').value.trim(),
      title: document.getElementById('rm_title').value.trim(),
      track_label: document.getElementById('rm_track').value.trim(),
      icon: document.getElementById('rm_icon').value.trim() || 'route',
      total_modules: parseInt(document.getElementById('rm_modules').value || '0', 10),
      published: document.getElementById('rm_published').checked,
      description: document.getElementById('rm_desc').value.trim()
    };
    const msg = document.getElementById('rm_msg');
    const { error } = id ? await sb.from('roadmaps').update(payload).eq('id', id) : await sb.from('roadmaps').insert(payload);
    if (error) { msg.textContent = error.message; msg.className = 'msg err'; return; }
    msg.textContent = 'Saved.'; msg.className = 'msg ok';
    document.getElementById('roadmapForm').reset();
    document.getElementById('rm_id').value = '';
    await loadRoadmaps(); await loadOverview();
  });
  document.getElementById('rm_cancel').addEventListener('click', () => {
    document.getElementById('roadmapForm').reset(); document.getElementById('rm_id').value = '';
  });

  // ------------------------------------------------------------
  // ASSIGNMENTS + GRADING
  // ------------------------------------------------------------
  let assignments = [];
  async function loadAssignments() {
    const { data, error } = await sb.from('assignments').select('*, roadmaps(title)').order('created_at', { ascending: false });
    const tbody = document.getElementById('assignmentsTable');
    if (error) { tbody.innerHTML = `<tr><td colspan="5" class="muted">${esc(error.message)}</td></tr>`; return; }
    assignments = data || [];
    const picker = document.getElementById('gradeAssignmentPicker');
    picker.innerHTML = '<option value="">Select assignment…</option>' + assignments.map(a => `<option value="${a.id}">${esc(a.title)}</option>`).join('');

    tbody.innerHTML = assignments.map(a => `
      <tr>
        <td>${esc(a.title)}</td><td class="muted">${esc(a.roadmaps?.title || '—')}</td><td>${fmtDate(a.due_at)}</td>
        <td><span class="pill ${a.published ? 'pill-graded' : 'pill-pending'}">${a.published ? 'Published' : 'Draft'}</span></td>
        <td><button class="btn btn-outline btn-sm" data-edit-as="${a.id}">Edit</button> <button class="btn btn-danger btn-sm" data-del-as="${a.id}">Delete</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">No assignments yet.</td></tr>';

    tbody.querySelectorAll('[data-edit-as]').forEach(b => b.addEventListener('click', () => {
      const a = assignments.find(x => x.id === b.dataset.editAs);
      document.getElementById('as_id').value = a.id;
      document.getElementById('as_title').value = a.title;
      document.getElementById('as_roadmap').value = a.roadmap_id || '';
      document.getElementById('as_due').value = a.due_at ? a.due_at.slice(0, 16) : '';
      document.getElementById('as_max').value = a.max_score;
      document.getElementById('as_published').checked = a.published;
      document.getElementById('as_desc').value = a.description || '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    tbody.querySelectorAll('[data-del-as]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this assignment and its submissions?')) return;
      const { error } = await sb.from('assignments').delete().eq('id', b.dataset.delAs);
      if (error) alert(error.message); else await loadAssignments();
    }));
  }

  document.getElementById('assignForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('as_id').value;
    const payload = {
      title: document.getElementById('as_title').value.trim(),
      roadmap_id: document.getElementById('as_roadmap').value || null,
      due_at: document.getElementById('as_due').value ? new Date(document.getElementById('as_due').value).toISOString() : null,
      max_score: parseFloat(document.getElementById('as_max').value || '100'),
      published: document.getElementById('as_published').checked,
      description: document.getElementById('as_desc').value.trim()
    };
    const msg = document.getElementById('as_msg');
    const { error } = id ? await sb.from('assignments').update(payload).eq('id', id) : await sb.from('assignments').insert(payload);
    if (error) { msg.textContent = error.message; msg.className = 'msg err'; return; }
    msg.textContent = 'Saved.'; msg.className = 'msg ok';
    document.getElementById('assignForm').reset(); document.getElementById('as_id').value = '';
    await loadAssignments(); await loadOverview();
  });
  document.getElementById('as_cancel').addEventListener('click', () => {
    document.getElementById('assignForm').reset(); document.getElementById('as_id').value = '';
  });

  document.getElementById('gradeAssignmentPicker').addEventListener('change', async (e) => {
    const assignmentId = e.target.value;
    const tbody = document.getElementById('submissionsTable');
    if (!assignmentId) { tbody.innerHTML = '<tr><td colspan="7" class="muted">Pick an assignment above.</td></tr>'; return; }
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Loading…</td></tr>';
    const { data, error } = await sb.from('assignment_submissions').select('*, profiles(full_name)').eq('assignment_id', assignmentId);
    if (error) { tbody.innerHTML = `<tr><td colspan="7" class="muted">${esc(error.message)}</td></tr>`; return; }
    if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="7" class="muted">No submissions yet.</td></tr>'; return; }
    tbody.innerHTML = data.map(s => `
      <tr data-sub-row="${s.id}" data-student="${s.student_id}">
        <td>${esc(s.profiles?.full_name || 'Student')}</td>
        <td><span class="pill pill-${s.status}">${s.status}</span></td>
        <td>${fmtDate(s.submitted_at)}</td>
        <td><input class="score-input" type="number" data-score value="${s.score ?? ''}"></td>
        <td><input type="text" data-feedback value="${esc(s.feedback || '')}" style="min-width:140px;padding:6px 8px;border-radius:6px;border:1px solid var(--line);background:var(--bg-deep);color:var(--text);"></td>
        <td><input class="score-input" type="number" data-xp placeholder="XP"></td>
        <td><button class="btn btn-primary btn-sm" data-save-grade="${s.id}">Save</button></td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-save-grade]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('tr');
        const score = row.querySelector('[data-score]').value;
        const feedback = row.querySelector('[data-feedback]').value;
        const xpAmount = row.querySelector('[data-xp]').value;
        const studentId = row.dataset.student;
        const { error } = await sb.from('assignment_submissions').update({
          score: score === '' ? null : parseFloat(score),
          feedback, status: 'graded', graded_at: new Date().toISOString()
        }).eq('id', btn.dataset.saveGrade);
        if (error) { alert(error.message); return; }
        if (xpAmount && parseInt(xpAmount, 10) !== 0) {
          await sb.from('xp_events').insert({ student_id: studentId, amount: parseInt(xpAmount, 10), reason: 'Assignment graded' });
        }
        btn.textContent = 'Saved ✓';
        setTimeout(() => { btn.textContent = 'Save'; }, 1500);
        await loadOverview();
      });
    });
  });

  // ------------------------------------------------------------
  // ASSESSMENTS + RESULTS
  // ------------------------------------------------------------
  let assessments = [];
  async function loadAssessments() {
    const { data, error } = await sb.from('assessments').select('*, roadmaps(title)').order('created_at', { ascending: false });
    const tbody = document.getElementById('assessmentsTable');
    if (error) { tbody.innerHTML = `<tr><td colspan="5" class="muted">${esc(error.message)}</td></tr>`; return; }
    assessments = data || [];
    const picker = document.getElementById('resultAssessmentPicker');
    picker.innerHTML = '<option value="">Select assessment…</option>' + assessments.map(a => `<option value="${a.id}">${esc(a.title)}</option>`).join('');

    tbody.innerHTML = assessments.map(a => `
      <tr>
        <td>${esc(a.title)}</td><td class="muted">${esc(a.roadmaps?.title || '—')}</td><td>${fmtDate(a.scheduled_at)}</td>
        <td><span class="pill ${a.published ? 'pill-graded' : 'pill-pending'}">${a.published ? 'Published' : 'Draft'}</span></td>
        <td><button class="btn btn-outline btn-sm" data-edit-ax="${a.id}">Edit</button> <button class="btn btn-danger btn-sm" data-del-ax="${a.id}">Delete</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">No assessments yet.</td></tr>';

    tbody.querySelectorAll('[data-edit-ax]').forEach(b => b.addEventListener('click', () => {
      const a = assessments.find(x => x.id === b.dataset.editAx);
      document.getElementById('ax_id').value = a.id;
      document.getElementById('ax_title').value = a.title;
      document.getElementById('ax_roadmap').value = a.roadmap_id || '';
      document.getElementById('ax_marks').value = a.total_marks;
      document.getElementById('ax_sched').value = a.scheduled_at ? a.scheduled_at.slice(0, 16) : '';
      document.getElementById('ax_published').checked = a.published;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    tbody.querySelectorAll('[data-del-ax]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this assessment and its results?')) return;
      const { error } = await sb.from('assessments').delete().eq('id', b.dataset.delAx);
      if (error) alert(error.message); else await loadAssessments();
    }));
  }

  document.getElementById('assessForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ax_id').value;
    const payload = {
      title: document.getElementById('ax_title').value.trim(),
      roadmap_id: document.getElementById('ax_roadmap').value || null,
      total_marks: parseFloat(document.getElementById('ax_marks').value || '100'),
      scheduled_at: document.getElementById('ax_sched').value ? new Date(document.getElementById('ax_sched').value).toISOString() : null,
      published: document.getElementById('ax_published').checked
    };
    const msg = document.getElementById('ax_msg');
    const { error } = id ? await sb.from('assessments').update(payload).eq('id', id) : await sb.from('assessments').insert(payload);
    if (error) { msg.textContent = error.message; msg.className = 'msg err'; return; }
    msg.textContent = 'Saved.'; msg.className = 'msg ok';
    document.getElementById('assessForm').reset(); document.getElementById('ax_id').value = '';
    await loadAssessments(); await loadOverview();
  });
  document.getElementById('ax_cancel').addEventListener('click', () => {
    document.getElementById('assessForm').reset(); document.getElementById('ax_id').value = '';
  });

  document.getElementById('resultAssessmentPicker').addEventListener('change', () => {
    studentOptions(document.getElementById('result_student'));
  });

  document.getElementById('saveResultBtn').addEventListener('click', async () => {
    const assessmentId = document.getElementById('resultAssessmentPicker').value;
    const studentId = document.getElementById('result_student').value;
    const score = document.getElementById('result_score').value;
    const msg = document.getElementById('result_msg');
    if (!assessmentId || !studentId) { msg.textContent = 'Pick an assessment and a student first.'; msg.className = 'msg err'; return; }
    const { error } = await sb.from('assessment_results').upsert({
      assessment_id: assessmentId, student_id: studentId,
      score: score === '' ? null : parseFloat(score),
      status: 'attempted', attempted_at: new Date().toISOString()
    }, { onConflict: 'assessment_id,student_id' });
    if (error) { msg.textContent = error.message; msg.className = 'msg err'; return; }
    msg.textContent = 'Result saved.'; msg.className = 'msg ok';
  });

  // ------------------------------------------------------------
  // SESSIONS
  // ------------------------------------------------------------
  let sessions = [];
  async function loadSessions() {
    const { data, error } = await sb.from('live_sessions').select('*').order('starts_at', { ascending: false });
    const tbody = document.getElementById('sessionsTable');
    if (error) { tbody.innerHTML = `<tr><td colspan="4" class="muted">${esc(error.message)}</td></tr>`; return; }
    sessions = data || [];
    tbody.innerHTML = sessions.map(s => `
      <tr>
        <td>${esc(s.title)}</td><td class="muted">${esc(s.instructor_name || '—')}</td><td>${fmtDate(s.starts_at)}</td>
        <td><button class="btn btn-outline btn-sm" data-edit-sess="${s.id}">Edit</button> <button class="btn btn-danger btn-sm" data-del-sess="${s.id}">Delete</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="muted">No sessions yet.</td></tr>';

    tbody.querySelectorAll('[data-edit-sess]').forEach(b => b.addEventListener('click', () => {
      const s = sessions.find(x => x.id === b.dataset.editSess);
      document.getElementById('sess_id').value = s.id;
      document.getElementById('sess_title').value = s.title;
      document.getElementById('sess_roadmap').value = s.roadmap_id || '';
      document.getElementById('sess_instructor').value = s.instructor_name || '';
      document.getElementById('sess_starts').value = s.starts_at ? s.starts_at.slice(0, 16) : '';
      document.getElementById('sess_ends').value = s.ends_at ? s.ends_at.slice(0, 16) : '';
      document.getElementById('sess_meeting').value = s.meeting_url || '';
      document.getElementById('sess_recording').value = s.recording_url || '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    tbody.querySelectorAll('[data-del-sess]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this session?')) return;
      const { error } = await sb.from('live_sessions').delete().eq('id', b.dataset.delSess);
      if (error) alert(error.message); else await loadSessions();
    }));
  }

  document.getElementById('sessForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('sess_id').value;
    const payload = {
      title: document.getElementById('sess_title').value.trim(),
      roadmap_id: document.getElementById('sess_roadmap').value || null,
      instructor_name: document.getElementById('sess_instructor').value.trim(),
      starts_at: new Date(document.getElementById('sess_starts').value).toISOString(),
      ends_at: document.getElementById('sess_ends').value ? new Date(document.getElementById('sess_ends').value).toISOString() : null,
      meeting_url: document.getElementById('sess_meeting').value.trim() || null,
      recording_url: document.getElementById('sess_recording').value.trim() || null
    };
    const msg = document.getElementById('sess_msg');
    const { error } = id ? await sb.from('live_sessions').update(payload).eq('id', id) : await sb.from('live_sessions').insert(payload);
    if (error) { msg.textContent = error.message; msg.className = 'msg err'; return; }
    msg.textContent = 'Saved.'; msg.className = 'msg ok';
    document.getElementById('sessForm').reset(); document.getElementById('sess_id').value = '';
    await loadSessions(); await loadOverview();
  });
  document.getElementById('sess_cancel').addEventListener('click', () => {
    document.getElementById('sessForm').reset(); document.getElementById('sess_id').value = '';
  });

  // ------------------------------------------------------------
  // CONTENT
  // ------------------------------------------------------------
  let contentItems = [];
  async function loadContent() {
    const { data, error } = await sb.from('content_items').select('*, roadmaps(title)').order('created_at', { ascending: false });
    const tbody = document.getElementById('contentTable');
    if (error) { tbody.innerHTML = `<tr><td colspan="5" class="muted">${esc(error.message)}</td></tr>`; return; }
    contentItems = data || [];
    tbody.innerHTML = contentItems.map(c => `
      <tr>
        <td>${esc(c.title)}</td><td class="muted">${esc(c.type)}</td><td class="muted">${esc(c.roadmaps?.title || '—')}</td>
        <td><span class="pill ${c.published ? 'pill-graded' : 'pill-pending'}">${c.published ? 'Published' : 'Draft'}</span></td>
        <td><button class="btn btn-outline btn-sm" data-edit-ct="${c.id}">Edit</button> <button class="btn btn-danger btn-sm" data-del-ct="${c.id}">Delete</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">No content yet.</td></tr>';

    tbody.querySelectorAll('[data-edit-ct]').forEach(b => b.addEventListener('click', () => {
      const c = contentItems.find(x => x.id === b.dataset.editCt);
      document.getElementById('ct_id').value = c.id;
      document.getElementById('ct_title').value = c.title;
      document.getElementById('ct_type').value = c.type;
      document.getElementById('ct_roadmap').value = c.roadmap_id || '';
      document.getElementById('ct_duration').value = c.duration_minutes ?? '';
      document.getElementById('ct_pages').value = c.page_count ?? '';
      document.getElementById('ct_url').value = c.url || '';
      document.getElementById('ct_published').checked = c.published;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    tbody.querySelectorAll('[data-del-ct]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this content item?')) return;
      const { error } = await sb.from('content_items').delete().eq('id', b.dataset.delCt);
      if (error) alert(error.message); else await loadContent();
    }));
  }

  document.getElementById('contentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ct_id').value;
    const payload = {
      title: document.getElementById('ct_title').value.trim(),
      type: document.getElementById('ct_type').value,
      roadmap_id: document.getElementById('ct_roadmap').value || null,
      duration_minutes: document.getElementById('ct_duration').value ? parseInt(document.getElementById('ct_duration').value, 10) : null,
      page_count: document.getElementById('ct_pages').value ? parseInt(document.getElementById('ct_pages').value, 10) : null,
      url: document.getElementById('ct_url').value.trim() || null,
      published: document.getElementById('ct_published').checked
    };
    const msg = document.getElementById('ct_msg');
    const { error } = id ? await sb.from('content_items').update(payload).eq('id', id) : await sb.from('content_items').insert(payload);
    if (error) { msg.textContent = error.message; msg.className = 'msg err'; return; }
    msg.textContent = 'Saved.'; msg.className = 'msg ok';
    document.getElementById('contentForm').reset(); document.getElementById('ct_id').value = '';
    await loadContent();
  });
  document.getElementById('ct_cancel').addEventListener('click', () => {
    document.getElementById('contentForm').reset(); document.getElementById('ct_id').value = '';
  });

  // ------------------------------------------------------------
  // RECOGNITION LETTERS
  // ------------------------------------------------------------
  function populateLetterPickers() {
    studentOptions(document.getElementById('lt_student'));
    roadmapOptions(document.getElementById('lt_roadmap'));
  }

  document.getElementById('letterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('lt_msg');
    const studentId = document.getElementById('lt_student').value;
    if (!studentId) { msg.textContent = 'Pick a student.'; msg.className = 'msg err'; return; }
    const code = 'RENI-' + Date.now().toString(36).toUpperCase();
    const payload = {
      student_id: studentId,
      roadmap_id: document.getElementById('lt_roadmap').value || null,
      recognition_code: code,
      duration_label: document.getElementById('lt_duration').value.trim(),
      completed_on: document.getElementById('lt_completed').value || null,
      director_name: document.getElementById('lt_director').value.trim() || 'R. Sharma'
    };
    const { error } = await sb.from('recognition_letters').insert(payload);
    if (error) { msg.textContent = error.message; msg.className = 'msg err'; return; }
    msg.textContent = `Issued (${code}).`; msg.className = 'msg ok';
    document.getElementById('letterForm').reset();
  });

})();
