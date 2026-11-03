// Role-aware dashboards.
//
// One screen, shaped by what the signed role of this user actually is:
// a student sees their own results and messages, a teacher sees who they can
// write reports for, an admin sees what still needs their signature. The
// role comes from the verified role map, never from the node.

import { el, esc, avatar, avatarEl, roleBadge, roleBadgeEl, icon, fmtWhen, toast } from '../ui/dom.js';

const ROLE_TITLES = {
  admin: 'Admin dashboard',
  teacher: 'Teacher dashboard',
  staff: 'Staff dashboard',
  student: 'Student dashboard',
  guest: 'Welcome',
};

export function dashboardPage(state, ctx) {
  if (!state || !state.me) return el('div', { class: 'page' });
  const role = state.role();
  const s = state.dashboardStats();
  const name = state.me.name || 'there';

  const page = el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', {}, ROLE_TITLES[role] || 'Dashboard'),
        el('p', { class: 'muted' }, 'Signed in as ' + esc(name) + ' · ' + (role === 'guest' ? 'role not verified yet' : 'verified ' + role)),
      ),
      el('div', { class: 'actions' },
        roleBadgeEl(role),
        el('button', { class: 'btn sm', click: () => ctx.navigateTo('school/announcements') }, icon('news'), 'Announcements'),
      ),
    ),
  );

  // ---- numbers that matter for this role ----
  const tiles = [];
  if (role === 'student') {
    tiles.push(
      stat('Notes', s.myNotes, 'shared with you'),
      stat('Report cards', s.myReports, 'in your record'),
      stat('Unread', s.unread, 'messages waiting'),
      stat('Channels', s.myChannels, 'you are in'),
    );
  } else if (role === 'teacher' || role === 'staff') {
    tiles.push(
      stat('Students', s.students, 'on the mesh'),
      stat('Teachers', s.teachers, 'colleagues'),
      stat('Channels', s.myChannels, 'you lead'),
      stat('Live now', s.streamsLive, 'streams running'),
    );
  } else if (role === 'admin') {
    tiles.push(
      stat('Admins', s.admins, 'share the power'),
      stat('Open proposals', s.openProposals, 'need signatures'),
      stat('Role requests', s.pendingRequests, 'waiting'),
      stat('People', s.people, 'on the mesh'),
    );
  } else {
    tiles.push(
      stat('People', s.people, 'on the mesh'),
      stat('Channels', s.channels, 'known to you'),
      stat('Live now', s.streamsLive, 'streams running'),
      stat('Shorts', s.shorts, 'published'),
    );
  }
  page.append(el('div', { class: 'grid-3', style: 'margin-bottom:18px' }, ...tiles.map(t => t)));

  // ---- role specific content ----
  if (role === 'admin') page.append(adminPanel(state, ctx));
  else if (role === 'teacher' || role === 'staff') page.append(teacherPanel(state, ctx));
  else page.append(studentPanel(state, ctx));

  return page;
}

function stat(label, value, hint) {
  const node = el('div', { class: 'stat' },
    el('div', { class: 'n' }, String(value ?? 0)),
    el('div', { class: 'l' }, label),
  );
  if (hint) node.append(el('div', { class: 'l', style: 'text-transform:none;letter-spacing:0;opacity:.65;margin-top:2px' }, hint));
  return node;
}

// ---------- student ----------

function studentPanel(state, ctx) {
  const wrap = el('div', { class: 'split' });
  const main = el('div');
  const side = el('div');

  const notes = state.docsOf('note').slice(0, 6);
  const reports = state.docsOf('report').slice(0, 6);
  const anns = state.announcementList().slice(0, 5);

  main.append(el('div', { class: 'card' },
    el('div', { class: 'row' }, el('h3', {}, 'Your results'), el('span', { class: 'spacer' }),
      el('button', { class: 'btn sm ghost', click: () => ctx.navigateTo('school/report-cards') }, 'All report cards')),
    notes.length || reports.length
      ? el('div', { style: 'margin-top:10px' },
        ...[...reports, ...notes].slice(0, 6).map(d => docRow(d, state, ctx)))
      : el('p', { class: 'muted', style: 'margin-top:8px' }, 'No notes or report cards yet. Teachers send them straight to you, encrypted.'),
  ));

  const live = state.liveStreams().slice(0, 4);
  if (live.length) {
    main.append(el('div', { class: 'card' },
      el('div', { class: 'row' }, el('h3', {}, 'Live right now'), el('span', { class: 'spacer' }),
        el('button', { class: 'btn sm ghost', click: () => ctx.navigateTo('streams') }, 'Open hub')),
      el('div', { class: 'grid-2', style: 'margin-top:10px' },
        ...live.map(s => el('div', { class: 'doc-row', style: 'cursor:pointer', click: () => ctx.navigateTo('streams/' + s.id) },
          el('div', { class: 'doc-ico' }, icon('video')),
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { style: 'font-weight:600;font-size:13.5px' }, esc(s.title || 'Untitled stream')),
            el('div', { class: 'muted', style: 'font-size:12px' }, esc(state.nameOf(s.by)) + ' · ' + (s.visibility === 'class' ? 'Class' : 'Public')),
          ),
          el('span', { class: 'chip live' }, 'LIVE'),
        )),
      ),
    ));
  }

  side.append(el('div', { class: 'card' },
    el('h3', {}, 'Announcements'),
    anns.length
      ? el('div', { style: 'margin-top:8px' }, ...anns.map(a => el('div', { class: 'doc-row' },
        el('div', { class: 'doc-ico' }, icon('news')),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-weight:600;font-size:13.5px' }, esc(a.title)),
          el('div', { class: 'muted', style: 'font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, esc(a.body)),
        ),
        a.pinned ? el('span', { class: 'chip' }, 'Pinned') : '',
      )))
      : el('p', { class: 'muted', style: 'margin-top:8px' }, 'Nothing announced yet.'),
  ));

  side.append(el('div', { class: 'card' },
    el('h3', {}, 'Your channels'),
    state.myChannels().length
      ? el('div', { style: 'margin-top:6px' }, ...state.myChannels().map(c => el('div', { class: 'list-item', click: () => ctx.navigateTo('channels/' + c.id) },
        el('div', { class: 'li-main' }, el('div', { class: 'li-name' }, esc(c.name))), icon('hash'))))
      : el('p', { class: 'muted', style: 'margin-top:8px' }, 'You have not joined any channel yet.'),
  ));

  wrap.append(main, side);
  return wrap;
}

// ---------- teacher / staff ----------

function teacherPanel(state, ctx) {
  const wrap = el('div', { class: 'split' });
  const main = el('div');
  const side = el('div');

  const students = state.membersList().filter(m => m.role === 'student');
  const myChannels = state.myChannels();

  main.append(el('div', { class: 'card' },
    el('div', { class: 'row' }, el('h3', {}, 'Issue a note or report card'), el('span', { class: 'spacer' }),
      el('button', { class: 'btn primary sm', click: () => ctx.navigateTo('school/issue') }, icon('plus'), 'Issue')),
    el('p', { class: 'muted', style: 'margin-top:6px' },
      'Documents are encrypted for the recipient before they leave this device. The node only ever holds ciphertext.'),
    el('div', { class: 'row', style: 'margin-top:10px;flex-wrap:wrap' },
      ...students.slice(0, 12).map(m => el('div', { class: 'row', style: 'gap:6px' },
        avatarEl(m.name, m.userId, 26),
        el('span', { style: 'font-size:12.5px' }, esc(m.name)),
      )),
      students.length > 12 ? el('span', { class: 'muted', style: 'font-size:12px' }, '+' + (students.length - 12) + ' more') : '',
    ),
  ));

  main.append(el('div', { class: 'card' },
    el('h3', {}, 'Your channels'),
    myChannels.length
      ? el('div', { class: 'table-wrap', style: 'margin-top:8px' },
        el('table', { class: 'data' },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Channel'), el('th', {}, 'Topic'), el('th', {}, 'Members'), el('th', {}, ''))),
          el('tbody', {}, ...myChannels.map(c => el('tr', {},
            el('td', {}, el('strong', {}, esc(c.name))),
            el('td', { class: 'muted' }, esc(c.topic || '—')),
            el('td', {}, String((c.members || []).length)),
            el('td', {}, el('button', { class: 'btn sm ghost', click: () => ctx.navigateTo('channels/' + c.id) }, 'Open')),
          ))),
        ))
      : el('p', { class: 'muted', style: 'margin-top:8px' }, 'You have not created any channels yet.'),
  ));

  const anns = state.announcementList().slice(0, 5);
  side.append(el('div', { class: 'card' },
    el('h3', {}, 'Latest announcements'),
    anns.length
      ? el('div', { style: 'margin-top:8px' }, ...anns.map(a => el('div', { class: 'doc-row' },
        el('div', { class: 'doc-ico' }, icon('news')),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-weight:600;font-size:13.5px' }, esc(a.title)),
          el('div', { class: 'muted', style: 'font-size:11.5px' }, fmtWhen(a.ts)),
        ),
      )))
      : el('p', { class: 'muted', style: 'margin-top:8px' }, 'Nothing announced yet.'),
  ));

  const live = state.liveStreams().filter(s => s.visibility === 'class');
  side.append(el('div', { class: 'card' },
    el('h3', {}, 'Class streams'),
    live.length
      ? el('div', { style: 'margin-top:6px' }, ...live.map(s => el('div', { class: 'list-item', click: () => ctx.navigateTo('streams/' + s.id) },
        el('div', { class: 'li-main' }, el('div', { class: 'li-name' }, esc(s.title || 'Untitled'))),
        el('span', { class: 'chip live' }, 'LIVE'))))
      : el('p', { class: 'muted', style: 'margin-top:8px' }, 'No class streams are running.'),
  ));

  wrap.append(main, side);
  return wrap;
}

// ---------- admin ----------

function adminPanel(state, ctx) {
  const wrap = el('div', { class: 'split' });
  const main = el('div');
  const side = el('div');

  const proposals = state.allProposals();
  const waiting = proposals.filter(p => p.status === 'pending');
  const mine = waiting.filter(p => !(p.approvals || []).some(a => a.admin === state.me.userId));

  main.append(el('div', { class: 'card' },
    el('div', { class: 'row' }, el('h3', {}, 'Waiting for your signature'), el('span', { class: 'spacer' }),
      el('button', { class: 'btn sm ghost', click: () => ctx.navigateTo('admin/proposals') }, 'All proposals')),
    mine.length
      ? el('div', { style: 'margin-top:8px' }, ...mine.slice(0, 5).map(p => proposalRow(p, state, ctx)))
      : el('p', { class: 'muted', style: 'margin-top:8px' }, 'Nothing needs your signature right now.'),
  ));

  const requests = state.allRequests().filter(r => !r.decided);
  side.append(el('div', { class: 'card' },
    el('h3', {}, 'Role requests'),
    requests.length
      ? el('div', { style: 'margin-top:6px' }, ...requests.slice(0, 6).map(r => el('div', { class: 'doc-row' },
        el('div', { class: 'doc-ico' }, icon('users')),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-weight:600;font-size:13.5px' }, esc(r.name)),
          el('div', { class: 'muted', style: 'font-size:12px' }, 'wants ' + esc(r.wantRole)),
        ),
      )))
      : el('p', { class: 'muted', style: 'margin-top:8px' }, 'No pending role requests.'),
    el('button', { class: 'btn sm block', style: 'margin-top:10px', click: () => ctx.navigateTo('admin/requests') }, 'Review requests'),
  ));

  const admins = state.admins.map(id => state.nameOf(id));
  side.append(el('div', { class: 'card' },
    el('h3', {}, 'Who holds admin power'),
    el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:4px' },
      'Every decision needs a majority of these people. One veto stops it.'),
    el('div', { style: 'margin-top:8px' }, ...admins.map((n, i) => el('div', { class: 'row', style: 'gap:8px;padding:5px 0' },
      avatarEl(n, admins[i], 26), el('span', { style: 'font-size:13px' }, esc(n))))),
  ));

  wrap.append(main, side);
  return wrap;
}

// ---------- shared bits ----------

export function docRow(d, state, ctx) {
  const isReport = d.kind === 'report';
  return el('div', { class: 'doc-row', style: 'cursor:pointer', click: () => ctx.navigateTo('school/' + (isReport ? 'report-cards' : 'notes')) },
    el('div', { class: 'doc-ico' }, icon(isReport ? 'star' : 'file')),
    el('div', { style: 'flex:1;min-width:0' },
      el('div', { style: 'font-weight:600;font-size:13.5px' }, esc(d.title || (isReport ? 'Report card' : 'Note'))),
      el('div', { class: 'muted', style: 'font-size:11.5px' },
        esc(d.byName || 'Unknown') + ' · ' + fmtWhen(d.ts)),
    ),
    isReport && d.rows && d.rows.length ? el('span', { class: 'chip' }, d.rows.length + ' subjects') : '',
  );
}

export function proposalRow(p, state, ctx) {
  const title = p.kind === 'set-role'
    ? 'Set ' + state.nameOf(p.payload.userId) + ' as ' + p.payload.role
    : 'Announce: ' + (p.payload.title || 'Untitled');
  const need = p.need || 1;
  const have = p.have || 0;
  const mine = (p.approvals || []).some(a => a.admin === state.me.userId);
  const vetoed = p.status === 'vetoed';

  const head = el('div', { class: 'p-head' },
    el('strong', { style: 'font-size:13.5px' }, esc(title)),
    el('span', { class: 'spacer' }),
    p.kind === 'set-role' ? el('span', { class: 'chip' }, 'Role') : el('span', { class: 'chip' }, 'Announcement'),
    vetoed ? el('span', { class: 'chip warn' }, 'Vetoed')
      : p.status === 'approved' ? el('span', { class: 'chip secure' }, 'Approved')
      : el('span', { class: 'chip' }, have + '/' + need + ' signed'),
  );

  const body = el('div', { class: 'proposal' }, head,
    el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px' },
      'Proposed by ' + esc(p.proposerName || 'someone') + ' · ' + fmtWhen(p.ts)),
    el('div', { class: 'progress' }, el('div', { style: 'width:' + Math.min(100, Math.round((have / Math.max(1, need)) * 100)) + '%' })),
    el('div', { class: 'approvals' },
      ...(p.approvals || []).map(a => el('div', { class: 'approver' }, icon('check'), esc(state.nameOf(a.admin)))),
      ...(p.vetoes || []).map(v => el('div', { class: 'approver', style: 'background:rgba(255,107,122,.12);color:#ff8a96' }, icon('close'), esc(state.nameOf(v.admin)) + ' vetoed')),
    ),
  );

  if (!vetoed && p.status === 'pending' && !mine) {
    body.append(el('div', { class: 'row', style: 'margin-top:10px' },
      el('button', { class: 'btn primary sm', click: async () => {
        try { await state.approveProposal(p); toast('Signed. ' + (have + 1) + '/' + need + ' approvals', 'ok'); ctx.onStateChange?.(); }
        catch (e) { toast(e.message, 'error'); }
      } }, icon('check'), 'Co-sign'),
      el('button', { class: 'btn danger sm', click: async () => {
        try { await state.vetoProposal(p); toast('Proposal vetoed', 'ok'); ctx.onStateChange?.(); }
        catch (e) { toast(e.message, 'error'); }
      } }, icon('close'), 'Veto'),
    ));
  } else if (p.status === 'pending' && mine) {
    body.append(el('div', { class: 'muted', style: 'font-size:12px;margin-top:10px' }, 'You already signed this proposal.'));
  }

  return body;
}
