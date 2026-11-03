// Shared conversation renderer: message list + composer used by DMs,
// channels and stream chat. Reads from AppState, writes through state methods.
import { el, esc, icon, avatar, fmtTime, fmtDay, richText, toast } from './dom.js';

/**
 * Render a full conversation pane.
 * @param {AppState} state
 * @param {object} opts
 * @param {string} opts.conv - conv id ('dm:userId' | 'ch:channelId' | 'sc:streamId')
 * @param {string} opts.peerId - the other user's id (for DMs) or channel/stream id
 * @param {string} opts.title - header title
 * @param {string} opts.subtitle - header subtitle
 * @param {function} opts.send - state.send function (text, files) => Promise
 * @param {object} ctx - app context with navigateTo
 */
export function conversationPane(state, { conv, peerId, title, subtitle, send, allowFiles = true }) {
  const wrap = el('div', { class: 'chat-body' });
  activeState = state;

  // header
  const header = el('div', { class: 'main-head', style: 'min-height:auto;padding:12px 18px;' });
  header.append(
    avatar(title, peerId, 34),
    el('div', { style: 'flex:1;min-width:0;' },
      el('h2', { style: 'font-size:15.5px;font-weight:650;' }, esc(title)),
      el('p', { style: 'font-size:12px;color:var(--muted);margin-top:1px;' }, esc(subtitle || '')),
    ),
  );
  wrap.append(header);

  // message scroller
  const scroller = el('div', { class: 'msg-scroll' });
  const typing = el('div', { class: 'typing-line' });
  wrap.append(scroller, typing);

  // composer
  const compose = el('div', { class: 'composer' });
  const inner = el('div', { class: 'composer-inner' });
  const attachBtn = el('button', { class: 'icon-btn', 'aria-label': 'Attach file', title: 'Attach', html: icon('clip') });
  const textarea = el('textarea', { placeholder: 'Write a message… · Enter to send', rows: 1, autofocus: true,
    style: 'flex:1;resize:none;border:0;background:transparent;outline:none;max-height:160px;min-height:24px;line-height:1.45;padding:5px 0;' });
  const fileInput = el('input', { type: 'file', multiple: 'true',
    accept: 'image/png,image/jpeg,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,application/pdf,text/plain,application/zip',
    style: 'display:none' });
  if (allowFiles) inner.append(attachBtn, fileInput);
  inner.append(textarea);
  const sendBtn = el('button', { class: 'btn primary sm', 'aria-label': 'Send', html: icon('send') });
  inner.append(sendBtn);
  compose.append(inner);
  wrap.append(compose);

  // attachment tray
  let pendingFiles = [];

  const render = () => {
    const messages = state.messages(conv);
    let lastDay = '';
    let html = '';
    if (!messages.length) {
      scroller.innerHTML = `<div class="empty"><div class="empty-ico">${icon('chat')}</div><h3>No messages yet</h3><p>Send the first message to start the conversation.</p></div>`;
      return;
    }
    for (const m of messages) {
      const day = fmtDay(m.ts);
      if (day !== lastDay) {
        html += `<div class="day-sep"><span>${esc(day)}</span></div>`;
        lastDay = day;
      }
      html += messageRow(m, state);
    }
    scroller.innerHTML = html;
    scroller.scrollTop = scroller.scrollHeight;
  };

  const scrollToBottom = () => { scroller.scrollTop = scroller.scrollHeight; };

  const doSend = async () => {
    const text = textarea.value.trim();
    const files = [...pendingFiles];
    if (!text && !files.length) return;
    textarea.readOnly = true;
    textarea.style.pointerEvents = 'none';
    try {
      await send(text, files);
    } catch (err) {
      toast(err.message || 'Send failed', 'error');
    } finally {
      textarea.readOnly = false;
      textarea.style.pointerEvents = '';
      textarea.value = '';
      pendingFiles = [];
      render();
      scrollToBottom();
      textarea.focus();
    }
  };

  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  sendBtn.addEventListener('click', doSend);

  if (allowFiles) {
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      fileInput.value = '';
      for (const f of files) {
        if (f.size > 80_000_000) { toast(`${f.name} is over 80 MB, skipping`, 'error'); continue; }
        pendingFiles.push(f);
      }
      // send immediately with current text
      if (pendingFiles.length) doSend();
    });
  }

  // live updates
  const unsub = state.subscribe(evt => {
    if (evt.type === 'message' && evt.msg && evt.msg.conv === conv) {
      render();
      scrollToBottom();
    } else if (evt.type === 'message-updated' && evt.id) {
      render();
    } else if (evt.type === 'typing' && evt.conv === conv) {
      const map = state.typing.get(conv);
      if (map && map.size) {
        const names = [...map.keys()].map(id => state.nameOf(id));
        typing.textContent = names.length === 1 ? `${names[0]} is typing…` : `${names.join(', ')} are typing…`;
      } else {
        typing.textContent = '';
      }
    }
  });

  // cleanup on remove
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) { unsub(); obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  render();
  scrollToBottom();
  textarea.focus();

  return wrap;
}

function messageRow(m, state) {
  const mine = m.mine;
  const who = state.nameOf(m.from);
  const time = fmtTime(m.ts);
  const av = avatar(who, m.from, 30);

  let tickHtml = '';
  if (mine) {
    if (m.pending) tickHtml = `<span class="tick pending" title="Delivering">${icon('check')}</span>`;
    else tickHtml = `<span class="tick sent" title="Sent">${icon('doubleCheck')}</span>`;
  }

  let body = '';
  if (m.text) body = richText(m.text);
  if (m.attachments && m.attachments.length) {
    body += m.attachments.map(att => attachBlock(att, state)).join('');
  }

  const meta = mine
    ? `${tickHtml}<span class="time">${time}</span>`
    : `<span class="who">${esc(who)}</span><span class="time">${time}</span>`;

  return `<div class="msg-row ${mine ? 'mine' : ''}">${av}<div class="msg-wrap"><div class="msg-meta">${meta}</div><div class="bubble">${body}</div></div></div>`;
}

function attachBlock(att, state) {
  const name = esc(att.name || 'file');
  const sizeStr = att.size ? fmtBytes(att.size) + ' · ' : '';
  const typeStr = esc((att.type || 'file').split('/')[1] || 'file');
  return `<div class="msg-attach" data-media="${esc(att.mediaId || '')}" data-key="${esc(att.key || '')}" data-iv="${esc(att.iv || '')}" data-name="${name}" data-type="${esc(att.type || '')}">
    ${icon('file')}<div><div class="an">${name}</div><div class="as">${sizeStr}${typeStr}</div></div>
  </div>`;
}

function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

// Click delegation for attachment downloads.
// The attachment lives on the node encrypted; the key travels with the message.
// So we fetch the ciphertext, decrypt it here, and only then save it.
let activeState = null;

document.addEventListener('click', async (e) => {
  const node = e.target.closest && e.target.closest('.msg-attach[data-media]');
  if (!node) return;
  const mediaId = node.dataset.media;
  if (!mediaId) return;
  e.preventDefault();

  const key = node.dataset.key;
  const iv = node.dataset.iv;
  if (!activeState || !key || !iv) {
    window.open('/media/' + mediaId, '_blank');
    return;
  }
  try {
    const bytes = await activeState.downloadAttachment({ mediaId, key, iv });
    const blob = new Blob([bytes], { type: node.dataset.type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = node.dataset.name || 'attachment';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (err) {
    toast(err.message || 'Could not download this attachment', 'error');
  }
});
