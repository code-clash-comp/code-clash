(async function(){
  // ---------- CONFIG ----------
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDpKPIqiWrGpvE3xL6TBRQEEfrpZGIfedM",
    authDomain: "code-clash-2025.firebaseapp.com",
    projectId: "code-clash-2025",
    storageBucket: "code-clash-2025.appspot.com",
    messagingSenderId: "13717806434",
    appId: "1:13717806434:web:8aa7799e7f87ebbdf0603b",
    measurementId: "G-0BMTHMYMEL"
  };
  // ----------------------------

  // DOM refs
  const navDashboard = document.getElementById('navDashboard');
  const navLogin = document.getElementById('navLogin');
  const usersTbody = document.getElementById('usersTbody');
  const refreshBtn = document.getElementById('refreshBtn');
  const filterInput = document.getElementById('filterInput');
  const statParticipants = document.getElementById('statParticipants');
  const statAdmins = document.getElementById('statAdmins');
  const statTotal = document.getElementById('statTotal');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const participantsToggle = document.getElementById('participantsToggle');

  const cellTooltip = document.getElementById('cellTooltip');
  const toastEl = document.getElementById('toast');

  navDashboard.onclick = ()=> window.location.href = 'dashboard.html';

  // firebase imports (modular)
  const [
    { initializeApp },
    { getFirestore, collection, doc, onSnapshot, updateDoc, getDoc, serverTimestamp },
    { getAuth, onAuthStateChanged, signOut },
  ] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js'),

  ]).catch(err => { console.error('firebase import failed', err); throw err; });

  const app = initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);
  const auth = getAuth(app);

  // state
  let currentUser = null;
  let currentUserClaims = {};
  let isSuperAdmin = false;
  let isAdmin = false;
  let users = []; // array of { uid, ...doc }
  let teams = []; // teams snapshot
  let participantsOnly = false; // toggle state

  // masterSortedUsers and mapping uid->serial provide stable serial numbers
  let masterSortedUsers = []; // sorted by admin rank + name
  let uidToSerial = {}; // uid -> stable serial number

  // ---------- guard: allow only admins/superAdmin ----------
  function adminDenied() {
    alert('Admin access required. Redirecting to home.');
    window.location.href = '/code-clash/';
  }

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if(!user) return adminDenied();

    // Try to read custom claims (preferred)
    try {
      const tokenRes = await user.getIdTokenResult();
      currentUserClaims = tokenRes.claims || {};
      isAdmin = !!(currentUserClaims.admin || currentUserClaims.isAdmin);
      isSuperAdmin = !!(currentUserClaims.superAdmin || currentUserClaims.isSuperAdmin);
    } catch(e) {
      console.warn('getIdTokenResult failed', e);
    }

    // If no admin claims, fallback to checking users/{uid} doc
    if(!isAdmin && !isSuperAdmin){
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        const data = snap.exists() ? snap.data() : {};
        isAdmin = !!data.isAdmin;
        isSuperAdmin = !!data.isSuperAdmin;
      } catch(e){
        console.warn('fallback users doc check failed', e);
      }
    }

    if(!isAdmin && !isSuperAdmin) return adminDenied();

    // show "Logout" on nav
    if(navLogin){
      navLogin.textContent = 'Logout';
      navLogin.onclick = async ()=> {
        if(!confirm('Logout?')) return;
        try { await signOut(auth); } catch(e){ console.error(e); }
        window.location.href = '/';
      };
    }

    // start listeners after guard
    startListeners();
  });

  // ---------- listeners: users + teams ----------
  function startListeners(){
    onSnapshot(collection(db, 'teams'), (snap) => {
      teams = [];
      snap.forEach(d => teams.push({ id:d.id, ...d.data() }));
      rebuildMasterSort(); // teams can affect role (captain)
      renderTable(); // re-render when teams change
    }, err => console.error('teams listener', err));

    onSnapshot(collection(db, 'users'), (snap) => {
      users = [];
      snap.forEach(d => users.push({ uid: d.id, ...d.data() }));
      rebuildMasterSort();
      renderTable();
    }, err => console.error('users listener', err));
  }

  // ---------- helper functions ----------
  function lookupTeamForUser(uid){
    const t = teams.find(team => (team.members || []).includes(uid));
    if(!t) return { name: '-', id: null, isCaptain: false };
    return { name: t.name || 'Unnamed', id: t.id, isCaptain: t.captainUid === uid };
  }

  function sanitize(s){ return (s === undefined || s === null) ? '-' : String(s); }

  function isUserAdminFlag(u){
    return !!(u.isAdmin || u.isSuperAdmin);
  }

  // master comparator: super-admin first, then admins (alphabetically), then participants (alphabetically)
  function masterCompare(a, b){
    const aSuper = !!a.isSuperAdmin;
    const bSuper = !!b.isSuperAdmin;
    if(aSuper !== bSuper) return aSuper ? -1 : 1;

    const aAdmin = !!a.isAdmin;
    const bAdmin = !!b.isAdmin;
    if(aAdmin !== bAdmin) return aAdmin ? -1 : 1;

    // both same role group - sort by name (fallback to email/uid)
    const an = (a.name || a.displayName || a.email || a.uid || '').toLowerCase();
    const bn = (b.name || b.displayName || b.email || b.uid || '').toLowerCase();
    if(an < bn) return -1;
    if(an > bn) return 1;
    return 0;
  }

  // rebuild masterSortedUsers and stable mapping
  function rebuildMasterSort(){
    masterSortedUsers = users.slice().sort(masterCompare);
    uidToSerial = {};
    for(let i=0;i<masterSortedUsers.length;i++){
      const u = masterSortedUsers[i];
      uidToSerial[u.uid] = i + 1; // stable serial (from master order)
    }
  }

  // create/position tooltip
  let tooltipTimeout = null;
  function showTooltip(text, rect){
    if(!cellTooltip) return;
    cellTooltip.textContent = text;
    cellTooltip.classList.add('show');
    requestAnimationFrame(()=>{
      const pad = 12;
      const tooltipW = cellTooltip.offsetWidth || 240;
      const left = Math.min(window.innerWidth - (tooltipW + pad), Math.max(pad, rect.left));
      const top = Math.max(pad, rect.top - (cellTooltip.offsetHeight || 40) - 8);
      cellTooltip.style.left = `${left}px`;
      cellTooltip.style.top = `${top}px`;
      cellTooltip.setAttribute('aria-hidden', 'false');
    });
    if(tooltipTimeout) clearTimeout(tooltipTimeout);
  }
  function hideTooltip(){
    if(!cellTooltip) return;
    cellTooltip.classList.remove('show');
    cellTooltip.setAttribute('aria-hidden', 'true');
    if(tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(()=>{ cellTooltip.textContent=''; }, 120);
  }

  // transient toast
  let toastTimer = null;
  function showToast(text='Copied'){
    if(!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('show');
    toastEl.setAttribute('aria-hidden','false');
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{ toastEl.classList.remove('show'); toastEl.setAttribute('aria-hidden','true'); }, 1600);
  }

  // copy helper
  async function copyToClipboard(s){
    try {
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(s);
      } else {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.style.position='fixed';
        ta.style.left='-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      showToast('Email copied');
      return true;
    } catch(e){
      console.error('copy failed', e);
      showToast('Copy failed');
      return false;
    }
  }

  // ---------- render table ----------
  function renderTable(){
    // ensure masterSortedUsers exists
    if(!masterSortedUsers || masterSortedUsers.length === 0){
      usersTbody.innerHTML = `<tr><td colspan="9" class="small-muted">No users found.</td></tr>`;
      statParticipants.textContent = '0';
      statAdmins.textContent = '0';
      statTotal.textContent = '0';
      return;
    }

    const q = (filterInput.value || '').trim().toLowerCase();

    // filtered from masterSortedUsers to keep stable serial positions
    const filtered = masterSortedUsers
      .filter(u => {
        if(participantsOnly && isUserAdminFlag(u)) return false;
        if(!q) return true;
        const hay = `${u.name||''} ${u.email||''} ${u.grade||''} ${lookupTeamForUser(u.uid).name||''}`.toLowerCase();
        return hay.includes(q);
      });

    // counts (participant exclude admin flags)
    const participantCount = users.reduce((acc,u) => { if(isUserAdminFlag(u)) return acc; return acc + 1; }, 0);
    const adminCount = users.reduce((acc,u) => acc + (isUserAdminFlag(u) ? 1 : 0), 0);
    const totalUsers = users.length;
    statParticipants.textContent = String(participantCount);
    statAdmins.textContent = String(adminCount);
    statTotal.textContent = String(totalUsers);

    if(filtered.length === 0){
      usersTbody.innerHTML = `<tr><td colspan="9" class="small-muted">No users found.</td></tr>`;
      return;
    }

    usersTbody.innerHTML = '';
    for(const u of filtered){
      const team = lookupTeamForUser(u.uid);
      const tr = document.createElement('tr');

      const snTd = document.createElement('td');
      snTd.textContent = String(uidToSerial[u.uid] || '-');
      snTd.setAttribute('data-full', snTd.textContent);

      const nameTd = document.createElement('td');
      const nameVal = sanitize(u.name || u.displayName || '-');
      nameTd.textContent = nameVal;
      nameTd.setAttribute('data-full', nameVal);

      const emailTd = document.createElement('td');
      const emailVal = sanitize(u.email || '-');
      emailTd.textContent = emailVal;
      emailTd.setAttribute('data-full', emailVal);

      const gradeTd = document.createElement('td');
      const gradeVal = sanitize(u.grade || '-');
      gradeTd.textContent = gradeVal;
      gradeTd.setAttribute('data-full', gradeVal);

      const phoneTd = document.createElement('td');
      const phoneVal = sanitize(u.phone || '-');
      phoneTd.textContent = phoneVal;
      phoneTd.setAttribute('data-full', phoneVal);

      const teamTd = document.createElement('td');
      if(team.id){
        teamTd.innerHTML = `${escapeHtml(team.name)} ${team.isCaptain ? '<span class="small-muted"> (captain)</span>' : ''}`;
        teamTd.setAttribute('data-full', `${team.name}${team.isCaptain ? ' (captain)' : ''}`);
      } else {
        teamTd.textContent = '-';
        teamTd.setAttribute('data-full', '-');
      }

      const roleTd = document.createElement('td');
      if(team.id) roleTd.innerHTML = team.isCaptain ? '<span class="role-badge badge-admin">Captain</span>' : '<span class="role-badge">Member</span>';
      else roleTd.textContent = '-';
      roleTd.setAttribute('data-full', team.id ? (team.isCaptain ? 'Captain' : 'Member') : '-');

      const adminTd = document.createElement('td');
      if(u.isSuperAdmin) { adminTd.innerHTML = '<span class="role-badge badge-super">Super</span>'; adminTd.setAttribute('data-full','Super-admin'); }
      else if(u.isAdmin) { adminTd.innerHTML = '<span class="role-badge badge-admin">Admin</span>'; adminTd.setAttribute('data-full','Admin'); }
      else { adminTd.textContent = '-'; adminTd.setAttribute('data-full','-'); }

      // actions - small compact buttons inside the table cell
      const actionsTd = document.createElement('td');
      actionsTd.style.textAlign = 'right';
      actionsTd.className = 'table-actions';

      // Promote / Demote (super-admin only)
      // replace the promote/demote blocks with the code below
      if(isSuperAdmin){
        if(u.isSuperAdmin){
          const dash = document.createElement('div'); dash.className = 'small-muted'; dash.textContent = '—';
          actionsTd.appendChild(dash);
        } else if(u.isAdmin){
          const demoteBtn = document.createElement('button');
          demoteBtn.className = 'action-btn demote';
          demoteBtn.textContent = 'Demote';
          demoteBtn.onclick = async ()=> {
            if(!confirm(`Demote ${u.name || u.email}?`)) return;
            try {
              // only allowed keys: isAdmin + updatedAt (serverTimestamp ensures proper Firestore timestamp type)
              await updateDoc(doc(db, 'users', u.uid), {
                isAdmin: false,
                updatedAt: serverTimestamp()
              });
              showToast('Demoted');
            } catch (err) {
              console.error('demote failed', err);
              // expose a bit more info for debugging (remove in prod)
              alert('Failed to demote — check rules and that you are super-admin. See console for details.');
            }
          };
          actionsTd.appendChild(demoteBtn);
        } else {
          const promoteBtn = document.createElement('button');
          promoteBtn.className = 'action-btn promote';
          promoteBtn.textContent = 'Promote';
          promoteBtn.onclick = async ()=> {
            if(!confirm(`Promote ${u.name || u.email} to admin?`)) return;
            try {
              await updateDoc(doc(db, 'users', u.uid), {
                isAdmin: true,
                updatedAt: serverTimestamp()
              });
              showToast('Promoted');
            } catch (err) {
              console.error('promote failed', err);
              alert('Failed to promote — check rules and that you are super-admin. See console for details.');
            }
          };
          actionsTd.appendChild(promoteBtn);
        }
      } else {
        const info = document.createElement('div'); info.className = 'small-muted'; info.textContent = 'Super-admin only';
        actionsTd.appendChild(info);
      }


      // Copy email (every row)
      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn copy';
      copyBtn.textContent = 'Copy email';
      copyBtn.onclick = async ()=> {
        const emailToCopy = u.email || '';
        if(!emailToCopy){ showToast('No email'); return; }
        const ok = await copyToClipboard(emailToCopy);
        if(ok) {
          // gentle highlight row
          const origBg = tr.style.background;
          tr.style.background = 'rgba(127,191,127,0.045)';
          setTimeout(()=> { tr.style.background = origBg || ''; }, 600);
        }
      };
      actionsTd.appendChild(copyBtn);

      // append all tds
      tr.appendChild(snTd);
      tr.appendChild(nameTd);
      tr.appendChild(emailTd);
      tr.appendChild(gradeTd);
      tr.appendChild(phoneTd);
      tr.appendChild(teamTd);
      tr.appendChild(roleTd);
      tr.appendChild(adminTd);
      tr.appendChild(actionsTd);

      usersTbody.appendChild(tr);
    }

    // wire up tooltip hover for all td[data-full]
    document.querySelectorAll('#usersTbody td[data-full]').forEach(td => {
      td.onmouseenter = (e) => {
        const full = td.getAttribute('data-full') || '';
        const isTruncated = td.scrollWidth > td.clientWidth + 6;
        if(!isTruncated && full.length < 36) {
          return;
        }
        const rect = td.getBoundingClientRect();
        showTooltip(full, rect);
      };
      td.onmouseleave = hideTooltip;
      td.onmousemove = (e) => {
        const rect = td.getBoundingClientRect();
        if(cellTooltip.classList.contains('show')){
          const left = Math.min(window.innerWidth - (cellTooltip.offsetWidth + 12), Math.max(12, rect.left));
          const top = Math.max(12, rect.top - cellTooltip.offsetHeight - 8);
          cellTooltip.style.left = `${left}px`;
          cellTooltip.style.top = `${top}px`;
        }
      };
    });
  }

  function escapeHtml(s){
    if(!s) return '';
    return String(s).replace(/[&<>"]/g, (c)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  // ---------- CSV download ----------
  downloadCsvBtn.addEventListener('click', () => {
    const q = (filterInput.value || '').trim().toLowerCase();
    const filtered = masterSortedUsers
      .slice()
      .filter(u => {
        if(participantsOnly && isUserAdminFlag(u)) return false;
        if(!q) return true;
        const hay = `${u.name||''} ${u.email||''} ${u.grade||''} ${lookupTeamForUser(u.uid).name||''}`.toLowerCase();
        return hay.includes(q);
      });

    if(filtered.length === 0){
      alert('No rows to download.');
      return;
    }

    const rows = [];
    rows.push(['S/N','Name','Email','Grade','Phone','Team','Role','Admin']);
    for(const u of filtered){
      const idx = uidToSerial[u.uid] || '';
      const team = lookupTeamForUser(u.uid);
      const role = team.id ? (team.isCaptain ? 'Captain' : 'Member') : '';
      const adminFlag = u.isSuperAdmin ? 'Super' : (u.isAdmin ? 'Admin' : '');
      rows.push([
        String(idx),
        u.name || u.displayName || '',
        u.email || '',
        u.grade || '',
        u.phone || '',
        team.name || '',
        role,
        adminFlag
      ]);
    }

    const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code-clash-users-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---------- Toggle wiring ----------
  function setParticipantsOnly(on){
    participantsOnly = !!on;
    participantsToggle.setAttribute('aria-checked', participantsOnly ? 'true' : 'false');
    if(participantsOnly) participantsToggle.classList.add('on'); else participantsToggle.classList.remove('on');
    renderTable();
  }
  participantsToggle.addEventListener('click', () => setParticipantsOnly(!participantsOnly));
  participantsToggle.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setParticipantsOnly(!participantsOnly); } });

  // ---------- UI wiring ----------
  refreshBtn.onclick = ()=> { renderTable(); };
  filterInput.oninput = ()=> renderTable();
  document.addEventListener('keydown', (e)=>{ if(document.activeElement && document.activeElement.tagName === 'INPUT') return; if(e.key === 'g' || e.key === 'G'){ filterInput.focus(); e.preventDefault(); } });

  usersTbody.innerHTML = '<tr><td colspan="9" class="small-muted">Waiting for auth…</td></tr>';
})();