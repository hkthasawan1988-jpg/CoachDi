/* Presentation only: keep existing elements, handlers, IDs and booking writes. */
(() => {
  'use strict';
  document.documentElement.classList.toggle('cd-native', !!window.Capacitor?.isNativePlatform());
  const overlay = document.getElementById('sheetWrap');
  const content = document.getElementById('sheetContent');
  if (!overlay || !content) return;
  const root = document.documentElement;
  let previousFocus = null;
  let wasOpen = false;

  function arrange() {
    contentObserver.disconnect();
    let body = content.querySelector(':scope > .cdSheetBody');
    if (!body) {
      body = document.createElement('div');
      body.className = 'cdSheetBody';
      content.prepend(body);
    }
    // Move, never clone: one button retains one original booking handler.
    for (const child of [...content.childNodes]) {
      if (child !== body && !(child.nodeType === 1 && child.matches('.sheetActions'))) {
        body.append(child);
      }
    }
    contentObserver.observe(content, { childList: true });
    const heading = body.querySelector('h2');
    if (heading) {
      if (!heading.id) heading.id = 'cdSheetTitle';
      overlay.setAttribute('aria-labelledby', heading.id);
    }
  }
  function viewport() {
    if (window.visualViewport) {
      overlay.style.setProperty('--cd-visible-height', `${window.visualViewport.height}px`);
      overlay.style.setProperty('--cd-visible-top', `${window.visualViewport.offsetTop}px`);
    }
  }
  function visibility() {
    const open = !overlay.classList.contains('hidden');
    root.classList.toggle('cd-overlay-open', open);
    if (open && !wasOpen) {
      previousFocus = document.activeElement;
      arrange();
      viewport();
      content.querySelector('.sheetActions button:not(:disabled)')?.focus({ preventScroll: true });
    } else if (!open && wasOpen && previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
    wasOpen = open;
  }
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const contentObserver = new MutationObserver(arrange);
  contentObserver.observe(content, { childList: true });
  new MutationObserver(visibility).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
  window.addEventListener('resize', viewport);
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...content.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
      .filter(el => !el.disabled && el.getClientRects().length);
    if (!controls.length) return;
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  visibility();
})();
