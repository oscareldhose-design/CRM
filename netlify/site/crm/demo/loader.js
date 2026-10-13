/* MAP CRM demo: first visit. Starts the service worker that runs the CRM in this browser, then opens the CRM. */
(function () {
  var msg = document.getElementById('msg');
  function fail(text) { document.getElementById('card').className = 'card err'; msg.textContent = text; }
  if (!('serviceWorker' in navigator)) {
    fail('This demo needs an up-to-date Chrome, Edge, Safari or Firefox, and doesn\'t work in a private or incognito window.');
    return;
  }
  var tries = 0;
  try { tries = +sessionStorage.getItem('map-demo-tries') || 0; sessionStorage.setItem('map-demo-tries', tries + 1); } catch (e) { /* private mode */ }
  if (tries >= 3) {
    try { sessionStorage.removeItem('map-demo-tries'); } catch (e) { /* ignore */ }
    fail('The demo could not start in this browser. Please try an up-to-date Chrome or Edge (not a private window).');
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
    location.replace(location.href);
  }).catch(function (e) {
    fail('The demo could not start: ' + (e && e.message ? e.message : e) + '. Please try an up-to-date Chrome or Edge (not a private window).');
  });
})();
