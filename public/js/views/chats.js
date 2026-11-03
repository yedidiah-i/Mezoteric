// DMs sidebar + conversation pane wrapper.
import { el, esc, avatar, fmtTime, fmtDay, icon, emptyState } from '../ui/dom.js';
import { conversationPane as cp } from '../ui/conversation.js';

export function sidebar(state, ctx) {
  const list = el('div');
  list.append(el('div', { class: 'section-label' }, 'Messages'));
  const convos = state.sortedConvos ? state.sortedConvos() : [];
  if (!convos.length) {
    list.append(el('div', { class: 'empty', style: 'padding:30px 16px' },
      el('div', { class: 'empty-ico' }, icon('chat')),
      el('h3', {}, 'No messages'), el('p', {}, 'Select a person to start chatting.')));
    return list;
  }
  for (const c of convos) {
    const item = el('div', { class: 'list-item', click: () => ctx.navigateTo('chats/' + c.userId) });
    item.append(
      avatar(c.name || c.userId, c.userId, 38),
      el('div', { class: 'li-main' },
        el('div', { class: 'li-top' }, el('span', { class: 'li-name' }, esc(c.name || c.userId)), el('span', { class: 'spacer' })),
        el('div', { class: 'li-sub' }, esc(c.lastText || 'Tap to start chatting')),
      ),
      el('div', { class: 'li-meta' },
        el('span', { class: 'time' }, c.ts ? _fmtWhen(c.ts) : ''),
        c.unread > 0 ? el('span', { class: 'badge' }, c.unread) : '',
      ),
    );
    list.append(item);
  }
  return list;
}

export function conversationPane(state, peerId, ctx) {
  return cp(state, {
    conv: 'dm:' + peerId, peerId,
    title: state.nameOf(peerId),
    subtitle: 'End-to-end encrypted',
    send: async (text, files) => {
      const atts = []; for (const f of files) atts.push(await state.uploadAttachment(f));
      await state.sendDm(peerId, text, atts); state.markRead('dm:' + peerId);
    },
  });
}

function _fmtWhen(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm';
  if (d < 86400000) return fmtTime(ts);
  return fmtDay(ts);
}