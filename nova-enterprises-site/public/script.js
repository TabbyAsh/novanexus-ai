/* All core content and native form submission work without JavaScript. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');
  const closeMenu = () => {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
  };
  if (toggle && nav) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        closeMenu();
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 900px)').addEventListener('change', closeMenu);
  }
  const product = document.querySelector('#product');
  document.querySelectorAll('[data-product]').forEach(link => {
    link.addEventListener('click', () => {
      if (product) product.value = link.dataset.product;
    });
  });
  // Keep successful submissions on the current preview or production origin.
  const form = document.querySelector('#quote-form');
  if (form && /^https?:$/.test(location.protocol)) {
    form.elements.namedItem('_next').value = new URL('thanks.html', location.href).href;
    form.elements.namedItem('_url').value = location.origin + location.pathname;
  }
})();
