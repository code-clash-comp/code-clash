// navbar logic: swap Home/Dashboard + Login/Logout based on auth
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDpKPIqiWrGpvE3xL6TBRQEEfrpZGIfedM",
  authDomain: "code-clash-2025.firebaseapp.com",
  projectId: "code-clash-2025",
  storageBucket: "code-clash-2025.firebasestorage.app",
  messagingSenderId: "13717806434",
  appId: "1:13717806434:web:8aa7799e7f87ebbdf0603b"
};

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// nav buttons
const navHome = document.getElementById("navHome");
const navAuth = document.getElementById("navAuth");

onAuthStateChanged(auth, (user) => {
  if (user) {
    navHome.textContent = "Dashboard";
    navHome.onclick = () => window.location.href = "dashboard.html";
    navAuth.textContent = "Logout";
    navAuth.onclick = () => signOut(auth);
  } else {
    navHome.textContent = "Home";
    navHome.onclick = () => window.location.href = "index.html";
    navAuth.textContent = "Login";
    navAuth.onclick = () => window.location.href = "login.html";
  }
});

// live participants/teams
async function loadCounts(){
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const teamsSnap = await getDocs(collection(db, "teams"));
    const participants = usersSnap.size;
    const teams = teamsSnap.size;

    document.getElementById("liveParticipants").textContent = participants;
    document.getElementById("liveTeams").textContent = teams;
    const pct = Math.min((participants/32)*100, 100);
    document.getElementById("regProgress").style.width = pct + "%";
  } catch(err){
    console.error("Counts", err);
  }
}
loadCounts();

// typewriter effect
(function typewriterRules(){
  const el = document.getElementById("typingRules");
  const phrases = [
    "Know the rules, master the clash.",
    "Fair play. Fast play. Fun play.",
    "Be prepared — victory awaits."
  ];
  let p=0, ch=0, deleting=false;
  const typingSpeed=50, pauseAfter=1000;
  function tick(){
    const cur=phrases[p];
    if(!deleting){
      el.textContent=cur.slice(0,ch+1);
      ch++;
      if(ch===cur.length){ deleting=true; setTimeout(tick,pauseAfter); return; }
    } else {
      el.textContent=cur.slice(0,ch-1);
      ch--;
      if(ch===0){ deleting=false; p=(p+1)%phrases.length; }
    }
    setTimeout(tick, deleting?typingSpeed/1.4:typingSpeed);
  }
  tick();
})();
