// Tiny DOM helpers: escaping, formatting, icons, toasts and modals.
// Everything user-supplied is escaped before it reaches innerHTML.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (typeof v === 'function') node.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    if (child instanceof Node) { node.append(child); continue; }
    // Helpers such as icon(), avatar() and roleBadge() return markup, not text.
    // Dropping them in as a text node would print the raw HTML on screen, so a
    // string that looks like a fragment is parsed. Every piece of user-supplied
    // text goes through esc() first, which escapes '<', so it can never be
    // mistaken for markup here.
    const text = String(child);
    if (text.length > 1 && text.startsWith('<') && text.endsWith('>')) {
      const tpl = document.createElement('template');
      tpl.innerHTML = text;
      for (const n of [...tpl.content.childNodes]) node.append(n);
    } else {
      node.append(document.createTextNode(text));
    }
  }
  return node;
}

/** Parse a markup string into a DOM node. */
export function html(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(markup ?? '');
  return tpl.content.firstElementChild || document.createTextNode('');
}

const SVG = {
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.9 8.9 0 0 1-3.8-.8L3 21l1.9-5.2a8.3 8.3 0 0 1-1.4-4.6 8.4 8.4 0 0 1 8.5-8.4 8.4 8.4 0 0 1 9 8.7z"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  video: '<path d="m23 7-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  play: '<rect x="2" y="2" width="20" height="20" rx="5"/><path d="m10 8 6 4-6 4z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  camera: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  doubleCheck: '<path d="M1 12l5 5L17 6"/><path d="m11 15 2 2L23 6"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3L5.8 21 7 14.2 2 9.3l6.9-1z"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="20" r="1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
};

export function icon(name, cls = '') {
  const body = SVG[name] || SVG.info;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0] || '').join('').toUpperCase() || '?';
}

const COLORS = ['#3ddc97', '#8b7cf6', '#f5a623', '#4cc9f0', '#ff6b9d', '#b6e34a', '#ff9770', '#7bdff2'];
export function avatarColor(seed) {
  let h = 0;
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return COLORS[h % COLORS.length];
}

export function avatar(name, seed, size = 40) {
  return `<span class="avatar" style="--av:${avatarColor(seed || name)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px">${esc(initials(name))}</span>`;
}

export function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtWhen(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return fmtTime(ts);
  if (diff < 604800000) return new Date(ts).toLocaleDateString([], { weekday: 'short' });
  return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Escape, then add Slack-style formatting, links and mentions. */
export function richText(text, { onMention } = {}) {
  let s = esc(text);
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="code-block">${code}</pre>`);
  s = s.replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<em>$2</em>');
  s = s.replace(/(^|\s)@([A-Za-z0-9._-]{2,32})/g, (m, pre, name) =>
    `${pre}<span class="mention"${onMention ? ` data-mention="${name}"` : ''}>@${name}</span>`);
  s = s.replace(/https?:\/\/[^\s<]+/g, m => {
    const safe = m.replace(/[.,;:!?)]+$/, '');
    const trail = m.slice(safe.length);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>${trail}`;
  });
  s = s.replace(/\n/g, '<br>');
  return s;
}

// ---------- toasts ----------
let toastHost = null;
export function toast(message, kind = 'info', ms = 3600) {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.append(toastHost);
  }
  const node = el('div', { class: `toast toast-${kind}`, html: `<span>${esc(message)}</span>` });
  toastHost.append(node);
  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 250);
  }, ms);
  return node;
}

// ---------- modal ----------
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const back = el('div', { class: 'modal-back' });
  const box = el('div', { class: `modal ${wide ? 'modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true' });
  const close = () => {
    back.classList.remove('in');
    setTimeout(() => back.remove(), 180);
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const head = el('div', { class: 'modal-head' }, el('h3', {}, title || ''));
  const x = el('button', { class: 'icon-btn', 'aria-label': 'Close', html: icon('close') });
  x.addEventListener('click', close);
  head.append(x);

  const content = el('div', { class: 'modal-body' });
  if (body instanceof Node) content.append(body);
  else content.innerHTML = body || '';

  const foot = el('div', { class: 'modal-foot' });
  for (const a of actions) {
    const b = el('button', { class: `btn ${a.variant || ''}` }, a.label);
    b.addEventListener('click', async () => {
      if (a.onClick) {
        b.disabled = true;
        try {
          const result = await a.onClick({ close, box, button: b });
          if (result !== false) close();
        } catch (err) {
          toast(err.message || 'Something went wrong', 'error');
          b.disabled = false;
        }
      } else close();
    });
    foot.append(b);
  }

  box.append(head, content, foot);
  back.append(box);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('in'));
  setTimeout(() => {
    const first = box.querySelector('input, textarea, select, button.btn');
    if (first) first.focus();
  }, 60);
  return { close, box, content };
}

export function confirmBox(title, message, okLabel = 'Confirm') {
  return new Promise(resolve => {
    modal({
      title,
      body: `<p class="muted">${esc(message)}</p>`,
      actions: [
        { label: 'Cancel', onClick: () => resolve(false) },
        { label: okLabel, variant: 'primary', onClick: () => resolve(true) },
      ],
      onClose: () => resolve(false),
    });
  });
}

export function downloadBytes(bytes, name, type) {
  const blob = new Blob([bytes], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name || 'file' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function emptyState(iconName, title, text, actionHtml = '') {
  return `<div class="empty">
    <div class="empty-ico">${icon(iconName)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${actionHtml}
  </div>`;
}

export function roleBadge(role) {
  const label = { admin: 'Admin', teacher: 'Teacher', staff: 'Staff', student: 'Student', suspended: 'Suspended' }[role] || 'Unverified';
  return `<span class="role-badge role-${esc(role || 'guest')}">${label}</span>`;
}

// DOM-node variants. `avatar()` and `roleBadge()` return markup for innerHTML
// contexts; dropping those strings straight into el() children would show the
// raw HTML as text, so use these when building elements.
export function avatarEl(name, seed, size = 40) {
  const node = document.createElement('span');
  node.className = 'avatar';
  node.style.setProperty('--av', avatarColor(seed || name));
  node.style.width = `${size}px`;
  node.style.height = `${size}px`;
  node.style.fontSize = `${Math.round(size * 0.36)}px`;
  node.textContent = initials(name);
  return node;
}

export function roleBadgeEl(role) {
  const label = { admin: 'Admin', teacher: 'Teacher', staff: 'Staff', student: 'Student', suspended: 'Suspended' }[role] || 'Unverified';
  const node = document.createElement('span');
  node.className = `role-badge role-${role || 'guest'}`;
  node.textContent = label;
  return node;
}

/** A labelled stat tile, used by the dashboards. */
export function statTile(label, value, hint = '') {
  const node = el('div', { class: 'stat' },
    el('div', { class: 'n' }, String(value)),
    el('div', { class: 'l' }, label),
  );
  if (hint) node.append(el('div', { class: 'l', style: 'text-transform:none;letter-spacing:0;opacity:.7' }, hint));
  return node;
}
