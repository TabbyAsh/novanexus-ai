/* All core content and native form submission work without JavaScript.
   JavaScript adds request ids, product and service preselect, JSON submit
   with an on-page receipt, and the save-failed mailto/tel fallback. */
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
  const service = document.querySelector('#service-line');
  const OWNER_EMAIL = 'wkirby592@gmail.com';
  const OWNER_PHONE_TEL = '+18122631586';
  const OWNER_PHONE_DISPLAY = '812-263-1586';
  const SAVE_FAILED_MESSAGE = "We couldn't save your request. Please email wkirby592@gmail.com or call 812-263-1586.";

  const requestId = () => {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `rq${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  };

  const revealTarget = id => {
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    const details = el.tagName === 'DETAILS' ? el : el.closest('details');
    if (details) details.open = true;
  };

  const hashId = () => (location.hash || '').replace(/^#/, '');

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    revealTarget(id);
    if (link.dataset.product && product) product.value = link.dataset.product;
    if (link.dataset.service && service) service.value = link.dataset.service;
  });
  revealTarget(hashId());
  window.addEventListener('hashchange', () => revealTarget(hashId()));

  const link = (href, text) => {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = text;
    return anchor;
  };

  const showSaveFallback = status => {
    status.replaceChildren();
    const paragraph = document.createElement('p');
    paragraph.append(
      "We couldn't save your request. Please email ",
      link(`mailto:${OWNER_EMAIL}`, OWNER_EMAIL),
      ' or call ',
      link(`tel:${OWNER_PHONE_TEL}`, OWNER_PHONE_DISPLAY),
      '.',
    );
    status.append(paragraph);
  };

  const showReceipt = (status, json) => {
    status.replaceChildren();
    const paragraph = document.createElement('p');
    const reference = document.createElement('strong');
    reference.textContent = json.receipt_id;
    if (json.replay) {
      paragraph.append('This request was already saved. The original reference is unchanged. Your reference is ', reference, '.');
    } else {
      paragraph.append('We saved your inquiry. Your reference is ', reference, '. Save it if you follow up.');
    }
    status.append(paragraph);
  };

  const showMessage = (status, message) => {
    status.replaceChildren();
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    status.append(paragraph);
  };

  document.querySelectorAll('form.intake-form').forEach(form => {
    const field = form.elements.namedItem('request_id');
    if (field && !field.value) field.value = requestId();

    const status = document.createElement('div');
    status.className = 'form-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.insertAdjacentElement('afterend', status);
    else form.append(status);

    form.addEventListener('submit', async event => {
      if (typeof fetch !== 'function' || typeof Object.fromEntries !== 'function') return;
      event.preventDefault();
      if (field && !field.value) field.value = requestId();
      const payload = Object.fromEntries(new FormData(form).entries());
      if (submit) submit.disabled = true;
      status.textContent = 'Sending…';
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        if (json && json.stored && json.receipt_id) {
          showReceipt(status, json);
          return;
        }
        if (json && json.ok && json.stored === false) {
          showMessage(status, 'If you meant to send an inquiry and you do not see a reference ID, nothing was stored.');
          return;
        }
        if (json && json.fields && typeof json.fields === 'object') {
          const list = document.createElement('ul');
          Object.entries(json.fields).forEach(([name, message]) => {
            const item = document.createElement('li');
            item.textContent = `${name}: ${message}`;
            list.append(item);
          });
          status.replaceChildren();
          if (json.message) {
            const paragraph = document.createElement('p');
            paragraph.textContent = json.message;
            status.append(paragraph);
          }
          status.append(list);
          return;
        }
        if (!json || json.error === 'intake_unavailable' || json.message === SAVE_FAILED_MESSAGE || response.status === 503 || response.status >= 500) {
          showSaveFallback(status);
          return;
        }
        showMessage(status, json.message || SAVE_FAILED_MESSAGE);
      } catch {
        showSaveFallback(status);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  });
})();
