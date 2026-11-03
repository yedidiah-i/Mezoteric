// Mezoteric app shell — boot, auth, navigation and routing.
// The AppState class takes no constructor args; you call state.boot(net, identity, keys).
// The Net class takes { onState, onStatus } callbacks.

import { el, esc, icon, avatar, toast, fmtTime, fmtWhen, roleBadge, emptyState, confirmBox } from './ui/dom.js';
import { conversationPane } from './ui/conversation.js';
import { loadIdentity, saveIdentity } from './core/db.js';
import { Net } from './core/net.js';
import { AppState } from './core/state.js';
import { renderAuth } from './views/auth.js';
import { sidebar as chatsSidebar, conversationPane as dmConversationPane } from './views/chats.js';
import { sidebar as channelsSidebar, conversationPane as channelConversationPane } from './views/channels.js';
import { sidebar as streamsSidebar, streamList, watchStream, goLiveForm } from './views/streams.js';
import { shortsSidebar, shortsFeed, createShortForm } from './views/shorts.js';
import { sidebar as schoolSidebar, announcementsPage, announceForm, notesPage, reportCardsPage, issuePage } from './views/school.js';
import { adminSidebar, membersPage, requestsPage, proposalsPage } from './views/admin.js';
import { dashboardPage } from './views/dashboard.js';
import { settingsPage } from './views/settings.js';

let app = null;
let state = null;
let net = null;
let identity = null;
let keys = null;
const root = document.getElementById('root');

// ---------- boot ----------
let booted = false;

async function ensureBooted() {
  if (!net) {
    net = new Net({
      onState: (t, items) => state && state.handleState(t, items),
      onStatus: s => updateNetStatus(s),
    });
  }
  if (!state) state = new AppState();
  if (booted) return;
  booted = true;
  await state.boot(net, identity, keys);
}

async function boot() {
  // Browsers require a secure context for WebCrypto, camera and service workers.
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    root.innerHTML = insecureNotice();
    return;
  }

  const existing = await loadIdentity();
  if (existing && !existing.published) {
    // Fresh identity — publish to the node, claim student role, then proceed.
    identity = existing;
    root.innerHTML = bootSplash('Publishing your identity…');
    try {
      await ensureBooted();
      await state.publishProfile(identity.name);
      try { await state.claimStudent(); } catch {}
      identity.published = true;
      await saveIdentity(identity);
    } catch (err) {
      console.error('boot publish failed', err);
      root.innerHTML = bootSplash('Could not reach the node: ' + esc(err.message) + '. Check that the Mezoteric node is running and try again.');
      return;
    }
    startApp();
    return;
  }

  if (!existing) {
    renderAuthScreen();
    return;
  }

  // Existing identity — show unlock screen.
  renderAuthScreen();
}

function renderAuthScreen() {
  renderAuth(root, {
    onUnlocked: async (ident, k, opts) => {
      identity = ident;
      keys = k;
      if (opts && opts.fresh) {
        // New identity — need to publish to the node.
        identity.published = false;
        root.innerHTML = bootSplash('Publishing your identity…');
        try {
          await ensureBooted();
          await state.publishProfile(identity.name);
          try { await state.claimStudent(); } catch {}
          identity.published = true;
          await saveIdentity(identity);
        } catch (err) {
          toast('Could not publish identity: ' + err.message, 'error');
          // Continue anyway — the outbox will retry.
        }
      }
      startApp();
    },
  });
}

function startApp() {
  root.innerHTML = shellHTML();
  app = new App();
  app.renderRail();
  app.bindRouter();
  registerSW();

  ensureBooted()
    .then(() => {
      state.subscribe(() => app && app.onStateChange());
      // Data has arrived: draw the current view again with real content.
      app.onHash();
    })
    .catch(err => {
      console.error('state boot error', err);
      toast('Connection issue: ' + err.message, 'error');
    });
}

function shellHTML() {
  return '<div class="app"><nav class="rail" id="rail"></nav><aside class="sidebar" id="sidebar"></aside><main class="main" id="main"></main></div>';
}

function bootSplash(msg) {
  return '<div class="boot-splash" style="min-height:100vh;display:grid;place-items:center;color:#8b9cba;font-family:system-ui,sans-serif"><div style="text-align:center"><div style="width:46px;height:46px;border-radius:14px;margin:0 auto 14px;background:linear-gradient(140deg,#3ddc97,#8b7cf6)"></div>' + esc(msg) + '</div></div>';
}

function insecureNotice() {
  return '<div style="min-height:100vh;display:grid;place-items:center;color:#8b9cba;font-family:system-ui,sans-serif"><div style="text-align:center;max-width:520px"><div style="width:46px;height:46px;border-radius:14px;margin:0 auto 14px;background:linear-gradient(140deg,#3ddc97,#8b7cf6)"></div><h1 style="color:#e9f0fb;font-size:22px">This page is not secure</h1><p style="margin-top:8px">Mezoteric needs HTTPS (or localhost) for encryption, camera and microphone. The node should be serving a self-signed certificate. Open <b style="color:#3ddc97">https://' + location.host + '</b> and accept the certificate warning.</p></div></div>';
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('/sw.js', { scope: '/' }); } catch {}
}

function updateNetStatus(s) {
  const dot = document.querySelector('.net-dot');
  if (!dot) return;
  dot.classList.toggle('offline', s === 'offline');
  dot.title = s === 'offline' ? 'Offline — messages will queue' : 'Connected to node';
}

// ---------- App shell ----------
class App {
  constructor() {
    this.railEl = document.getElementById('rail');
    this.sidebarEl = document.getElementById('sidebar');
    this.mainEl = document.getElementById('main');
    this.currentSection = 'dashboard';
    this.currentSub = '';

    // sidebar structure
    this.sidebarEl.innerHTML = '';
    this.sideHead = el('div', { class: 'side-head' }, el('h2', {}, 'Messages'));
    this.sideScroll = el('div', { class: 'side-scroll' });
    this.sidebarEl.append(this.sideHead, this.sideScroll);
  }

  navigateTo(route) {
    if (route.startsWith('#')) route = route.slice(1);
    if (route.startsWith('/')) route = route.slice(1);
    if (!route) route = 'dashboard';
    location.hash = route;
    // onHash will fire and render.
  }

  bindRouter() {
    window.addEventListener('hashchange', () => this.onHash());
    this.onHash();
  }

  onHash() {
    const h = (location.hash || '#dashboard').replace(/^#/, '');
    const parts = h.split('/').filter(Boolean);
    const section = parts[0] || 'dashboard';
    this.currentSection = section;

    // Highlight rail button
    this.railEl.querySelectorAll('.rail-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rail === section);
    });

    // Sidebar
    this.renderSidebar(section);

    // Main content
    const sub = parts.slice(1).join('/');
    this.renderMain(section, sub);
  }

  renderRail() {
    const rail = this.railEl;
    rail.innerHTML = '';
    rail.append(el('div', { class: 'brand' }, 'M'));

    const items = [
      { key: 'dashboard', label: 'Home', icon: 'home' },
      { key: 'chats', label: 'Chats', icon: 'chat' },
      { key: 'channels', label: 'Channels', icon: 'hash' },
      { key: 'streams', label: 'Streams', icon: 'video' },
      { key: 'shorts', label: 'Shorts', icon: 'play' },
      { key: 'school', label: 'School', icon: 'book' },
      { key: 'admin', label: 'Admin', icon: 'shield' },
    ];
    for (const item of items) {
      const btn = el('button', {
        class: 'rail-btn' + (item.key === this.currentSection ? ' active' : ''),
        'data-rail': item.key,
        title: item.label,
      }, iconHtml(item.icon), el('span', {}, item.label.toLowerCase()));
      btn.addEventListener('click', () => this.navigateTo(item.key));
      rail.append(btn);
    }

    // Settings + user at the bottom
    rail.append(el('div', { class: 'rail-foot' },
      el('button', { class: 'rail-btn', 'data-rail': 'settings', title: 'Settings', click: () => this.navigateTo('settings') },
        iconHtml('settings'), el('span', {}, 'settings')),
      el('div', { class: 'rail-user', style: 'margin-top:6px' },
        el('div', { class: 'avatar', style: '--av:#3ddc97;width:34px;height:34px;font-size:14px;cursor:pointer', title: (identity && identity.name) || '?', click: () => this.navigateTo('settings') },
          esc((identity && identity.name && identity.name[0] || '?').toUpperCase()))),
      el('div', { class: 'net-dot', title: 'Connected to node' }),
    ));
  }

  renderSidebar(section) {
    this.sideScroll.innerHTML = '';
    const titleMap = { dashboard: 'Home', chats: 'Messages', channels: 'Channels', streams: 'Streams', shorts: 'Shorts', school: 'School', admin: 'Admin', settings: 'Settings' };
    this.sideHead.querySelector('h2').textContent = titleMap[section] || 'Mezoteric';

    if (section === 'settings' || section === 'dashboard') return;

    let sidebarFn = null;
    switch (section) {
      case 'chats': sidebarFn = chatsSidebar; break;
      case 'channels': sidebarFn = channelsSidebar; break;
      case 'streams': sidebarFn = streamsSidebar; break;
      case 'shorts': sidebarFn = shortsSidebar; break;
      case 'school': sidebarFn = schoolSidebar; break;
      case 'admin': sidebarFn = adminSidebar; break;
    }
    if (sidebarFn && state) {
      try {
        const node = sidebarFn(state, this);
        if (node) this.sideScroll.append(node);
      } catch (err) { console.error('sidebar error', err); }
    }
  }

  renderMain(section, sub) {
    this.mainEl.innerHTML = '';
    this.currentSub = sub;
    let content = null;

    try {
      if (section === 'dashboard') {
        content = dashboardPage(state, this);
      } else if (section === 'chats') {
        content = sub ? this.dmConversation(sub) : this.chatsMain();
      } else if (section === 'channels') {
        if (sub === 'create') content = this.createChannelForm();
        else if (sub) content = this.channelConversation(sub);
        else content = this.channelsMain();
      } else if (section === 'streams') {
        if (sub === 'go-live') content = goLiveForm(state, this);
        else if (sub) content = watchStream(state, sub, this);
        else content = streamList(state, this);
      } else if (section === 'shorts') {
        content = sub === 'create' ? createShortForm(state, this) : shortsFeed(state, this);
      } else if (section === 'school') {
        if (sub === 'announcements') content = announcementsPage(state, this);
        else if (sub === 'announce') content = announceForm(state, this);
        else if (sub === 'notes') content = notesPage(state, this);
        else if (sub === 'report-cards') content = reportCardsPage(state, this);
        else if (sub === 'issue') content = issuePage(state, this);
        else content = this.schoolMain();
      } else if (section === 'admin') {
        if (sub === 'members') content = membersPage(state, this);
        else if (sub === 'requests') content = requestsPage(state, this);
        else if (sub === 'proposals') content = proposalsPage(state, this);
        else content = this.adminMain();
      } else if (section === 'settings') {
        content = settingsPage(state, this);
      }
    } catch (err) {
      console.error('render error', err);
      content = el('div', { class: 'page' }, el('div', { class: 'empty' },
        el('div', { class: 'empty-ico' }, iconHtml('info')), el('h3', {}, 'Something went wrong'), el('p', { class: 'muted' }, err.message || 'Unknown error')));
    }

    if (content) this.mainEl.append(content);
    else this.mainEl.innerHTML = emptyState('info', 'Nothing here yet', 'This section is empty.');
  }

  // ---------- section main views ----------
  chatsMain() {
    const convos = state ? state.sortedConvos() : [];
    if (!convos.length) {
      return el('div', { class: 'page' },
        el('div', { class: 'page-head' }, el('h1', {}, 'Messages'), el('p', { class: 'muted' }, 'Private, end-to-end encrypted conversations.')),
        el('div', { class: 'empty' },
          el('div', { class: 'empty-ico' }, iconHtml('chat')),
          el('h3', {}, 'No conversations yet'),
          el('p', {}, 'Select a person from the sidebar to start chatting. Messages are end-to-end encrypted.'),
        ),
      );
    }
    return el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h1', {}, 'Messages'), el('p', { class: 'muted' }, 'Private, end-to-end encrypted conversations.')),
      el('div', { class: 'card' },
        ...convos.map(c => el('div', { class: 'list-item', click: () => this.navigateTo('chats/' + c.userId) },
          avatar(c.name || c.userId, c.userId, 38),
          el('div', { class: 'li-main' },
            el('div', { class: 'li-top' }, el('span', { class: 'li-name' }, esc(c.name || c.userId)), el('span', { class: 'spacer' })),
            el('div', { class: 'li-sub' }, esc(c.lastText || 'Tap to start chatting')),
          ),
          el('div', { class: 'li-meta' },
            el('span', { class: 'time' }, c.ts ? fmtWhen(c.ts) : ''),
            c.unread > 0 ? el('span', { class: 'badge' }, c.unread) : '',
          ),
        )),
      ),
    );
  }

  dmConversation(peerId) {
    const name = state.nameOf(peerId);
    return conversationPane(state, {
      conv: 'dm:' + peerId,
      peerId,
      title: name,
      subtitle: 'End-to-end encrypted',
      send: async (text, files) => {
        const attachments = [];
        for (const f of files) attachments.push(await state.uploadAttachment(f));
        await state.sendDm(peerId, text, attachments);
        state.markRead('dm:' + peerId);
      },
    });
  }

  channelsMain() {
    const channels = state ? state.channelList() : [];
    const myChannels = state ? state.myChannels() : [];
    return el('div', { class: 'page' },
      el('div', { class: 'page-head' },
        el('h1', {}, 'Channels'),
        el('p', { class: 'muted' }, 'Slack-like spaces for classes, clubs and topics.'),
        el('div', { class: 'actions' },
          el('button', { class: 'btn primary sm', click: () => this.navigateTo('channels/create') }, iconHtml('plus'), 'New channel'),
        ),
      ),
      myChannels.length === 0 && channels.length === 0
        ? el('div', { class: 'empty' }, el('div', { class: 'empty-ico' }, iconHtml('hash')), el('h3', {}, 'No channels'), el('p', {}, 'Create a channel for a class, club or topic.' ))
        : el('div', {},
          myChannels.length > 0 ? el('div', {},
            el('div', { class: 'section-label' }, 'Your channels'),
            ...myChannels.map(ch => el('div', { class: 'list-item', click: () => this.navigateTo('channels/' + ch.id) },
              avatar(ch.name, 'c' + ch.id, 38),
              el('div', { class: 'li-main' },
                el('div', { class: 'li-top' }, el('span', { class: 'li-name' }, esc(ch.name)), el('span', { class: 'spacer' })),
                el('div', { class: 'li-sub' }, esc(ch.topic || 'No topic')),
              ),
            )),
          ) : '',
          channels.filter(c => !state.channelKeys.has(c.id)).length > 0 ? el('div', {},
            el('div', { class: 'section-label' }, 'Other channels'),
            ...channels.filter(c => !state.channelKeys.has(c.id)).map(ch => el('div', { class: 'list-item', click: () => this.navigateTo('channels/' + ch.id) },
              iconHtml('lock'),
              el('div', { class: 'li-main' },
                el('div', { class: 'li-top' }, el('span', { class: 'li-name' }, esc(ch.name)), el('span', { class: 'spacer' })),
                el('div', { class: 'li-sub' }, 'Ask the owner for an invite'),
              ),
            )),
          ) : '',
        ),
    );
  }

  channelConversation(channelId) {
    const ch = state.channels[channelId];
    if (!ch) return el('div', { class: 'page' }, el('div', { class: 'empty' }, el('h3', {}, 'Channel not found')));
    if (!state.channelKeys.has(channelId)) {
      return el('div', { class: 'page' },
        el('div', { class: 'empty' },
          el('div', { class: 'empty-ico' }, iconHtml('lock')),
          el('h3', {}, 'You need an invite'),
          el('p', {}, 'Ask the channel owner to invite you to ' + esc(ch.name) + '.'),
          el('button', { class: 'btn primary sm', style: 'margin-top:12px', click: async () => {
            try { await state.requestChannelKey(channelId); toast('Request sent', 'ok'); } catch (e) { toast(e.message, 'error'); }
          }}, 'Request access'),
        ),
      );
    }
    return conversationPane(state, {
      conv: 'ch:' + channelId,
      peerId: 'c' + channelId,
      title: ch.name,
      subtitle: ch.topic || 'Channel',
      send: async (text, files) => {
        const attachments = [];
        for (const f of files) attachments.push(await state.uploadAttachment(f));
        await state.sendChannelMessage(channelId, text, attachments);
        state.markRead('ch:' + channelId);
      },
    });
  }

  createChannelForm() {
    const dir = state.directoryList();
    return el('div', { class: 'page' },
      el('div', { class: 'page-head' },
        el('button', { class: 'icon-btn', click: () => this.navigateTo('channels') }, iconHtml('back')),
        el('h1', {}, 'Create channel'),
        el('p', { class: 'muted' }, 'A private space with its own encrypted key.'),
      ),
      el('div', { class: 'card' },
        el('div', { class: 'field' }, el('label', {}, 'Name'), el('input', { class: 'input', id: 'ch-name', placeholder: 'e.g. Physics 2025' })),
        el('div', { class: 'field' }, el('label', {}, 'Topic'), el('input', { class: 'input', id: 'ch-topic', placeholder: 'What this channel is about' })),
        el('div', { class: 'field' }, el('label', {}, 'Invite people'),
          el('div', { id: 'ch-invites', style: 'display:flex;flex-direction:column;gap:6px' },
            ...dir.slice(0, 20).map(u => el('label', { style: 'display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer' },
              el('input', { type: 'checkbox', value: u.userId, style: 'accent-color:var(--accent)' }),
              avatar(u.name, u.userId, 26), esc(u.name), roleBadge(u.role),
            )),
          ),
        ),
        el('button', { class: 'btn primary block', style: 'margin-top:10px', click: async () => {
          const name = document.getElementById('ch-name')?.value.trim();
          const topic = document.getElementById('ch-topic')?.value.trim() || '';
          if (!name) { toast('Enter a channel name', 'warn'); return; }
          const inviteIds = [...document.querySelectorAll('#ch-invites input:checked')].map(c => c.value);
          try {
            await state.createChannel(name, topic, inviteIds);
            toast('Channel created' + (inviteIds.length ? ' · ' + inviteIds.length + ' invited' : ''), 'ok');
            this.navigateTo('channels');
          } catch (e) { toast(e.message, 'error'); }
        }}, iconHtml('plus'), 'Create channel'),
      ),
    );
  }

  schoolMain() {
    const anns = state ? state.announcementList() : [];
    const notes = state ? state.docsOf('note') : [];
    const reports = state ? state.docsOf('report') : [];
    return el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h1', {}, 'School'), el('p', { class: 'muted' }, 'Announcements, notes, report cards and school life.')),
      el('div', { class: 'grid-2' },
        el('div', { class: 'card', click: () => this.navigateTo('school/announcements'), style: 'cursor:pointer' },
          el('div', { style: 'display:flex;align-items:center;gap:10px' }, iconHtml('news'), el('h3', {}, 'Announcements'), el('span', { class: 'spacer' }), el('span', { class: 'chip' }, anns.length + '')),
          el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px' }, 'Headlines and notices from admins.'),
        ),
        el('div', { class: 'card', click: () => this.navigateTo('school/notes'), style: 'cursor:pointer' },
          el('div', { style: 'display:flex;align-items:center;gap:10px' }, iconHtml('file'), el('h3', {}, 'Notes & files'), el('span', { class: 'spacer' }), el('span', { class: 'chip' }, notes.length + '')),
          el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px' }, 'Documents shared with you by teachers.'),
        ),
      ),
      el('div', { class: 'card', style: 'margin-top:14px', click: () => this.navigateTo('school/report-cards'), style: 'cursor:pointer' },
        el('div', { style: 'display:flex;align-items:center;gap:10px' }, iconHtml('star'), el('h3', {}, 'Report cards'), el('span', { class: 'spacer' }), el('span', { class: 'chip' }, reports.length + '')),
        el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px' }, 'Your academic results.'),
      ),
    );
  }

  adminMain() {
    const role = state ? state.role() : 'student';
    const members = state ? state.directoryList() : [];
    const requests = state ? state.pendingRequests() : [];
    const proposals = state ? state.activeProposals() : [];
    const isAdmin = role === 'admin';
    return el('div', { class: 'page' },
      el('div', { class: 'page-head' }, el('h1', {}, 'Admin'), el('p', { class: 'muted' }, 'Decentralized admin power — decisions need a majority.' )),
      isAdmin ? el('div', { class: 'inline-note', style: 'margin-bottom:14px' }, iconHtml('shield'), el('div', {}, el('p', {}, 'You are an admin. Propose role changes or announcements; other admins must co-sign.'))) :
      el('div', { class: 'inline-note warn', style: 'margin-bottom:14px' }, iconHtml('info'), el('div', {}, el('p', {}, 'You are not an admin. Ask an admin to promote you, or request a role.'))),
      el('div', { class: 'grid-2' },
        el('div', { class: 'card', click: () => this.navigateTo('admin/members'), style: 'cursor:pointer' },
          el('div', { style: 'display:flex;align-items:center;gap:10px' }, iconHtml('users'), el('h3', {}, 'Members'), el('span', { class: 'spacer' }), el('span', { class: 'chip' }, members.length + '')),
          el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px' }, 'People, roles and status.'),
        ),
        el('div', { class: 'card', click: () => this.navigateTo('admin/requests'), style: 'cursor:pointer' },
          el('div', { style: 'display:flex;align-items:center;gap:10px' }, iconHtml('check'), el('h3', {}, 'Role requests'), el('span', { class: 'spacer' }), el('span', { class: 'chip' }, requests.length + '')),
          el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px' }, 'People asking to be promoted.'),
        ),
      ),
      el('div', { class: 'card', style: 'margin-top:14px', click: () => this.navigateTo('admin/proposals'), style: 'cursor:pointer' },
        el('div', { style: 'display:flex;align-items:center;gap:10px' }, iconHtml('shield'), el('h3', {}, 'Proposals'), el('span', { class: 'spacer' }), el('span', { class: 'chip' }, proposals.length + '')),
        el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px' }, 'Decisions needing a majority of admins.'),
      ),
    );
  }

  // ---------- live updates ----------
  onStateChange() {
    // Re-render the current sidebar to update unread counts etc.
    this.renderSidebar(this.currentSection);
    // Update rail badges
    this.updateRailBadges();
    // List pages are cheap to redraw and must reflect new data; an open
    // conversation is not, because it manages its own scroll and composer.
    if (!this.isConversationView()) {
      if (this._rerenderQueued) return;
      this._rerenderQueued = true;
      requestAnimationFrame(() => {
        this._rerenderQueued = false;
        this.renderMain(this.currentSection, this.currentSub || '');
      });
    }
  }

  isConversationView() {
    const s = this.currentSection;
    const sub = this.currentSub || '';
    if (s === 'chats' && sub) return true;
    if (s === 'channels' && sub && sub !== 'create') return true;
    if (s === 'streams' && sub && sub !== 'go-live') return true;
    return false;
  }

  updateRailBadges() {
    if (!state) return;
    const total = state.totalUnread();
    const chatBtn = this.railEl.querySelector('[data-rail="chats"]');
    if (!chatBtn) return;
    let badge = chatBtn.querySelector('.count');
    if (total > 0) {
      if (!badge) { badge = el('span', { class: 'count' }); chatBtn.append(badge); }
      badge.textContent = total > 99 ? '99+' : total;
    } else if (badge) {
      badge.remove();
    }
  }
}

// ---------- icon helper (local SVG set for the shell) ----------
const SVG_PATHS = {
  home:'<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  chat:'<path d="M21 11.5a8.35 8.35 0 0 1-8.5 8.4 8.9 8.9 0 0 1-3.8-.8L3 21l1.9-5.2a8.3 8.3 0 0 1-1.4-4.6 8.4 8.4 0 0 1 8.5-8.4z"/>',
  hash:'<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  video:'<path d="m23 7-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  play:'<rect x="2" y="2" width="20" height="20" rx="5"/><path d="m10 8 6 4-6 4z"/>',
  book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  back:'<path d="M19 12H5M12 19l-7-7 7-7"/>',
  lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  news:'<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  star:'<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3L5.8 21 7 14.2 2 9.3l6.9-1z"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  close:'<path d="M18 6 6 18M6 6l12 12"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  send:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  clip:'<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
};

function iconHtml(name) {
  const body = SVG_PATHS[name] || SVG_PATHS.info;
  return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
}

// Kick off
boot().catch(err => { console.error(err); root.innerHTML = bootSplash('Boot error: ' + esc(err.message || err)); });