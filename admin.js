(async function(){
  // ========== CONFIG (same as yours) ==========
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDpKPIqiWrGpvE3xL6TBRQEEfrpZGIfedM",
    authDomain: "code-clash-2025.firebaseapp.com",
    projectId: "code-clash-2025",
    storageBucket: "code-clash-2025.appspot.com",
    messagingSenderId: "13717806434",
    appId: "1:13717806434:web:8aa7799e7f87ebbdf0603b",
    measurementId: "G-0BMTHMYMEL"
  };

  // ========== DOM refs ==========
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

  // Announcement DOM
  const toggleCreateAnn = document.getElementById('toggleCreateAnn');
  const createAnnSection = document.getElementById('createAnnSection');
  const announceForm = document.getElementById('announceForm');
  const annTitle = document.getElementById('annTitle');
  const annBody = document.getElementById('annBody');
  const annPublished = document.getElementById('annPublished');
  const annPinned = document.getElementById('annPinned');
  const pinControl = document.getElementById('pinControl');
  const cancelAnnBtn = document.getElementById('cancelAnnBtn');

  const announcementsList = document.getElementById('announcementsList');
  const pinnedTitle = document.getElementById('pinnedTitle');
  const pinnedExcerpt = document.getElementById('pinnedExcerpt');

  // Modal
  const announcementModal = document.getElementById('announcementModal');
  const modalAnnTitle = document.getElementById('modalAnnTitle');
  const modalAnnMeta = document.getElementById('modalAnnMeta');
  const modalAnnBody = document.getElementById('modalAnnBody');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalEditBtn = document.getElementById('modalEditBtn');
  const modalEditArea = document.getElementById('modalEditArea');
  const modalEditTitle = document.getElementById('modalEditTitle');
  const modalEditBody = document.getElementById('modalEditBody');
  const modalEditPublished = document.getElementById('modalEditPublished');
  const modalEditPinned = document.getElementById('modalEditPinned');
  const modalSaveEdit = document.getElementById('modalSaveEdit');
  const modalDelete = document.getElementById('modalDelete');

  navDashboard.onclick = ()=> window.location.href = 'dashboard.html';

  // ========== Firebase imports ==========
  const [
    { initializeApp },
    { getFirestore, collection, doc, onSnapshot, updateDoc, getDoc, addDoc, serverTimestamp, orderBy, query, deleteDoc },
    { getAuth, onAuthStateChanged, signOut }
  ] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js')
  ]).catch(err => { console.error('firebase import failed', err); throw err; });

  const app = initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);
  const auth = getAuth(app);

  // ========== state ==========
  let currentUser = null;
  let currentUserClaims = {};
  let isSuperAdmin = false;
  let isAdmin = false;
  let users = [];
  let teams = [];
  let participantsOnly = false;

  // announcements state
  let announcements = []; // list of announcement docs { id, ...data }
  let pinnedAnnouncement = null;

  // masterSort state
  let masterSortedUsers = [];
  let uidToSerial = {};

  // ========== UTIL helpers ==========
  function sanitize(s){ return (s === undefined || s === null) ? '-' : String(s); }
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"]/g, (c)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function isUserAdminFlag(u){ return !!(u.isAdmin || u.isSuperAdmin); }

  function showToast(text='Copied'){
    if(!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('show');
    toastEl.setAttribute('aria-hidden','false');
    setTimeout(()=> { toastEl.classList.remove('show'); toastEl.setAttribute('aria-hidden','true'); }, 1400);
  }

  async function copyToClipboard(s){
    try {
      if(navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(s);
      } else {
        const ta = document.createElement('textarea');
        ta.value = s; ta.style.position='fixed'; ta.style.left='-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      showToast('Email copied');
      return true;
    } catch(e){
      showToast('Copy failed');
      return false;
    }
  }

  // tooltip helpers
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
    cellTooltip.classList.remove('show'); cellTooltip.setAttribute('aria-hidden','true');
    if(tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(()=> cellTooltip.textContent='', 120);
  }

  // ========== AUTH GUARD ==========
  function adminDenied(){ alert('Admin access required. Redirecting to home.'); window.location.href = '/code-clash/'; }

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if(!user) return adminDenied();

    // read custom claims
    try {
      const idT = await user.getIdTokenResult();
      currentUserClaims = idT.claims || {};
      isAdmin = !!(currentUserClaims.admin || currentUserClaims.isAdmin);
      isSuperAdmin = !!(currentUserClaims.superAdmin || currentUserClaims.isSuperAdmin);
    } catch(e){
      console.warn('getIdTokenResult failed', e);
    }

    // fallback to users doc if claims missing
    if(!isAdmin && !isSuperAdmin){
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
        isAdmin = !!data.isAdmin;
        isSuperAdmin = !!data.isSuperAdmin;
      } catch(e){ console.warn('fallback user doc check failed', e); }
    }

    if(!isAdmin && !isSuperAdmin) return adminDenied();

    // update nav
    if(navLogin){
      navLogin.textContent = 'Logout';
      navLogin.onclick = async ()=> {
        if(!confirm('Logout?')) return;
        try { await signOut(auth); } catch(e){ console.error(e); }
        window.location.href = '/';
      };
    }

    // show/hide pin control (super admin only)
    if(pinControl) pinControl.style.display = isSuperAdmin ? '' : 'none';

    // start DS listeners
    startListeners();
    startAnnouncementsListener();
    maybeRequestNotifPermission();
  });

  // ========== LISTENERS: users + teams ==========
  function startListeners(){
    onSnapshot(collection(db, 'teams'), (snap) => {
      teams = []; snap.forEach(d => teams.push({ id:d.id, ...d.data() }));
      rebuildMasterSort(); renderTable();
    }, err => console.error('teams listener', err));

    onSnapshot(collection(db, 'users'), (snap) => {
      users = []; snap.forEach(d => users.push({ uid:d.id, ...d.data() }));
      rebuildMasterSort(); renderTable();
    }, err => console.error('users listener', err));
  }

  // ========== ANNOUNCEMENTS: listener + UI ==========
  function startAnnouncementsListener(){
    const q = query(collection(db, 'announcements'), orderBy('createdAt','desc'));
    onSnapshot(q, (snap) => {
      announcements = [];
      snap.forEach(d => announcements.push({ id: d.id, ...(d.data()||{}) }));
      pinnedAnnouncement = announcements.find(a => !!a.pinned && !!a.published) || null;
      renderAnnouncementsUI(snap);
    }, err => {
      console.error('announcements listener failed', err);
    });
  }

  function renderAnnouncementsUI(snapshot){
    if(pinnedAnnouncement){
      pinnedTitle.textContent = pinnedAnnouncement.title || '(no title)';
      pinnedExcerpt.textContent = (pinnedAnnouncement.body || '').slice(0,220) + ((pinnedAnnouncement.body||'').length>220 ? '…' : '');
    } else {
      pinnedTitle.textContent = '';
      pinnedExcerpt.textContent = '';
    }

    const items = announcements.slice();
    announcementsList.innerHTML = '';
    for(const ann of items){
      const el = document.createElement('div');
      el.className = 'announce-item' + ((Date.now() - (ann.createdAt?.toDate ? ann.createdAt.toDate().getTime() : 0) < 10000) ? ' new' : '');
      const left = document.createElement('div');
      left.style.flex = '1';
      left.style.minWidth = '0';
      const title = document.createElement('h4'); title.className = 'headline'; title.textContent = ann.title || '(untitled)';
      const meta = document.createElement('div'); meta.className = 'meta';
      const createdAtText = ann.createdAt?.toDate ? (new Date(ann.createdAt.toDate()).toLocaleString()) : '';
      meta.innerHTML = `${createdAtText} • ${ann.published ? 'Published' : 'Draft'} ${ann.pinned ? '• Pinned' : ''}`;
      const excerpt = document.createElement('div'); excerpt.className = 'announce-sub'; excerpt.style.marginTop='6px';
      excerpt.textContent = (ann.body || '').slice(0,180) + ((ann.body||'').length>180 ? '…' : '');
      left.appendChild(title); left.appendChild(meta); left.appendChild(excerpt);

      const right = document.createElement('div');
      right.style.display='flex'; right.style.gap='8px'; right.style.alignItems='center';
      const viewBtn = document.createElement('button'); viewBtn.className='btn small-btn'; viewBtn.textContent='Open';
      viewBtn.onclick = ()=> openAnnouncementModal(ann);
      right.appendChild(viewBtn);

      if(isAdmin || isSuperAdmin){
        const pubBtn = document.createElement('button');
        pubBtn.className = 'btn small-btn';
        pubBtn.textContent = ann.published ? 'Unpublish' : 'Publish';
        pubBtn.onclick = async ()=>{
          try {
            await updateDoc(doc(db, 'announcements', ann.id), { published: !ann.published, updatedAt: serverTimestamp() });
            showToast(ann.published ? 'Unpublished' : 'Published');
          } catch(e){ console.error('publish toggle failed', e); alert('Failed to update publish state (check rules).'); }
        };
        right.appendChild(pubBtn);

        if(isSuperAdmin){
          const pinBtn = document.createElement('button');
          pinBtn.className = 'btn small-btn';
          pinBtn.textContent = ann.pinned ? 'Unpin' : 'Pin';
          pinBtn.onclick = async ()=>{
            try {
              if(!ann.pinned){
                const others = announcements.filter(a => a.pinned && a.id !== ann.id);
                const updates = others.map(o => updateDoc(doc(db, 'announcements', o.id), { pinned: false, updatedAt: serverTimestamp() }).catch(e=>console.warn('unpin other failed',e)));
                await Promise.all(updates);
              }
              await updateDoc(doc(db, 'announcements', ann.id), { pinned: !ann.pinned, updatedAt: serverTimestamp() });
              showToast(ann.pinned ? 'Unpinned' : 'Pinned');
            } catch(e){ console.error('pin toggle failed', e); alert('Failed to update pin.'); }
          };
          right.appendChild(pinBtn);
        }

        const editBtn = document.createElement('button'); editBtn.className='btn small-btn'; editBtn.textContent='Edit';
        editBtn.onclick = ()=> openAnnouncementModal(ann, { startInEdit: true });
        right.appendChild(editBtn);
      }

      el.appendChild(left); el.appendChild(right);
      announcementsList.appendChild(el);
    }
  }

  // ========== Modal functions ==========
  let modalCurrentAnn = null;
  function openAnnouncementModal(ann, opts={ startInEdit:false }){
    modalCurrentAnn = ann;
    modalAnnTitle.textContent = ann.title || '(untitled)';
    modalAnnBody.textContent = ann.body || '';
    const created = ann.createdAt?.toDate ? new Date(ann.createdAt.toDate()).toLocaleString() : '';
    modalAnnMeta.textContent = `${created} • ${ann.published ? 'Published' : 'Draft'} ${ann.pinned ? '• Pinned' : ''}`;
    modalEditTitle.value = ann.title || '';
    modalEditBody.value = ann.body || '';
    modalEditPublished.checked = !!ann.published;
    modalEditPinned.checked = !!ann.pinned;
    modalEditArea.style.display = opts.startInEdit ? '' : 'none';

    announcementModal.classList.add('open');
    announcementModal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
  }
  function closeAnnouncementModal(){
    announcementModal.classList.remove('open');
    announcementModal.setAttribute('aria-hidden','true');
    modalEditArea.style.display = 'none';
    modalCurrentAnn = null;
    document.body.style.overflow = '';
  }

  modalCloseBtn.onclick = closeAnnouncementModal;
  modalEditBtn.onclick = ()=> { modalEditArea.style.display = modalEditArea.style.display === 'none' ? '' : 'none'; };

  modalSaveEdit.onclick = async ()=>{
    if(!modalCurrentAnn) return;
    try {
      await updateDoc(doc(db, 'announcements', modalCurrentAnn.id), {
        title: modalEditTitle.value || '(untitled)',
        body: modalEditBody.value || '',
        published: !!modalEditPublished.checked,
        pinned: !!modalEditPinned.checked,
        updatedAt: serverTimestamp()
      });
      closeAnnouncementModal();
      showToast('Saved');
    } catch(e){ console.error('modal save failed', e); alert('Save failed (check rules).'); }
  };

  modalDelete.onclick = async ()=>{
    if(!modalCurrentAnn) return;
    if(!confirm('Delete this announcement?')) return;
    try {
      await deleteDoc(doc(db, 'announcements', modalCurrentAnn.id));
      closeAnnouncementModal();
      showToast('Deleted');
    } catch(e){ console.error('delete ann failed', e); alert('Delete failed (check rules).'); }
  };

  // ========== Create announcement form handling ==========
  toggleCreateAnn.addEventListener('click', ()=> {
    createAnnSection.style.display = createAnnSection.style.display === 'none' ? '' : 'none';
    window.scrollTo({ top: createAnnSection.offsetTop - 40, behavior: 'smooth' });
  });

  cancelAnnBtn.onclick = (e)=> { e.preventDefault(); createAnnSection.style.display='none'; };

  announceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = (annTitle.value || '').trim();
    const body = (annBody.value || '').trim();
    const published = !!annPublished.checked;
    const pinned = !!annPinned.checked;

    if(!title || !body){
      alert('Please provide a title and content for the announcement.');
      return;
    }

    try {
      if(pinned){
        const others = announcements.filter(a => a.pinned);
        const unpinPromises = others.map(o => updateDoc(doc(db, 'announcements', o.id), { pinned: false, updatedAt: serverTimestamp() }).catch(e=>console.warn('unpin other failed', e)));
        await Promise.all(unpinPromises);
      }

      await addDoc(collection(db, 'announcements'), {
        title,
        body,
        published,
        pinned: pinned && isSuperAdmin ? true : false,
        authorUid: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      annTitle.value = ''; annBody.value = ''; annPublished.checked = true; annPinned.checked = false;
      createAnnSection.style.display = 'none';
      showToast('Announcement created');

      if(Notification && Notification.permission === 'granted'){
        try { new Notification(title, { body: body.slice(0,220), tag: 'codeclash-ann', renotify: true }); } catch(e){ console.warn('show Notification failed', e); }
      }
    } catch(e){
      console.error('create announcement failed', e);
      alert('Failed to create announcement (check rules).');
    }
  });

  // ========== Announce notif permission ==========
  function maybeRequestNotifPermission(){
    if(!('Notification' in window)) return;
    if(localStorage.getItem('cc_notify_prompt')) return;
    setTimeout(async ()=>{
      try {
        const perm = Notification.permission;
        if(perm === 'default'){ await Notification.requestPermission(); }
      } catch(e){ console.warn('Notification permission request failed', e); }
      localStorage.setItem('cc_notify_prompt','1');
    }, 1400);
  }

  // ========== Render users table (keeps your previous logic) ==========
  function masterCompare(a, b){
    const aSuper = !!a.isSuperAdmin; const bSuper = !!b.isSuperAdmin;
    if(aSuper !== bSuper) return aSuper ? -1 : 1;
    const aAdmin = !!a.isAdmin; const bAdmin = !!b.isAdmin;
    if(aAdmin !== bAdmin) return aAdmin ? -1 : 1;
    const an = (a.name || a.displayName || a.email || a.uid || '').toLowerCase();
    const bn = (b.name || b.displayName || b.email || b.uid || '').toLowerCase();
    if(an < bn) return -1; if(an > bn) return 1; return 0;
  }

  function rebuildMasterSort(){
    masterSortedUsers = users.slice().sort(masterCompare);
    uidToSerial = {};
    for(let i=0;i<masterSortedUsers.length;i++){
      uidToSerial[masterSortedUsers[i].uid] = i + 1;
    }
  }

  function lookupTeamForUser(uid){
    const t = teams.find(team => (team.members || []).includes(uid));
    if(!t) return { name: '-', id: null, isCaptain: false };
    return { name: t.name || 'Unnamed', id: t.id, isCaptain: t.captainUid === uid };
  }

  function renderTable(){
    if(!masterSortedUsers || masterSortedUsers.length === 0){
      usersTbody.innerHTML = `<tr><td colspan="9" class="small-muted">No users found.</td></tr>`;
      statParticipants.textContent = '0'; statAdmins.textContent='0'; statTotal.textContent='0';
      return;
    }

    const q = (filterInput.value || '').trim().toLowerCase();

    const filtered = masterSortedUsers.filter(u => {
      if(participantsOnly && isUserAdminFlag(u)) return false;
      if(!q) return true;
      const hay = `${u.name||''} ${u.email||''} ${u.grade||''} ${lookupTeamForUser(u.uid).name||''}`.toLowerCase();
      return hay.includes(q);
    });

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

      const snTd = document.createElement('td'); snTd.textContent = String(uidToSerial[u.uid] || '-'); snTd.setAttribute('data-full', snTd.textContent);

      const nameTd = document.createElement('td'); const nameVal = sanitize(u.name || u.displayName || '-'); nameTd.textContent = nameVal; nameTd.setAttribute('data-full', nameVal);

      const emailTd = document.createElement('td'); const emailVal = sanitize(u.email || '-'); emailTd.textContent = emailVal; emailTd.setAttribute('data-full', emailVal);

      const gradeTd = document.createElement('td'); const gradeVal = sanitize(u.grade || '-'); gradeTd.textContent = gradeVal; gradeTd.setAttribute('data-full', gradeVal);

      const phoneTd = document.createElement('td'); const phoneVal = sanitize(u.phone || '-'); phoneTd.textContent = phoneVal; phoneTd.setAttribute('data-full', phoneVal);

      const teamTd = document.createElement('td');
      if(team.id){ teamTd.innerHTML = `${escapeHtml(team.name)} ${team.isCaptain ? '<span class="small-muted"> (captain)</span>' : ''}`; teamTd.setAttribute('data-full', `${team.name}${team.isCaptain ? ' (captain)' : ''}`); }
      else { teamTd.textContent='-'; teamTd.setAttribute('data-full','-'); }

      const roleTd = document.createElement('td');
      if(team.id) roleTd.innerHTML = team.isCaptain ? '<span class="role-badge badge-admin">Captain</span>' : '<span class="role-badge">Member</span>';
      else roleTd.textContent='-';
      roleTd.setAttribute('data-full', team.id ? (team.isCaptain ? 'Captain' : 'Member') : '-');

      const adminTd = document.createElement('td');
      if(u.isSuperAdmin){ adminTd.innerHTML = '<span class="role-badge badge-super">Super</span>'; adminTd.setAttribute('data-full','Super-admin'); }
      else if(u.isAdmin){ adminTd.innerHTML = '<span class="role-badge badge-admin">Admin</span>'; adminTd.setAttribute('data-full','Admin'); }
      else { adminTd.textContent='-'; adminTd.setAttribute('data-full','-'); }

      const actionsTd = document.createElement('td'); actionsTd.style.textAlign='right'; actionsTd.className='table-actions';

      // promote/demote
      if(isSuperAdmin){
        if(u.isSuperAdmin){
          const dash = document.createElement('div'); dash.className='small-muted'; dash.textContent='—'; actionsTd.appendChild(dash);
        } else if(u.isAdmin){
          const demoteBtn = document.createElement('button'); demoteBtn.className='action-btn demote'; demoteBtn.textContent='Demote';
          demoteBtn.onclick = async ()=> {
            if(!confirm(`Demote ${u.name || u.email}?`)) return;
            try {
              await updateDoc(doc(db, 'users', u.uid), { isAdmin:false, updatedAt: serverTimestamp() });
              showToast('Demoted');
            } catch(e){ console.error(e); alert('Failed to demote (check rules).'); }
          };
          actionsTd.appendChild(demoteBtn);
        } else {
          const promoteBtn = document.createElement('button'); promoteBtn.className='action-btn promote'; promoteBtn.textContent='Promote';
          promoteBtn.onclick = async ()=> {
            if(!confirm(`Promote ${u.name || u.email} to admin?`)) return;
            try {
              await updateDoc(doc(db, 'users', u.uid), { isAdmin:true, updatedAt: serverTimestamp() });
              showToast('Promoted');
            } catch(e){ console.error(e); alert('Failed to promote (check rules).'); }
          };
          actionsTd.appendChild(promoteBtn);
        }
      } else {
        const info = document.createElement('div'); info.className='small-muted'; info.textContent='Super-admin only'; actionsTd.appendChild(info);
      }

      // copy email
      const copyBtn = document.createElement('button'); copyBtn.className='action-btn copy'; copyBtn.textContent='Copy email';
      copyBtn.onclick = async ()=> {
        const emailToCopy = u.email || '';
        if(!emailToCopy){ showToast('No email'); return; }
        const ok = await copyToClipboard(emailToCopy);
        if(ok){
          const orig = tr.style.background;
          tr.style.background = 'rgba(127,191,127,0.045)';
          setTimeout(()=> tr.style.background = orig || '', 600);
        }
      };
      actionsTd.appendChild(copyBtn);

      tr.appendChild(snTd); tr.appendChild(nameTd); tr.appendChild(emailTd); tr.appendChild(gradeTd);
      tr.appendChild(phoneTd); tr.appendChild(teamTd); tr.appendChild(roleTd); tr.appendChild(adminTd); tr.appendChild(actionsTd);
      usersTbody.appendChild(tr);
    }

    // tooltip wiring
    document.querySelectorAll('#usersTbody td[data-full]').forEach(td => {
      td.onmouseenter = ()=> {
        const full = td.getAttribute('data-full') || '';
        const isTruncated = td.scrollWidth > td.clientWidth + 6;
        if(!isTruncated && full.length < 36) return;
        const rect = td.getBoundingClientRect(); showTooltip(full, rect);
      };
      td.onmouseleave = hideTooltip;
      td.onmousemove = (e) => {
        const rect = td.getBoundingClientRect();
        if(cellTooltip.classList.contains('show')){
          const left = Math.min(window.innerWidth - (cellTooltip.offsetWidth + 12), Math.max(12, rect.left));
          const top = Math.max(12, rect.top - cellTooltip.offsetHeight - 8);
          cellTooltip.style.left = `${left}px`; cellTooltip.style.top = `${top}px`;
        }
      };
    });
  }

  // ========== CSV download ==========
  downloadCsvBtn.addEventListener('click', () => {
    const q = (filterInput.value || '').trim().toLowerCase();
    const filtered = masterSortedUsers.slice().filter(u => {
      if(participantsOnly && isUserAdminFlag(u)) return false;
      if(!q) return true;
      const hay = `${u.name||''} ${u.email||''} ${u.grade||''} ${lookupTeamForUser(u.uid).name||''}`.toLowerCase();
      return hay.includes(q);
    });

    if(filtered.length === 0){ alert('No rows to download.'); return; }

    const rows = [];
    rows.push(['S/N','Name','Email','Grade','Phone','Team','Role','Admin']);
    for(const u of filtered){
      const idx = uidToSerial[u.uid] || '';
      const team = lookupTeamForUser(u.uid);
      const role = team.id ? (team.isCaptain ? 'Captain' : 'Member') : '';
      const adminFlag = u.isSuperAdmin ? 'Super' : (u.isAdmin ? 'Admin' : '');
      rows.push([String(idx), u.name || u.displayName || '', u.email || '', u.grade || '', u.phone || '', team.name || '', role, adminFlag ]);
    }

    const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
    a.download = `code-clash-users-${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  // ========== Toggle wiring ==========
  function setParticipantsOnly(on){ participantsOnly = !!on; participantsToggle.setAttribute('aria-checked', participantsOnly ? 'true' : 'false'); if(participantsOnly) participantsToggle.classList.add('on'); else participantsToggle.classList.remove('on'); renderTable(); }
  participantsToggle.addEventListener('click', () => setParticipantsOnly(!participantsOnly));
  participantsToggle.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setParticipantsOnly(!participantsOnly); } });

  // ========== UI wiring ==========
  refreshBtn.onclick = ()=> { renderTable(); };

  // Fix for issue #1:
  // Make 'g' shortcut ignore when user is typing in any input/textarea/contenteditable/select.
  document.addEventListener('keydown', (e)=>{
    const ae = document.activeElement;
    const tag = ae && ae.tagName;
    if(ae && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable)) return;
    if(e.key === 'g' || e.key === 'G'){
      if(filterInput){
        filterInput.focus();
        e.preventDefault();
      }
    }
  });

  // attach filter input handler after we define global behavior
  filterInput.oninput = ()=> renderTable();

  // usersTbody waiting message
  usersTbody.innerHTML = '<tr><td colspan="9" class="small-muted">Waiting for auth…</td></tr>';

})();