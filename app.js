// ============================================================
// RENI NOW LEARNING — Supabase-backed app logic
// Depends on: @supabase/supabase-js (UMD), window.RENI_CONFIG (config.js)
// ============================================================
(async function () {
  let { SUPABASE_URL, SUPABASE_ANON_KEY } = window.RENI_CONFIG || {};

  // If js/config.js wasn't filled in (or this is a placeholder), fall back to
  // the backend's /api/config endpoint, which reads SUPABASE_URL /
  // SUPABASE_ANON_KEY from server environment variables (set these in the
  // Render dashboard). This lets the same static frontend work either way.
  if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      if (cfg.SUPABASE_URL) { SUPABASE_URL = cfg.SUPABASE_URL; SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY; }
    } catch (e) {
      console.warn('[Reni] Could not load /api/config', e);
    }
  }
  if (!SUPABASE_URL) {
    console.warn("[Reni] Supabase keys not set — edit js/config.js or set SUPABASE_URL/SUPABASE_ANON_KEY env vars");
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let currentUser = null;
  let currentProfile = null;

  // ------------------------------------------------------------
  // AUTH
  // ------------------------------------------------------------
  async function signUp({ fullName, email, phone, password }) {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone } }
    });
    if (error) throw error;
    return data;
  }

  async function signIn({ email, password }) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    await sb.auth.signOut();
  }

  async function loadCurrentUser() {
    const { data: { session } } = await sb.auth.getSession();
    currentUser = session ? session.user : null;
    if (!currentUser) return null;
    const { data: profile } = await sb
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();
    currentProfile = profile;

    if (profile && profile.blocked) {
      await sb.auth.signOut();
      currentUser = null;
      currentProfile = null;
      throw new Error("Your account has been blocked. Contact your instructor.");
    }

    return currentUser;
  }

  // ------------------------------------------------------------
  // DATA FETCHERS
  // ------------------------------------------------------------
  async function fetchDashboardStats() {
    const { data, error } = await sb.rpc("get_dashboard_stats");
    if (error) { console.error(error); return null; }
    return data;
  }

  async function fetchRoadmapProgress() {
    const { data, error } = await sb.rpc("get_my_roadmap_progress");
    if (error) { console.error(error); return []; }
    return data || [];
  }

  async function fetchAllRoadmaps() {
    const { data, error } = await sb.from("roadmaps").select("*").order("title");
    if (error) { console.error(error); return []; }
    return data || [];
  }

  async function fetchAssignments() {
    const { data, error } = await sb
      .from("assignments")
      .select("*, roadmaps(title), assignment_submissions(status, submitted_at, score, feedback, content, file_url, student_id)")
      .order("due_at", { ascending: true });
    if (error) { console.error(error); return []; }
    // keep only this student's submission row (RLS already limits to own, but be defensive)
    return (data || []).map(a => ({
      ...a,
      mySubmission: (a.assignment_submissions || [])[0] || null
    }));
  }

  // ------------------------------------------------------------
  // ASSIGNMENT SUBMISSION (file upload to Supabase Storage)
  // ------------------------------------------------------------
  async function submitAssignment(assignmentId, file, notes) {
    let filePath = null;
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      filePath = `${currentUser.id}/${assignmentId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await sb.storage.from("submission-files").upload(filePath, file, { upsert: true });
      if (upErr) throw upErr;
    }
    const payload = {
      assignment_id: assignmentId,
      student_id: currentUser.id,
      status: "submitted",
      content: notes || null,
      submitted_at: new Date().toISOString()
    };
    if (filePath) payload.file_url = filePath;
    const { error } = await sb
      .from("assignment_submissions")
      .upsert(payload, { onConflict: "assignment_id,student_id" });
    if (error) throw error;
  }

  async function getSignedSubmissionUrl(path) {
    const { data, error } = await sb.storage.from("submission-files").createSignedUrl(path, 3600);
    if (error) { console.error(error); return null; }
    return data.signedUrl;
  }

  async function fetchAssessments() {
    const { data, error } = await sb
      .from("assessments")
      .select("*, roadmaps(title), assessment_results(status, score, attempted_at, student_id)")
      .order("scheduled_at", { ascending: false });
    if (error) { console.error(error); return []; }
    return (data || []).map(a => ({
      ...a,
      myResult: (a.assessment_results || [])[0] || null
    }));
  }

  async function fetchLeaderboard() {
    const { data, error } = await sb.rpc("get_leaderboard", { p_limit: 50 });
    if (error) { console.error(error); return []; }
    return data || [];
  }

  async function fetchSessions() {
    const { data, error } = await sb
      .from("live_sessions")
      .select("*")
      .order("starts_at", { ascending: true });
    if (error) { console.error(error); return []; }
    return data || [];
  }

  async function fetchContent() {
    const { data, error } = await sb
      .from("content_items")
      .select("*, roadmaps(title)")
      .order("created_at", { ascending: false });
    if (error) { console.error(error); return []; }
    return data || [];
  }

  async function fetchSubscription() {
    const { data, error } = await sb.from("subscriptions").select("*").maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
  }

  async function fetchBillingHistory() {
    const { data, error } = await sb.from("billing_history").select("*").order("billed_at", { ascending: false });
    if (error) { console.error(error); return []; }
    return data || [];
  }

  async function fetchRecognitionLetter() {
    const { data, error } = await sb
      .from("recognition_letters")
      .select("*, roadmaps(title)")
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
  }

  async function updateProfile(fields) {
    const { error } = await sb.from("profiles").update(fields).eq("id", currentUser.id);
    if (error) throw error;
  }

  async function rsvpSession(sessionId, status) {
    const { error } = await sb.from("session_rsvps").upsert(
      { session_id: sessionId, student_id: currentUser.id, status },
      { onConflict: "session_id,student_id" }
    );
    if (error) throw error;
  }

  // ------------------------------------------------------------
  // FORMAT HELPERS
  // ------------------------------------------------------------
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
  const initials = (name) => (name || 'S').trim().charAt(0).toUpperCase();
  const relativeDue = (iso) => {
    if (!iso) return '—';
    const diffMs = new Date(iso) - new Date();
    const days = Math.round(diffMs / 86400000);
    if (days > 1) return `Due in ${days} days`;
    if (days === 1) return 'Due tomorrow';
    if (days === 0) return 'Due today';
    return `Was due ${fmtDate(iso)}`;
  };

  // ------------------------------------------------------------
  // NOTIFICATIONS (new assignments + upcoming live sessions)
  // ------------------------------------------------------------
  let notifSeenAt = null;
  let notifKnownIds = new Set();
  let notifPollStarted = false;

  const notifSeenKey = () => `reni_notif_seen_${currentUser?.id || 'anon'}`;

  function loadNotifSeenAt() {
    const stored = localStorage.getItem(notifSeenKey());
    if (stored) return new Date(stored);
    // First time opening the app: don't flag everything ever posted as unread,
    // just the last 7 days, so existing students aren't flooded.
    return new Date(Date.now() - 7 * 86400000);
  }

  function saveNotifSeenAt(date) {
    notifSeenAt = date;
    localStorage.setItem(notifSeenKey(), date.toISOString());
  }

  async function buildNotifications() {
    const [assignments, sessions] = await Promise.all([fetchAssignments(), fetchSessions()]);
    const items = [];
    assignments.forEach(a => {
      items.push({
        id: `assignment-${a.id}`,
        type: 'assignment',
        title: a.title,
        sub: a.due_at ? `New assignment · Due ${fmtDate(a.due_at)}` : 'New assignment posted',
        createdAt: new Date(a.created_at || a.due_at || Date.now())
      });
    });
    sessions.forEach(s => {
      if (new Date(s.starts_at) < new Date()) return; // skip sessions already over
      items.push({
        id: `session-${s.id}`,
        type: 'session',
        title: s.title,
        sub: `Live session · ${fmtDateTime(s.starts_at)}`,
        createdAt: new Date(s.created_at || s.starts_at)
      });
    });
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items.slice(0, 25);
  }

  function notifIcon(type) {
    return type === 'session'
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6l3 5v11a2 2 0 01-2 2H8a2 2 0 01-2-2V8z"/><path d="M9 12h6M9 16h6"/></svg>';
  }

  function renderNotifPanel(items) {
    const list = document.getElementById('notifList');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `<div class="notif-empty">No assignments or sessions yet.</div>`;
      return;
    }
    list.innerHTML = items.map(item => `
      <div class="notif-item ${item.createdAt > notifSeenAt ? 'unread' : ''}">
        <div class="notif-item-icon">${notifIcon(item.type)}</div>
        <div>
          <div class="notif-item-title">${item.title}</div>
          <div class="notif-item-sub">${item.sub}</div>
        </div>
      </div>
    `).join('');
  }

  function showNotifToast(item) {
    const stack = document.getElementById('notifToastStack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = 'notif-toast';
    toast.innerHTML = `
      <div class="notif-toast-icon">${notifIcon(item.type)}</div>
      <div>
        <div class="notif-toast-title">${item.type === 'session' ? 'New live session' : 'New assignment'}</div>
        <div class="notif-toast-sub">${item.title}</div>
      </div>
      <button class="notif-toast-close" aria-label="Dismiss">✕</button>
    `;
    toast.querySelector('.notif-toast-close').addEventListener('click', () => toast.remove());
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  }

  // announceNew: pop a toast for items that appeared since the last poll
  async function refreshNotifications({ announceNew } = {}) {
    if (notifSeenAt === null) notifSeenAt = loadNotifSeenAt();
    const items = await buildNotifications();

    if (announceNew && notifKnownIds.size) {
      items.forEach(item => {
        if (!notifKnownIds.has(item.id) && item.createdAt > notifSeenAt) {
          showNotifToast(item);
        }
      });
    }
    notifKnownIds = new Set(items.map(i => i.id));

    const dot = document.getElementById('notifDot');
    const hasUnread = items.some(i => i.createdAt > notifSeenAt);
    if (dot) dot.style.display = hasUnread ? 'block' : 'none';

    renderNotifPanel(items);

    if (!notifPollStarted) {
      notifPollStarted = true;
      setInterval(() => refreshNotifications({ announceNew: true }), 60000);
    }
    return items;
  }

  // ------------------------------------------------------------
  // RENDERERS
  // ------------------------------------------------------------
  async function renderTopbarAndDashboard() {
    document.getElementById('avatarInitial').textContent = initials(currentProfile?.full_name);
    document.getElementById('welcomeHeading').textContent = `Welcome back, ${currentProfile?.full_name || 'Student'} 👋`;

    const [stats, roadmapProgress, sub] = await Promise.all([
      fetchDashboardStats(), fetchRoadmapProgress(), fetchSubscription()
    ]);

    if (sub) {
      document.getElementById('planBadgeText').textContent = sub.plan === 'pro' ? 'RENI Pro' : 'RENI Free';
    }

    if (stats) {
      document.getElementById('xpBadgeVal').textContent = `${stats.total_xp} XP`;
      document.getElementById('rankBadge').textContent = stats.rank ? `Rank #${stats.rank}` : 'Rank TBD';

      const statXP = document.getElementById('statXP');
      statXP.querySelector('[data-field="num"]').textContent = `${stats.total_xp} XP`;
      statXP.querySelector('[data-field="delta"]').textContent = `▲ ${stats.xp_this_week} XP this week`;

      const statRank = document.getElementById('statRank');
      statRank.querySelector('[data-field="num"]').textContent = stats.rank ? `#${stats.rank}` : 'TBD';
      statRank.querySelector('[data-field="delta"]').textContent = stats.rank ? 'Keep it up' : 'Complete a class to rank';

      const statSessions = document.getElementById('statSessions');
      statSessions.querySelector('[data-field="num"]').textContent = stats.upcoming_sessions;
      statSessions.querySelector('[data-field="delta"]').textContent = stats.next_session
        ? `Next: ${fmtDateTime(stats.next_session.starts_at)}` : 'None scheduled';

      const statAssignments = document.getElementById('statAssignments');
      statAssignments.querySelector('[data-field="num"]').textContent = stats.pending_assignments;
      statAssignments.querySelector('[data-field="delta"]').textContent = stats.pending_assignments > 0
        ? `${stats.pending_assignments} awaiting submission` : 'All caught up';
    }

    // Continue where you left off
    const continueGrid = document.getElementById('continueGrid');
    if (!roadmapProgress.length) {
      continueGrid.innerHTML = `<p style="color:var(--muted);font-size:13.5px;">You're not enrolled in any roadmap yet.</p>`;
    } else {
      continueGrid.innerHTML = roadmapProgress.map(r => `
        <div class="card card-hover">
          <div class="list-row-title">${r.title}</div>
          <div class="list-row-sub">${r.track_label}</div>
          <div class="progress-track"><div class="progress-fill" style="width:${r.progress_pct}%;"></div></div>
          <div class="stat-delta" style="color:var(--muted);margin-top:8px;">${r.progress_pct}% complete</div>
        </div>
      `).join('');
    }

    // Up next: nearest upcoming session + nearest pending assignment
    const sessions = await fetchSessions();
    const upcoming = sessions.filter(s => new Date(s.starts_at) >= new Date()).slice(0, 1);
    const assignments = await fetchAssignments();
    const pending = assignments.filter(a => a.mySubmission?.status !== 'submitted' && a.mySubmission?.status !== 'graded').slice(0, 1);

    const upNextList = document.getElementById('upNextList');
    let rows = '';
    upcoming.forEach(s => {
      rows += `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>
            <div><div class="list-row-title">${s.title}</div><div class="list-row-sub">${fmtDateTime(s.starts_at)} · with ${s.instructor_name || 'TBA'}</div></div>
          </div>
          <span class="pill pill-live">Live soon</span>
        </div>`;
    });
    pending.forEach(a => {
      rows += `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2h6a1 1 0 011 1v2H8V3a1 1 0 011-1z"/><path d="M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2"/></svg></div>
            <div><div class="list-row-title">${a.title}</div><div class="list-row-sub">${relativeDue(a.due_at)}</div></div>
          </div>
          <span class="pill pill-pending">Pending</span>
        </div>`;
    });
    upNextList.innerHTML = rows || `<div class="list-row"><span style="color:var(--muted);font-size:13.5px;">Nothing due right now — you're all caught up.</span></div>`;
  }

  async function renderRoadmaps() {
    const grid = document.getElementById('roadmapsGrid');
    const [all, progress] = await Promise.all([fetchAllRoadmaps(), fetchRoadmapProgress()]);
    const progressById = Object.fromEntries(progress.map(p => [p.roadmap_id, p]));
    grid.innerHTML = all.map(r => {
      const p = progressById[r.id];
      const pct = p ? p.progress_pct : 0;
      const doneModules = p ? p.completed_modules : 0;
      return `
        <div class="card card-hover">
          <div class="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg></div>
          <div class="list-row-title">${r.title}</div>
          <div class="list-row-sub" style="margin-bottom:14px;">${r.total_modules} modules · ${r.track_label}</div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
          <div class="stat-delta" style="color:var(--muted);margin-top:8px;">${p ? `${doneModules} of ${r.total_modules} modules complete` : 'Not enrolled yet'}</div>
        </div>`;
    }).join('') || `<p style="color:var(--muted);font-size:13.5px;">No roadmaps published yet.</p>`;
  }

  async function renderAssignments() {
    const list = document.getElementById('assignmentsList');
    const assignments = await fetchAssignments();
    list.innerHTML = assignments.map(a => {
      const status = a.mySubmission?.status || 'pending';
      const pillClass = status === 'graded' ? 'pill-graded' : status === 'submitted' ? 'pill-submitted' : 'pill-pending';
      const sub = status === 'graded'
        ? `${a.roadmaps?.title || ''} · Graded — ${a.mySubmission.score ?? '—'}%`
        : status === 'submitted'
          ? `${a.roadmaps?.title || ''} · Submitted ${fmtDate(a.mySubmission.submitted_at)}`
          : `${a.roadmaps?.title || ''} · ${relativeDue(a.due_at)}`;
      const attachment = a.attachment_url
        ? `<a class="attachment-link" href="${a.attachment_url}" target="_blank" rel="noopener">📎 ${a.attachment_name || 'Assignment file'}</a>`
        : '';
      const feedback = (status === 'graded' && a.mySubmission?.feedback)
        ? `<div class="list-row-sub" style="margin-top:4px;">Feedback: ${a.mySubmission.feedback}</div>`
        : '';
      const mySubmissionLink = a.mySubmission?.file_url
        ? `<button class="attachment-link" style="border:none;background:none;padding:0;" data-view-submission="${a.mySubmission.file_url}">📄 View my submitted file</button>`
        : '';
      const canSubmit = status !== 'graded';
      return `
        <div class="list-row" style="flex-direction:column;align-items:stretch;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;width:100%;">
            <div class="list-row-main">
              <div class="list-row-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6M9 16h6M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2"/></svg></div>
              <div>
                <div class="list-row-title">${a.title}</div>
                <div class="list-row-sub">${sub}</div>
                ${attachment}${feedback}${mySubmissionLink}
              </div>
            </div>
            <span class="pill ${pillClass}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
          </div>
          ${canSubmit ? `
          <div class="submit-wrap">
            <div class="submit-row">
              <label class="btn btn-outline btn-sm file-input-btn">Choose file<input type="file" data-submit-file="${a.id}"></label>
              <span class="file-name" data-file-name="${a.id}">No file chosen</span>
              <input type="text" class="notes-input" placeholder="Notes (optional)" data-submit-notes="${a.id}">
              <button class="btn btn-primary btn-sm" data-submit-btn="${a.id}">${status === 'submitted' ? 'Resubmit' : 'Submit'}</button>
            </div>
            <p class="submit-msg" data-submit-msg="${a.id}"></p>
          </div>` : ''}
        </div>`;
    }).join('') || `<div class="list-row"><span style="color:var(--muted);font-size:13.5px;">No assignments yet.</span></div>`;

    list.querySelectorAll('[data-submit-file]').forEach(input => {
      input.addEventListener('change', () => {
        const id = input.dataset.submitFile;
        const nameEl = list.querySelector(`[data-file-name="${id}"]`);
        nameEl.textContent = input.files[0] ? input.files[0].name : 'No file chosen';
      });
    });

    list.querySelectorAll('[data-submit-btn]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.submitBtn;
        const fileInput = list.querySelector(`[data-submit-file="${id}"]`);
        const notesInput = list.querySelector(`[data-submit-notes="${id}"]`);
        const msgEl = list.querySelector(`[data-submit-msg="${id}"]`);
        const file = fileInput.files[0] || null;
        const notes = notesInput.value.trim();
        if (!file && !notes) {
          msgEl.textContent = 'Attach a file or add a note first.';
          msgEl.className = 'submit-msg err';
          return;
        }
        const original = btn.textContent;
        btn.textContent = 'Submitting…'; btn.disabled = true;
        try {
          await submitAssignment(id, file, notes);
          await renderAssignments();
          await renderTopbarAndDashboard();
        } catch (e) {
          console.error(e);
          msgEl.textContent = e.message || 'Could not submit. Try again.';
          msgEl.className = 'submit-msg err';
          btn.textContent = original; btn.disabled = false;
        }
      });
    });

    list.querySelectorAll('[data-view-submission]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const original = btn.textContent;
        btn.textContent = 'Opening…';
        const url = await getSignedSubmissionUrl(btn.dataset.viewSubmission);
        btn.textContent = original;
        if (url) window.open(url, '_blank');
        else alert('Could not open that file.');
      });
    });
  }

  async function renderAssessments() {
    const tbody = document.getElementById('assessmentsTableBody');
    const assessments = await fetchAssessments();
    tbody.innerHTML = assessments.map(a => {
      const result = a.myResult;
      const scoreCell = result && result.status === 'attempted'
        ? `<td style="color:var(--good);font-weight:600;">${result.score}%</td>`
        : `<td style="color:var(--muted-2);">Not attempted</td>`;
      return `<tr>
        <td>${a.title}</td>
        <td>${a.roadmaps?.title || '—'}</td>
        ${scoreCell}
        <td>${result?.attempted_at ? fmtDate(result.attempted_at) : (a.scheduled_at ? fmtDate(a.scheduled_at) : '—')}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" style="color:var(--muted);">No assessments yet.</td></tr>`;
  }

  async function renderLeaderboard() {
    const tbody = document.getElementById('leaderboardTableBody');
    const rows = await fetchLeaderboard();
    tbody.innerHTML = rows.map(r => {
      const isMe = r.student_id === currentUser.id;
      const rankClass = r.rank <= 3 ? 'rank-num top' : 'rank-num';
      return `<tr ${isMe ? 'style="background:rgba(255,203,116,.06);"' : ''}>
        <td><span class="${rankClass}">${r.rank}</span></td>
        <td><div class="lb-user"><div class="lb-avatar" ${isMe ? 'style="background:linear-gradient(135deg,#FFDA9B,var(--teal));color:#232120;"' : ''}>${initials(r.full_name)}</div>${isMe ? `<b>You</b>` : r.full_name}</div></td>
        <td>${r.total_xp} XP</td>
      </tr>`;
    }).join('') || `<tr><td colspan="3" style="color:var(--muted);">No students on the leaderboard yet.</td></tr>`;
  }

  async function renderSessions() {
    const list = document.getElementById('sessionsList');
    const sessions = await fetchSessions();
    const now = new Date();
    list.innerHTML = sessions.map(s => {
      const start = new Date(s.starts_at);
      let actionHtml;
      if (start >= now) {
        actionHtml = s.meeting_url
          ? `<a href="${s.meeting_url}" target="_blank" class="btn btn-primary btn-sm">Join</a>`
          : `<button class="btn btn-outline btn-sm" data-rsvp="${s.id}">Add to calendar</button>`;
      } else {
        actionHtml = s.recording_url
          ? `<a href="${s.recording_url}" target="_blank" class="btn btn-outline btn-sm">Watch recording</a>`
          : `<span class="pill pill-graded">Completed</span>`;
      }
      return `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>
            <div><div class="list-row-title">${s.title}</div><div class="list-row-sub">${fmtDateTime(s.starts_at)}${s.instructor_name ? ' · with ' + s.instructor_name : ''}</div></div>
          </div>
          ${actionHtml}
        </div>`;
    }).join('') || `<div class="list-row"><span style="color:var(--muted);font-size:13.5px;">No sessions scheduled.</span></div>`;

    list.querySelectorAll('[data-rsvp]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.textContent = 'Adding…';
        try { await rsvpSession(btn.dataset.rsvp, 'attending'); btn.textContent = 'Added ✓'; }
        catch (e) { btn.textContent = 'Add to calendar'; console.error(e); }
      });
    });
  }

  async function renderContent() {
    const grid = document.getElementById('contentGrid');
    const items = await fetchContent();
    grid.innerHTML = items.map(c => {
      const isVideo = c.type === 'video';
      const meta = isVideo ? `${c.duration_minutes || '—'} min` : `${c.type.toUpperCase()} · ${c.page_count || '—'} pages`;
      const icon = isVideo
        ? `<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4V8z"/>`
        : `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>`;
      return `
        <div class="card card-hover">
          <div class="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg></div>
          <div class="list-row-title">${c.title}</div>
          <div class="list-row-sub">${c.roadmaps?.title || ''} · ${meta}</div>
        </div>`;
    }).join('') || `<p style="color:var(--muted);font-size:13.5px;">No content published yet.</p>`;
  }

  async function loadOwnQr() {
    const img = document.getElementById('qrImage');
    const dl = document.getElementById('downloadQrBtn');
    if (!img) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch('/api/qr/me', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) throw new Error('QR request failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      img.src = url;
      if (dl) dl.href = url;
    } catch (err) {
      console.warn('[Reni] could not load QR', err);
    }
  }

  async function renderProfilePage() {
    document.getElementById('profileFullName').value = currentProfile?.full_name || '';
    document.getElementById('profileEmail').value = currentUser?.email || '';
    document.getElementById('profilePhone').value = currentProfile?.phone || '';
    document.getElementById('settingsLanguage').value = currentProfile?.preferred_language || 'English';
    document.getElementById('settingsReminders').value = currentProfile?.reminder_pref || 'Email + WhatsApp';
    document.getElementById('summaryMember').textContent = currentProfile?.member_since ? fmtDate(currentProfile.member_since) : '—';
    document.getElementById('qrId').textContent = `ID: ${currentUser.id.slice(0, 8).toUpperCase()}`;
    loadOwnQr();

    document.getElementById('verifyEmailText').textContent = currentUser?.email || '—';
    const emailVerified = !!currentUser?.email_confirmed_at;
    const emailPill = document.getElementById('verifyEmailPill');
    emailPill.textContent = emailVerified ? 'Verified' : 'Pending';
    emailPill.className = 'pill ' + (emailVerified ? 'pill-graded' : 'pill-pending');

    document.getElementById('verifyPhoneText').textContent = currentProfile?.phone || '—';
    const phonePill = document.getElementById('verifyPhonePill');
    phonePill.textContent = currentProfile?.phone_verified ? 'Verified' : 'Pending';
    phonePill.className = 'pill ' + (currentProfile?.phone_verified ? 'pill-graded' : 'pill-pending');

    const [roadmapProgress, stats, letter, sub, billing] = await Promise.all([
      fetchRoadmapProgress(), fetchDashboardStats(), fetchRecognitionLetter(), fetchSubscription(), fetchBillingHistory()
    ]);

    document.getElementById('summaryClasses').textContent = roadmapProgress.length;
    document.getElementById('summaryXP').textContent = stats?.total_xp ?? 0;
    document.getElementById('summaryCerts').textContent = letter ? 1 : 0;

    // Subscription
    const planBadge = document.getElementById('subPlanBadge');
    const planTitle = document.getElementById('subPlanTitle');
    const planDesc = document.getElementById('subPlanDesc');
    const renews = document.getElementById('subRenews');
    if (sub?.plan === 'pro') {
      planBadge.textContent = 'RENI Pro';
      planTitle.textContent = "You're on the Pro plan";
      planDesc.textContent = 'Unlimited live classes, all recordings, and priority doubt support.';
      renews.textContent = sub.renews_at ? `Renews on ${fmtDate(sub.renews_at)}` : '';
    } else {
      planBadge.textContent = 'RENI Free';
      planTitle.textContent = "You're on the Free plan";
      planDesc.textContent = 'Upgrade any time for unlimited live classes and priority support.';
      renews.textContent = '';
    }
    const billingList = document.getElementById('billingHistoryList');
    billingList.innerHTML = billing.length
      ? billing.map(b => `<div class="list-row" style="padding-left:0;padding-right:0;"><span style="color:var(--muted);">${fmtDate(b.billed_at)}</span><b>₹${b.amount}</b></div>`).join('')
      : `<p style="color:var(--muted);font-size:13px;">No billing history yet.</p>`;

    // Recognition letter
    document.getElementById('letterDate').textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    document.getElementById('letterStudentName').textContent = currentProfile?.full_name || 'Student';
    if (letter) {
      document.getElementById('letterRecognitionId').textContent = letter.recognition_code;
      document.getElementById('letterCourse').textContent = letter.roadmaps?.title || '—';
      document.getElementById('letterDuration').textContent = letter.duration_label || '—';
      document.getElementById('letterCompletedOn').textContent = letter.completed_on ? fmtDate(letter.completed_on) : '—';
    } else {
      document.getElementById('letterRecognitionId').textContent = 'Not yet issued';
      document.getElementById('letterCourse').textContent = '—';
      document.getElementById('letterDuration').textContent = '—';
      document.getElementById('letterCompletedOn').textContent = '—';
    }
  }

  async function renderAll() {
    await renderTopbarAndDashboard();
    await renderRoadmaps();
    await renderAssignments();
    await renderAssessments();
    await renderLeaderboard();
    await renderSessions();
    await renderContent();
    await renderProfilePage();
    await refreshNotifications();
  }

  // Re-render just the page being switched to, so data stays fresh without refetching everything.
  const pageRenderers = {
    dashboard: renderTopbarAndDashboard,
    roadmaps: renderRoadmaps,
    assignments: renderAssignments,
    assessments: renderAssessments,
    leaderboards: renderLeaderboard,
    sessions: renderSessions,
    content: renderContent,
    profile: renderProfilePage
  };

  // ------------------------------------------------------------
  // AUTH GATE WIRING
  // ------------------------------------------------------------
  const authGate = document.getElementById('authGate');
  const appRoot = document.getElementById('appRoot');
  const authError = document.getElementById('authError');

  function showApp() {
    authGate.style.display = 'none';
    appRoot.classList.add('ready');
    const adminLink = document.getElementById('adminConsoleLink');
    if (adminLink) {
      adminLink.style.display = (currentProfile?.role === 'admin' || currentProfile?.role === 'instructor') ? 'flex' : 'none';
    }
  }
  function showAuthGate() {
    authGate.style.display = 'flex';
    appRoot.classList.remove('ready');
  }

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.form).classList.add('active');
      authError.textContent = '';
    });
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    try {
      await signIn({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value
      });
      await loadCurrentUser();
      showApp();
      await renderAll();
    } catch (err) {
      authError.textContent = err.message || 'Could not log in.';
    }
  });

  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    try {
      await signUp({
        fullName: document.getElementById('signupName').value.trim(),
        email: document.getElementById('signupEmail').value.trim(),
        phone: document.getElementById('signupPhone').value.trim(),
        password: document.getElementById('signupPassword').value
      });
      authError.style.color = 'var(--good)';
      authError.textContent = 'Account created — check your email to confirm, then log in.';
    } catch (err) {
      authError.style.color = 'var(--bad)';
      authError.textContent = err.message || 'Could not sign up.';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut();
    currentUser = null;
    currentProfile = null;
    showAuthGate();
  });

  document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const btn = document.getElementById('saveProfileBtn');
    const original = btn.textContent;
    btn.textContent = 'Saving…';
    try {
      await updateProfile({
        full_name: document.getElementById('profileFullName').value.trim(),
        phone: document.getElementById('profilePhone').value.trim()
      });
      await loadCurrentUser();
      btn.textContent = 'Saved ✓';
    } catch (e) {
      console.error(e);
      btn.textContent = 'Failed — retry';
    } finally {
      setTimeout(() => { btn.textContent = original; }, 1500);
    }
  });

  document.getElementById('savePrefsBtn').addEventListener('click', async () => {
    const btn = document.getElementById('savePrefsBtn');
    const original = btn.textContent;
    btn.textContent = 'Saving…';
    try {
      await updateProfile({
        preferred_language: document.getElementById('settingsLanguage').value,
        reminder_pref: document.getElementById('settingsReminders').value
      });
      await loadCurrentUser();
      btn.textContent = 'Saved ✓';
    } catch (e) {
      console.error(e);
      btn.textContent = 'Failed — retry';
    } finally {
      setTimeout(() => { btn.textContent = original; }, 1500);
    }
  });

  document.getElementById('notifBtn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const panel = document.getElementById('notifPanel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      await refreshNotifications();
    }
  });

  document.getElementById('notifMarkRead').addEventListener('click', (e) => {
    e.stopPropagation();
    saveNotifSeenAt(new Date());
    const dot = document.getElementById('notifDot');
    if (dot) dot.style.display = 'none';
    document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
  });

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('notifWrap');
    const panel = document.getElementById('notifPanel');
    if (wrap && panel && !wrap.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  // ------------------------------------------------------------
  // BOOT
  // ------------------------------------------------------------
  sb.auth.onAuthStateChange((_event, _session) => {
    // handled explicitly after signIn/signUp/signOut above to avoid double-renders on load
  });

  (async function boot() {
    try {
      const user = await loadCurrentUser();
      if (user) {
        showApp();
        await renderAll();
      } else {
        showAuthGate();
      }
    } catch (err) {
      showAuthGate();
      authError.style.color = 'var(--bad)';
      authError.textContent = err.message || 'Could not sign in.';
    }
  })();
  async function renderAttendanceQr(userId) {
  const canvas = document.getElementById('attendanceQr');
  if (!canvas) return;
  // QR payload is simply the student's own auth.uid() — nothing sensitive,
  // and the admin scanner can only write attendance, not read anything else with it.
  await QRCode.toCanvas(canvas, userId, { width: 220, margin: 1 });
}

// call it once you have the current user, e.g.:
// const { data: { user } } = await sb.auth.getUser();
// renderAttendanceQr(user.id);

  // expose a small surface for the inline nav script in index.html
  window.Reni = {
    onPageShown: (page) => { if (pageRenderers[page]) pageRenderers[page](); }
  };
})();
