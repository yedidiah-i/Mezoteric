// Channels sidebar + conversation pane wrapper.
import { el, esc, avatar, fmtTime, icon, emptyState, roleBadge } from '../ui/dom.js';
import { conversationPane as cp } from '../ui/conversation.js';

export function sidebar(state, ctx) {
  const list = el('div');
  list.append(el('div', { class: 'section-label' }, 'Your channels'));
  const mine = state.myChannels ? state.myChannels() : [];
  if (mine.length) {
    mine.sort((a, b) => b.ts - a.ts).forEach(ch => {
      const item = el('div', { class: 'list-item', click: () => ctx.navigateTo('channels/' + ch.id) });
      item.append(avatar(ch.name, 'c' + ch.id, 38),
        el('div', { class: 'li-main' },
          el('div', { class: 'li-top' }, el('span', { class: 'li-name' }, esc(ch.name)), el('span', { class: 'spacer' })),
          el('div', { class: 'li-sub' }, esc(ch.topic || 'No topic')),
        ));
      list.append(item);
    });
  } else {
    list.append(el('div', { class: 'empty', style: 'padding:20px 16px' },
      el('div', { class: 'empty-ico' }, icon('hash')),
      el('h3', {}, 'No channels'), el('p', {}, 'Create a channel to get started.')));
  }

  const all = state.channelList ? state.channelList() : [];
  const others = all.filter(ch => !state.channelKeys.has(ch.id));
  if (others.length) {
    list.append(el('div', { class: 'section-label', style: 'margin-top:14px' }, 'Browse'));
    others.forEach(ch => {
      const item = el('div', { class: 'list-item', click: () => ctx.navigateTo('channels/' + ch.id) });
      item.append(icon('lock'),
        el('div', { class: 'li-main' },
          el('div', { class: 'li-top' }, el('span', { class: 'li-name' }, esc(ch.name)), el('span', { class: 'spacer' })),
          el('div', { class: 'li-sub' }, 'Ask the owner for an invite'),
        ));
      list.append(item);
    });
  }
  return list;
}

export function conversationPane(state, channelId, ctx) {
  const ch = state.channels[channelId];
  if (!ch) return el('div', { class: 'page' }, el('div', { class: 'empty' }, el('h3', {}, 'Channel not found')));
  return cp(state, {
    conv: 'ch:' + channelId, peerId: 'c' + channelId,
    title: ch.name, subtitle: ch.topic || 'Channel',
    send: async (text, files) => {
      const atts = []; for (const f of files) atts.push(await state.uploadAttachment(f));
      await state.sendChannelMessage(channelId, text, atts); state.markRead('ch:' + channelId);
    },
  });
}