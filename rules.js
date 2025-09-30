(async function(){
  // ---------- CONFIG ----------
  const target = new Date('2025-10-18T11:00:00').getTime();
  const MAX_PARTICIPANTS = 32;

  const phrases = [
    "Python-only challenges — think and code fast.", 
    "Fair play. Fast solutions. Fun competition.", 
    "Brush up on algorithms and I/O handling."
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
        dEl.textContent='00'; hEl.textContent='00'; mEl.textContent='00'; sEl.textContent='00';
        return;
      }
      const secs = Math.floor(diff/1000);
      const days = Math.floor(secs/86400);
      const hours = Math.floor((secs%86400)/3600);
      const mins = Math.floor((secs%3600)/60);
      const s = secs%60;
      dEl.textContent = String(days).padStart(2,'0');
      hEl.textContent = String(hours).padStart(2,'0');
      mEl.textContent = String(mins).padStart(2,'0');
      sEl.textContent = String(s).padStart(2,'0');
    }
    update();
    setInterval(update,1000);
  })();

  // ---------- DOM refs ----------
  const navLogin = document.getElementById('navLogin');
  const navRegister = document.getElementById('navRegister');
  const navDashboard = document.getElementById('navDashboard'); 
  const bigReg = document.getElementById('bigRegister');
  const welcomeMsg = document.getElementById('welcomeMsg');
  const participantsEl = document.getElementById('participantsCount');
  const liveRegEl = document.getElementById('liveReg');
  const slotsLeftEl = document.getElementById('slotsLeft');
  const progressFill = document.getElementById('progressFill');

  // ---------- helpers ----------
  function doPulse(el){ if(!el) return; el.classList.add('pulse'); setTimeout(()=> el.classList.remove('pulse'), 420); }
  function updateCounterUI(count){
    if(participantsEl) participantsEl.textContent = String(MAX_PARTICIPANTS);
    if(liveRegEl) liveRegEl.textContent = String(count);
    const slotsLeft = Math.max(0, MAX_PARTICIPANTS - count);
    if(slotsLeftEl) slotsLeftEl.textContent = String(slotsLeft);
    const pct = Math.min(100, Math.round((count/MAX_PARTICIPANTS)*100));
    if(progressFill) progressFill.style.width = pct+'%';
  }

  // ---------- Local fallback ----------
  function startLocalDemoCounter(){
    function getStoredCount(){ return parseInt(localStorage.getItem('cc_reg_count')||'0',10)||0; }
    function setStoredCount(v){ localStorage.setItem('cc_reg_count', String(v)); }
    updateCounterUI(getStoredCount());

    const registerHandler = ()=>{
      doPulse(navRegister||bigReg);
      if(sessionStorage.getItem('cc_registered')){ window.location.href='register.html'; return; }
      let cnt = getStoredCount();
      if(cnt>=MAX_PARTICIPANTS) return;
      cnt++; setStoredCount(cnt); sessionStorage.setItem('cc_registered','1'); updateCounterUI(cnt);
      window.location.href='register.html';
    };
    if(navRegister) navRegister.onclick = registerHandler;
    if(bigReg) bigReg.onclick = registerHandler;
    if(navLogin) navLogin.onclick = ()=>{ doPulse(navLogin); window.location.href='login.html'; };
  }

  // ---------- FIREBASE ----------
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
    try{
      const [{ initializeApp }, { getFirestore, collection, onSnapshot, doc, getDoc }, { getAuth, onAuthStateChanged, signOut }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js'),
        import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js')
      ]);

      const app = initializeApp(FIREBASE_CONFIG);
      const db = getFirestore(app);
      const auth = getAuth(app);

      async function resolveAdminForUser(user){
        if(!user) return false;
        try{
          const tokenRes = await user.getIdTokenResult(true);
          const claims = tokenRes.claims||{};
          if(claims.admin||claims.isAdmin||claims.superAdmin||claims.isSuperAdmin) return true;
        } catch(e){ console.warn('Token check failed', e); }
        try{
          const udoc = await getDoc(doc(db,'users',user.uid));
          if(udoc.exists()){
            const data = udoc.data();
            if(data.isAdmin||data.isSuperAdmin) return true;
          }
        } catch(e){ console.warn('User doc admin check failed', e); }
        return false;
      }

      // live participant counter
      onSnapshot(collection(db,'users'), snap=>{
        try{
          const docs = snap.docs.map(d=>({ uid:d.id, ...(d.data()||{}) }));
          const nonAdminCount = docs.filter(u=>!u.isAdmin && !u.isSuperAdmin).length;
          updateCounterUI(nonAdminCount);
        } catch(e){ console.error(e); updateCounterUI(snap.size); }
      });

      onAuthStateChanged(auth, async user=>{
        if(user){
          if(navRegister){ navRegister.textContent='Dashboard'; navRegister.onclick=()=>{ doPulse(navRegister); window.location.href='dashboard.html'; }; }
          if(navLogin){ navLogin.textContent='Logout'; navLogin.onclick=async()=>{ doPulse(navLogin); if(confirm('Logout?')) await signOut(auth); }; }
          if(bigReg){ bigReg.textContent='Go to Dashboard'; bigReg.onclick=()=>{ doPulse(bigReg); window.location.href='dashboard.html'; }; }
          if(welcomeMsg){ welcomeMsg.textContent=`Welcome, ${user.displayName||user.email||'Participant'}`; welcomeMsg.style.display='block'; }

          const isAdmin = await resolveAdminForUser(user);
          if(navDashboard){
            navDashboard.style.display = isAdmin?'inline-block':'none';
            if(isAdmin) navDashboard.onclick=()=>{ doPulse(navDashboard); window.location.href='admin.html'; };
          }
        } else {
          if(navRegister){ navRegister.textContent='Register'; navRegister.onclick=()=>{ doPulse(navRegister); window.location.href='register.html'; }; }
          if(navLogin){ navLogin.textContent='Login'; navLogin.onclick=()=>{ doPulse(navLogin); window.location.href='login.html'; }; }
          if(bigReg){ bigReg.textContent='Register for Code Clash 2025'; bigReg.onclick=()=>{ doPulse(bigReg); window.location.href='register.html'; }; }
          if(welcomeMsg){ welcomeMsg.textContent=''; welcomeMsg.style.display='none'; }
          if(navDashboard){ navDashboard.style.display='none'; navDashboard.onclick=null; }
        }
      });

    } catch(err){
      console.warn('Firebase failed, using local fallback', err);
      startLocalDemoCounter();
      if(navRegister) navRegister.onclick=()=>{ doPulse(navRegister); window.location.href='register.html'; };
      if(navLogin) navLogin.onclick=()=>{ doPulse(navLogin); window.location.href='login.html'; };
      if(navDashboard) navDashboard.style.display='none';
    }
  }

  await startFirebase();

})();