/* All core content and native form submission work without JavaScript.
   JavaScript adds the menu, product and service preselect, and a request id
   so a double submit does not create two inquiries. */
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
  const service = document.querySelector('#service-line');
  document.querySelectorAll('[data-service]').forEach(link => {
    link.addEventListener('click', () => {
      if (service) service.value = link.dataset.service;
    });
  });
  const requestId = () => {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `rq${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  };
  document.querySelectorAll('form.intake-form').forEach(form => {
    const field = form.elements.namedItem('request_id');
    if (field && !field.value) field.value = requestId();
  });
})();
