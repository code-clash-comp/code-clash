const FIREBASE_CONFIG = {
apiKey: "AIzaSyDpKPIqiWrGpvE3xL6TBRQEEfrpZGIfedM",
authDomain: "code-clash-2025.firebaseapp.com",
projectId: "code-clash-2025",
storageBucket: "code-clash-2025.firebasestorage.app",
messagingSenderId: "13717806434",
appId: "1:13717806434:web:8aa7799e7f87ebbdf0603b",
measurementId: "G-0BMTHMYMEL"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);

let authChecked = false;
onAuthStateChanged(auth, async (user) => {
if (authChecked) return; // run redirect logic only once on load
authChecked = true;

if (user) {
    // user is logged in -> redirect to admin/dashboard based on claims
    try {
    const idRes = await user.getIdTokenResult();
    const claims = idRes.claims || {};
    if (claims.superAdmin || claims.isSuperAdmin || claims.admin || claims.isAdmin) {
        window.location.replace('/code-clash/admin.html');
    } else {
        window.location.replace('/code-clash/dashboard.html');
    }
    return;
    } catch (err) {
    // if any error, fallback to dashboard
    console.warn('id token check failed, redirecting to dashboard', err);
    window.location.replace('/code-clash/');
    return;
    }
}
});

// typewriter (login)
(function typewriterLogin(){
const el = document.getElementById('typingTextLogin');
const phrases = [
    'Login to enter the clash',
    'Good luck — train your loops',
    'Fastest correct solution wins'
];
let p = 0, ch = 0, deleting = false;
const typingSpeed = 50, pauseAfter = 900;
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

// login flow
const form = document.getElementById('loginForm');
const btn = document.getElementById('loginBtn');
const msgEl = document.getElementById('loginMsg');

const showMsg = (text, type='info')=>{
msgEl.textContent = text;
msgEl.style.color = (type === 'error') ? '#f6a6a6' : '#bfe8c6';
};

form.addEventListener('submit', async (e)=>{
e.preventDefault();
showMsg('');
const email = document.getElementById('loginEmail').value.trim();
const password = document.getElementById('loginPassword').value;
if(!email || !password){
    showMsg('Please enter email and password.', 'error');
    return;
}
btn.disabled = true;
btn.textContent = 'Logging in...';
try{
    await signInWithEmailAndPassword(auth, email, password);
    showMsg('Logged in — redirecting...', 'info');
    setTimeout(() => {
    window.location.replace('/code-clash/dashboard.html');
    }, 600);

} catch(err){
    console.error('Login', err);
    showMsg(err?.message || 'Login failed', 'error');
} finally {
    btn.disabled = false;
    btn.textContent = 'Login';
}
});