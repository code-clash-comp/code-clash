(async function(){
  // ---------- CONFIG ----------
  const target = new Date('2025-10-18T11:00:00').getTime();
  const MAX_PARTICIPANTS = 32;

  const phrases = [
    'Are you ready to duel?',
    'Fastest correct solution wins.',
    '1v1 duels — team points on the line.',
    'Sharpen your loops. Debug your logic.'
  ];

  // ---------- TYPING ANIMATION ----------
  (function typing(){
    const el = document.getElementById('typingText');
    if(!el) return;
    let p = 0, ch = 0, deleting = false;
    const typingSpeed = 45, pauseAfter = 900;
    function tick(){
      const cur = phrases[p];
      if(!deleting){
        el.textContent = cur.slice(0, ch+1);
        ch++;
        if(ch === cur.length){
          deleting = true;
          setTimeout(tick, pauseAfter);
          return;
        }
      } else {
        el.textContent = cur.slice(0, ch-1);
        ch--;
        if(ch === 0){
          deleting = false;
          p = (p+1) % phrases.length;
        }
      }
      setTimeout(tick, deleting ? typingSpeed/1.2 : typingSpeed);
    }
    tick();
  })();

  // ---------- COUNTDOWN ----------
  (function countdown(){
    const dEl = document.getElementById('cdDays');
    const hEl = document.getElementById('cdHours');
    const mEl = document.getElementById('cdMins');
    const sEl = document.getElementById('cdSecs');
    if(!dEl || !hEl || !mEl || !sEl) return;
    function update(){
      const now = Date.now();
      let diff = target - now;
      if(diff <= 0){
        dEl.textContent = '00'; hEl.textContent='00'; mEl.textContent='00'; sEl.textContent='00';
        return;
      }
      const secs = Math.floor(diff / 1000);
      const days = Math.floor(secs / 86400);
      const hours = Math.floor((secs % 86400) / 3600);
      const mins = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      dEl.textContent = String(days).padStart(2,'0');
      hEl.textContent = String(hours).padStart(2,'0');
      mEl.textContent = String(mins).padStart(2,'0');
      sEl.textContent = String(s).padStart(2,'0');
    }
    update();
    setInterval(update, 1000);
  })();

  // ---------- DOM refs ----------
  const navLogin = document.getElementById('navLogin');
  const navRegister = document.getElementById('navRegister');
  const navDashboard = document.getElementById('navDashboard'); // admin button (hidden by default)
  const bigReg = document.getElementById('bigRegister');
  const welcomeMsg = document.getElementById('welcomeMsg');

  const participantsEl = document.getElementById('participantsCount');
  const liveRegEl = document.getElementById('liveReg');
  const slotsLeftEl = document.getElementById('slotsLeft');
  const progressFill = document.getElementById('progressFill');

  // preserve expected classes so CSS styling persists
  if(navRegister && !navRegister.classList.contains('nav-actions-register')) navRegister.classList.add('nav-actions-register');
  if(navLogin && !navLogin.classList.contains('nav-actions-login')) navLogin.classList.add('nav-actions-login');

  // ---------- helpers ----------
  function doPulse(el){ if(!el) return; el.classList.add('pulse'); setTimeout(()=> el.classList.remove('pulse'), 420); }
  function updateCounterUI(count){
    if(participantsEl) participantsEl.textContent = String(MAX_PARTICIPANTS);
    if(liveRegEl) liveRegEl.textContent = String(count);
    const slotsLeft = Math.max(0, MAX_PARTICIPANTS - count);
    if(slotsLeftEl) slotsLeftEl.textContent = String(slotsLeft);
    const pct = Math.min(100, Math.round((count / MAX_PARTICIPANTS) * 100));
    if(progressFill) progressFill.style.width = pct + '%';
  }

  // ---------- Local fallback counter ----------
  function startLocalDemoCounter(){
    function getStoredCount(){ const n = parseInt(localStorage.getItem('cc_reg_count') || '0', 10); return Number.isNaN(n) ? 0 : n; }
    function setStoredCount(v){ localStorage.setItem('cc_reg_count', String(v)); }

    updateCounterUI(getStoredCount());

    // register button behavior increments once per session then navigates
    if(navRegister) navRegister.onclick = (e)=>{ doPulse(navRegister); if(sessionStorage.getItem('cc_registered')){ window.location.href='register.html'; return; } let cnt=getStoredCount(); if(cnt>=MAX_PARTICIPANTS) return; cnt++; setStoredCount(cnt); sessionStorage.setItem('cc_registered','1'); updateCounterUI(cnt); window.location.href='register.html'; };
    if(bigReg) bigReg.onclick = (e)=>{ doPulse(bigReg); if(sessionStorage.getItem('cc_registered')){ window.location.href='register.html'; return; } let cnt=getStoredCount(); if(cnt>=MAX_PARTICIPANTS) return; cnt++; setStoredCount(cnt); sessionStorage.setItem('cc_registered','1'); updateCounterUI(cnt); window.location.href='register.html'; };
    if(navLogin) navLogin.onclick = (e)=>{ doPulse(navLogin); window.location.href='login.html'; };
  }

  // ---------- FIREBASE (auth + live counter + admin button) ----------
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDpKPIqiWrGpvE3xL6TBRQEEfrpZGIfedM",
    authDomain: "code-clash-2025.firebaseapp.com",
    projectId: "code-clash-2025",
    storageBucket: "code-clash-2025.firebasestorage.app",
    messagingSenderId: "13717806434",
    appId: "1:13717806434:web:8aa7799e7f87ebbdf0603b",
    measurementId: "G-0BMTHMYMEL"
  };

  async function startFirebase(){
    try {
      const [{ initializeApp }, { getFirestore, collection, onSnapshot, doc, getDoc }, { getAuth, onAuthStateChanged, signOut }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js'),
        import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js')
      ]);

      const app = initializeApp(FIREBASE_CONFIG);
      const db = getFirestore(app);
      const auth = getAuth(app);

      // show/hide admin button helper
      async function resolveAdminForUser(user){
        if(!user) return false;
        // preferred: custom claims
        try {
          const idRes = await user.getIdTokenResult();
          const claims = idRes.claims || {};
          if(claims.admin || claims.isAdmin || claims.superAdmin || claims.isSuperAdmin) return true;
        } catch(e){
          console.warn('getIdTokenResult failed when checking claims:', e);
        }
        // fallback: users/{uid} doc fields
        try {
          const udoc = await getDoc(doc(db, 'users', user.uid));
          const data = udoc.exists() ? udoc.data() : {};
          if(data.isAdmin || data.isSuperAdmin) return true;
        } catch(e){
          console.warn('fallback user doc admin check failed:', e);
        }
        return false;
      }

      // live participant counter (exclude admins/superAdmin)
      onSnapshot(collection(db, 'users'), (snap) => {
        try {
          const docs = snap.docs.map(d => ({ uid: d.id, ...(d.data()||{}) }));
          const nonAdminCount = docs.filter(u => !u.isAdmin && !u.isSuperAdmin).length;
          updateCounterUI(nonAdminCount);
        } catch (err) {
          console.error('Error counting participants (filtered):', err);
          updateCounterUI(snap.size);
        }
      }, (err) => {
        console.error('Firestore snapshot error (counter):', err);
      });

      // ---- Optimistic welcome placeholder to avoid flicker ----
      if(welcomeMsg){
        welcomeMsg.textContent = 'Welcome,';
        welcomeMsg.style.display = 'block';
      }

      // onAuthStateChanged: update UI + admin button visibility
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          // Force-refresh ID token to verify validity
          try {
            await user.getIdToken(true);
          } catch (tokenErr) {
            console.warn('Token refresh failed; signing out to clear stale session:', tokenErr);
            try { await signOut(auth); } catch(e){ console.error('signOut failed', e); }
            return;
          }

          // update basic auth UI
          if(navRegister){
            navRegister.textContent = 'Dashboard';
            navRegister.onclick = ()=>{ doPulse(navRegister); window.location.href = 'dashboard.html'; };
          }
          if(navLogin){
            navLogin.textContent = 'Logout';
            navLogin.onclick = async ()=> {
              doPulse(navLogin);
              const confirmed = confirm('Are you sure you want to log out?');
              if(!confirmed) return;
              try { await signOut(auth); } catch(e){ console.error(e); }
            };
          }
          if(bigReg){
            bigReg.textContent = 'Go to Dashboard';
            bigReg.onclick = ()=>{ doPulse(bigReg); window.location.href = 'dashboard.html'; };
          }

          // welcome name
          if(welcomeMsg){
            const name = user.displayName || user.email || 'Participant';
            welcomeMsg.textContent = `Welcome, ${name}`;
            welcomeMsg.style.display = 'block';
          }

          // check admin claims / doc, show admin button if allowed
          const isAdminUser = await resolveAdminForUser(user);
          if(isAdminUser && navDashboard){
            navDashboard.style.display = 'inline-block';
            navDashboard.onclick = ()=> { doPulse(navDashboard); window.location.href = 'admin.html'; };
          } else if(navDashboard) {
            navDashboard.style.display = 'none';
            navDashboard.onclick = null;
          }

          // rebuild mobile menu to reflect current nav visibility (important)
          try { document.querySelector('.hamburger').style.display && document.querySelector('.hamburger').style.display !== 'none' ? (()=>{/*noop*/})() : null; } catch(e){}
          // dispatch a small custom event to notify mobile menu script (or rely on mutation observer which also listens attribute changes)
          const ev = new Event('nav-updated');
          document.dispatchEvent(ev);

        } else {
          // not logged in: revert to logged-out UI
          if(navRegister){
            navRegister.textContent = 'Register';
            navRegister.onclick = ()=>{ doPulse(navRegister); window.location.href = 'register.html'; };
          }
          if(navLogin){
            navLogin.textContent = 'Login';
            navLogin.onclick = ()=>{ doPulse(navLogin); window.location.href = 'login.html'; };
          }
          if(bigReg){
            bigReg.textContent = 'Register for PyCode Clash 2025';
            bigReg.onclick = ()=>{ doPulse(bigReg); window.location.href = 'register.html'; };
          }
          if(welcomeMsg){
            welcomeMsg.textContent = '';
            welcomeMsg.style.display = 'none';
          }
          if(navDashboard) navDashboard.style.display = 'none';
          // notify menu
          document.dispatchEvent(new Event('nav-updated'));
        }
      });

      // also listen for the custom event to rebuild mobile menu (ensures immediate reflection)
      document.addEventListener('nav-updated', ()=>{
        // only rebuild when mobile menu exists
        try {
          if(window.innerWidth <= 760) {
            // call the mobile menu builder function by dispatching a click to hamburger (open->close pattern would rebuild via observer)
            // but we can simply find the function's buildMobileMenu via the global scope — not available — so we'll simulate by toggling a trivial mutation:
            const navActions = document.querySelector('.nav-actions');
            if(navActions){
              // mutate a temporary attribute to trigger MutationObserver used by mobile menu
              navActions.setAttribute('data-menu-refresh', Date.now().toString());
              setTimeout(()=> navActions.removeAttribute('data-menu-refresh'), 50);
            }
          }
        } catch(e){ console.warn('nav-updated handler error', e); }
      });

    } catch (err) {
      console.warn('Firebase initialization failed — falling back to local demo behavior:', err);
      // fallback to local demo if Firebase cannot start
      startLocalDemoCounter();
      // basic nav behavior when Firebase unavailable
      if(navRegister) navRegister.onclick = ()=>{ doPulse(navRegister); window.location.href = 'register.html'; };
      if(navLogin) navLogin.onclick = ()=>{ doPulse(navLogin); window.location.href = 'login.html'; };
      if(bigReg) bigReg.onclick = ()=>{ doPulse(bigReg); window.location.href = 'register.html'; };
      if(navDashboard) navDashboard.style.display = 'none';
    }
  }

  // ---------- start ----------
  await startFirebase();

})();