(function(){
  const btn = document.getElementById('mobileMenuBtn');
  const menu = document.getElementById('mobileMenu');
  const inner = document.querySelector('.mobile-menu-inner');
  const desktopActions = document.querySelector('.nav-actions');

  if(!btn || !menu || !inner) return;

  const canonicalIds = ['navDashboard','navRegister','navLogin'];

  function setMobileVisibility(){
    const mobile = window.innerWidth <= 760;
    btn.style.display = mobile ? 'inline-flex' : 'none';
    menu.style.display = mobile ? '' : 'none';
    if(!mobile){
      menu.setAttribute('aria-hidden','true');
      btn.setAttribute('aria-expanded','false');
    } else {
      buildMobileMenu();
    }
  }
  setMobileVisibility();
  window.addEventListener('resize', setMobileVisibility);

  // returns true if element has inline style display:none or hidden attribute
  function explicitlyHidden(el){
    if(!el) return true;
    if(el.hidden) return true;
    const s = (el.getAttribute('style') || '').toLowerCase();
    if(/\bdisplay\s*:\s*none\b/.test(s)) return true;
    return false;
  }

  // include canonical items even if CSS media rules hide desktop nav on mobile
  function shouldInclude(el){
    if(!el) return false;
    // explicit inline hiding => definitely exclude
    if(explicitlyHidden(el)) return false;
    // if it has attribute data-force-mobile="true" include
    if(el.getAttribute && el.getAttribute('data-force-mobile') === 'true') return true;
    // otherwise include by default (we want menu usable for unauthed users)
    return true;
  }

  // canonical action fallback (guaranteed navigation even if desktop handlers absent)
  function performCanonicalActionById(id){
    switch(id){
      case 'navRegister':
        window.location.href = 'register.html';
        return;
      case 'navLogin':
        window.location.href = 'login.html';
        return;
      case 'navDashboard':
        // prefer dashboard; if admin link is visible on desktop it will be shown separately
        window.location.href = 'dashboard.html';
        return;
      default:
        return;
    }
  }

  function proxyClickToOriginal(orig, menuBtn){
    // hide menu first
    menu.setAttribute('aria-hidden','true');
    btn.setAttribute('aria-expanded','false');

    // if original element has a direct onclick function, call it
    try {
      if(orig && typeof orig.onclick === 'function'){
        orig.onclick();
        return;
      }
      // if original has a data-action attribute, trust it (not common, but helpful)
      const dataAction = orig && orig.getAttribute && orig.getAttribute('data-action');
      if(dataAction){
        // common patterns: "logout", "open-dashboard" etc.
        if(dataAction === 'logout'){
          // try to trigger click (some pages attach handler to element)
          try { orig.click(); } catch(e){ /* ignore */ }
          return;
        }
      }
      // otherwise perform canonical fallback if available
      if(orig && orig.id && canonicalIds.includes(orig.id)){
        performCanonicalActionById(orig.id);
        return;
      }
      // last resort: call click() on the original to fire listeners attached via addEventListener
      if(orig && typeof orig.click === 'function'){
        orig.click();
        return;
      }
    } catch(err){
      console.error('Mobile menu proxy click failed', err);
    }
    // absolute fallback: do nothing (shouldn't happen)
  }

  function buildMobileMenu(){
    inner.innerHTML = '';

    // canonical items first (deterministic order)
    for(const id of canonicalIds){
      const orig = document.getElementById(id);
      // include if element exists AND not explicitly hidden
      if(!orig) continue;
      if(!shouldInclude(orig)) continue;

      const b = document.createElement('button');
      b.className = orig.className || '';
      b.textContent = (orig.getAttribute('aria-label') || orig.innerText || orig.textContent || id).trim();
      b.dataset.origId = id;
      b.addEventListener('click', (e) => proxyClickToOriginal(orig, b));
      inner.appendChild(b);
    }

    // then include any other visible buttons from .nav-actions (avoid duplicating canonical items)
    if(desktopActions){
      Array.from(desktopActions.children).forEach(orig => {
        if(!orig) return;
        if(orig.id && canonicalIds.includes(orig.id)) return;
        if(!shouldInclude(orig)) return;

        const b = document.createElement('button');
        b.className = orig.className || '';
        b.textContent = (orig.getAttribute('aria-label') || orig.innerText || orig.textContent || 'Action').trim();
        if(orig.id) b.dataset.origId = orig.id;
        b.addEventListener('click', (e) => proxyClickToOriginal(orig, b));
        inner.appendChild(b);
      });
    }

    if(inner.children.length === 0){
      const fallback = document.createElement('div');
      fallback.className = 'small-muted';
      fallback.textContent = 'No actions available';
      inner.appendChild(fallback);
    }
  }

  function openMenu(){
    buildMobileMenu();
    menu.setAttribute('aria-hidden','false');
    btn.setAttribute('aria-expanded','true');
    setTimeout(()=> document.addEventListener('click', outsideClick), 10);
    document.addEventListener('keydown', onKeyDown);
  }
  function closeMenu(){
    menu.setAttribute('aria-hidden','true');
    btn.setAttribute('aria-expanded','false');
    document.removeEventListener('click', outsideClick);
    document.removeEventListener('keydown', onKeyDown);
  }
  function outsideClick(e){
    if(menu.contains(e.target) || btn.contains(e.target)) return;
    closeMenu();
  }
  function onKeyDown(e){
    if(e.key === 'Escape') closeMenu();
  }

  btn.addEventListener('click', (ev)=>{
    ev.stopPropagation();
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if(expanded) closeMenu(); else openMenu();
  });

  // rebuild menu when desktopActions change
  const observer = new MutationObserver((mutations) => {
    if(window._menuRebuildTimer) clearTimeout(window._menuRebuildTimer);
    window._menuRebuildTimer = setTimeout(() => {
      if(window.innerWidth <= 760) buildMobileMenu();
    }, 60);
  });
  if(desktopActions) observer.observe(desktopActions, { childList: true, subtree: true, attributes: true, attributeFilter: ['style','class','hidden'] });

  // also listen for explicit nav-updated event
  document.addEventListener('nav-updated', () => {
    if(window.innerWidth <= 760) buildMobileMenu();
  });

  // initial build for mobile
  if(window.innerWidth <= 760) buildMobileMenu();

})();