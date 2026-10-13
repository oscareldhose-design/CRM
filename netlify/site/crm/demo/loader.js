/* MAP CRM demo: first visit. Starts the service worker that runs the CRM in this browser, then opens the CRM. */
(function () {
  var msg = document.getElementById('msg');
  var card = document.getElementById('card');
  var inFrame = false;
  try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
  function fail(text, linkText) {
    card.className = 'card err';
    msg.textContent = text;
    if (linkText) {
      var a = document.createElement('a');
      a.href = location.href.split('#')[0];
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = linkText;
      a.style.cssText = 'display:inline-block;margin-top:16px;padding:10px 20px;border-radius:999px;background:linear-gradient(135deg,#a308a3,#6e006e);color:#fff;font-weight:700;text-decoration:none';
      card.appendChild(a);
    }
  }
  // Explains a failed start: a private Netlify site, Netlify's own preview window, or an unsupported browser.
  function explain(e) {
    return fetch('sw.js', { cache: 'no-store', credentials: 'omit' }).then(function (r) { return r.status; }, function () { return 0; }).then(function (status) {
      if (status === 401 || status === 403) {
        fail('This Netlify site is set to private, so the demo can\'t start. In Netlify open the site, go to Project configuration → General → Visitor access → Project visibility, choose Public and save. Then open the site\'s own address (it ends in .netlify.app).');
      } else if (inFrame) {
        fail('The demo can\'t run inside this preview window. Open it in its own browser tab instead:', 'Open the demo in a new tab');
      } else {
        fail('The demo could not start: ' + (e && e.message ? e.message : e) + '. Please try an up-to-date Chrome or Edge (not a private window).');
      }
    });
  }
  if (!('serviceWorker' in navigator)) {
    if (inFrame) fail('The demo can\'t run inside this preview window. Open it in its own browser tab instead:', 'Open the demo in a new tab');
    else fail('This demo needs an up-to-date Chrome, Edge, Safari or Firefox, and doesn\'t work in a private or incognito window.');
    return;
  }
  var tries = 0;
  try { tries = +sessionStorage.getItem('map-demo-tries') || 0; sessionStorage.setItem('map-demo-tries', tries + 1); } catch (e) { /* private mode */ }
  if (tries >= 3) {
    try { sessionStorage.removeItem('map-demo-tries'); } catch (e) { /* ignore */ }
    explain(new Error('the browser did not let the demo start'));
    return;
  }
  navigator.serviceWorker.register('sw.js', { type: 'module', scope: './' }).then(function () {
    return navigator.serviceWorker.ready;
  }).then(function () {
    if (navigator.serviceWorker.controller) return null;
    return new Promise(function (resolve) {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      setTimeout(resolve, 5000);
    });
  }).then(function () {
    // Start PHP now, so the first screen of the CRM opens quickly.
    return fetch('api.php?action=status', { cache: 'no-store' }).catch(function () { return null; });
  }).then(function () {
    try { sessionStorage.removeItem('map-demo-tries'); } catch (e) { /* ignore */ }
    location.replace(location.href);
  }).catch(explain);
})();
