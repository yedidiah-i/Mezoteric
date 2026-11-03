// School life: announcements, notes, report cards.
//
// Documents (notes and report cards) are encrypted for their recipient before
// they leave the device, so the node only ever stores ciphertext. A teacher
// writes one, the student receives it on their phone — online or on the LAN.
import { el, esc, avatar, icon, fmtWhen, toast, emptyState } from '../ui/dom.js';
import { permissions } from '../core/authority.js';

export function sidebar(state, ctx) {
  const list = el('div');
  const items = [
    { label: 'Announcements', sub: 'News from the admins', route: 'school/announcements', ic: 'news' },
    { label: 'Notes', sub: 'Files shared with you', route: 'school/notes', ic: 'file' },
    { label: 'Report cards', sub: 'Your academic results', route: 'school/report-cards', ic: 'star' },
  ];
  list.append(el('div', { class: 'section-label' }, 'School'));
  for (const it of items) {
    list.append(el('div', { class: 'list-item', click: () => ctx.navigateTo(it.route) },
      icon(it.ic),
      el('div', { class: 'li-main' },
        el('div', { class: 'li-top' }, el('span', { class: 'li-name' }, it.label)),
        el('div', { class: 'li-sub' }, it.sub),
      ),
    ));
  }
  if (canIssue(state)) {
    list.append(el('div', { class: 'section-label', style: 'margin-top:14px' }, 'Teaching'));
    list.append(el('div', { class: 'list-item', click: () => ctx.navigateTo('school/issue') },
      icon('plus'),
      el('div', { class: 'li-main' },
        el('div', { class: 'li-top' }, el('span', { class: 'li-name' }, 'Issue a note or report card')),
        el('div', { class: 'li-sub' }, 'Encrypted straight to the student'),
      ),
    ));
  }
  return list;
}

function canIssue(state) {
  return permissions.issueReports(state.role());
}

// ---------- announcements ----------

export function announcementsPage(state, ctx) {
  const anns = state.announcementList();
  const role = state.role();
  const isAdmin = role === 'admin';

  const page = el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('school') }, icon('back')),
      el('div', {},
        el('h1', {}, 'Announcements'),
        el('p', { class: 'muted' }, 'Official notices. Announcements are approved by a majority of admins, and every one of them is signed.'),
      ),
      el('div', { class: 'actions' },
        isAdmin ? el('button', { class: 'btn primary sm', click: () => ctx.navigateTo('school/announce') }, icon('plus'), 'Propose announcement') : '',
      ),
    ),
  );

  if (!anns.length) {
    page.append(el('div', { class: 'empty' },
      el('div', { class: 'empty-ico' }, icon('news')),
      el('h3', {}, 'No announcements yet'),
      el('p', {}, 'Announcements appear here as soon as the admins agree on them.'),
    ));
    return page;
  }

  page.append(el('div', {}, ...anns.map(a => el('div', { class: 'card', style: 'margin-top:0;margin-bottom:12px' },
    el('div', { class: 'row' },
      el('div', { class: 'doc-ico', style: 'width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--accent-dim);color:var(--accent)' }, icon('news')),
      el('div', { style: 'flex:1;min-width:0' },
        el('div', { style: 'font-weight:650;font-size:15px' }, esc(a.title)),
        el('div', { class: 'muted', style: 'font-size:12px' },
          esc(a.byName || 'Admin') + ' · ' + fmtWhen(a.ts) + ' · ' + (a.approvals || []).length + ' admin signature(s)'),
      ),
      a.pinned ? el('span', { class: 'chip secure' }, 'Pinned') : '',
    ),
    el('p', { style: 'margin-top:10px;font-size:13.5px;white-space:pre-wrap' }, esc(a.body)),
  ))));

  return page;
}

/** Form for an admin to propose an announcement that other admins co-sign. */
export function announceForm(state, ctx) {
  const title = el('input', { class: 'input', id: 'an-title', placeholder: 'Headline' });
  const body = el('textarea', { class: 'textarea', id: 'an-body', rows: 5, placeholder: 'What should the school know?' });
  const pinned = el('input', { type: 'checkbox', style: 'accent-color:var(--accent)' });

  return el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('school/announcements') }, icon('back')),
      el('div', {},
        el('h1', {}, 'Propose an announcement'),
        el('p', { class: 'muted' }, 'Other admins have to co-sign before it goes live. You can still sign it yourself.'),
      ),
    ),
    el('div', { class: 'card' },
      el('div', { class: 'field' }, el('label', {}, 'Headline'), title),
      el('div', { class: 'field' }, el('label', {}, 'Body'), body),
      el('label', { class: 'row', style: 'gap:8px;font-size:13px;cursor:pointer;margin-bottom:12px' }, pinned, 'Pin to the top'),
      el('button', { class: 'btn primary block', click: async () => {
        const t = title.value.trim();
        const b = body.value.trim();
        if (!t || !b) { toast('A headline and a body are required', 'warn'); return; }
        try {
          await state.createAnnouncementNow(t, b, pinned.checked);
          toast('Announcement proposed. It goes live once enough admins sign.', 'ok');
          ctx.navigateTo('school/announcements');
        } catch (err) {
          toast(err.message || 'Could not propose the announcement', 'error');
        }
      } }, icon('plus'), 'Propose'),
    ),
  );
}

// ---------- notes ----------

export function notesPage(state, ctx) {
  const notes = state.docsOf('note');
  const page = el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('school') }, icon('back')),
      el('div', {},
        el('h1', {}, 'Notes & files'),
        el('p', { class: 'muted' }, 'Documents shared with you. They are encrypted for you — the node cannot read them.'),
      ),
      el('div', { class: 'actions' },
        canIssue(state) ? el('button', { class: 'btn primary sm', click: () => ctx.navigateTo('school/issue') }, icon('plus'), 'Issue a note') : '',
      ),
    ),
  );

  if (!notes.length) {
    page.append(el('div', { class: 'empty' },
      el('div', { class: 'empty-ico' }, icon('file')),
      el('h3', {}, 'No notes yet'),
      el('p', {}, 'Teachers share notes here. They arrive even when the internet is down.'),
    ));
    return page;
  }

  page.append(el('div', {}, ...notes.map(d => el('div', { class: 'doc-row' },
    el('div', { class: 'doc-ico' }, icon('file')),
    el('div', { style: 'flex:1;min-width:0' },
      el('div', { style: 'font-weight:600;font-size:13.5px' }, esc(d.title || 'Note')),
      el('div', { class: 'muted', style: 'font-size:12px' }, esc(d.byName || 'Unknown') + ' · ' + fmtWhen(d.ts)),
      d.body ? el('div', { style: 'font-size:12.5px;margin-top:4px;white-space:pre-wrap' }, esc(d.body)) : '',
    ),
    el('button', { class: 'btn sm ghost', click: async () => {
      try { await state.downloadDoc(d.id); } catch (e) { toast(e.message, 'error'); }
    } }, icon('download'), 'Save'),
  ))));

  return page;
}

// ---------- report cards ----------

export function reportCardsPage(state, ctx) {
  const reports = state.docsOf('report');
  const page = el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('school') }, icon('back')),
      el('div', {},
        el('h1', {}, 'Report cards'),
        el('p', { class: 'muted' }, 'Your academic results, delivered straight to you.'),
      ),
      el('div', { class: 'actions' },
        canIssue(state) ? el('button', { class: 'btn primary sm', click: () => ctx.navigateTo('school/issue') }, icon('plus'), 'Issue a report card') : '',
      ),
    ),
  );

  if (!reports.length) {
    page.append(el('div', { class: 'empty' },
      el('div', { class: 'empty-ico' }, icon('star')),
      el('h3', {}, 'No report cards yet'),
      el('p', {}, 'When a teacher publishes your report card it appears here, encrypted.'),
    ));
    return page;
  }

  for (const d of reports) {
    const rows = d.rows || [];
    page.append(el('div', { class: 'card report' },
      el('div', { class: 'report-head' },
        avatar(d.byName || 'Teacher', d.by, 38),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-weight:650;font-size:15px' }, esc(d.title || 'Report card')),
          el('div', { class: 'muted', style: 'font-size:12px' }, esc(d.byName || 'Teacher') + ' · ' + fmtWhen(d.ts)),
        ),
        el('button', { class: 'btn sm ghost', click: async () => {
          try { await state.downloadDoc(d.id); } catch (e) { toast(e.message, 'error'); }
        } }, icon('download'), 'Save'),
      ),
      d.body ? el('p', { style: 'margin-top:10px;font-size:13.5px;white-space:pre-wrap' }, esc(d.body)) : '',
      rows.length ? el('div', { class: 'table-wrap', style: 'margin-top:10px' },
        el('table', {},
          el('thead', {}, el('tr', {}, el('th', {}, 'Subject'), el('th', {}, 'Grade'), el('th', {}, 'Comment'))),
          el('tbody', {}, ...rows.map(r => el('tr', {},
            el('td', {}, esc(r.subject || '—')),
            el('td', { class: 'grade' }, esc(r.grade || '—')),
            el('td', { class: 'muted' }, esc(r.comment || '')),
          ))),
        ),
      ) : '',
    ));
  }

  return page;
}

// ---------- issuing documents ----------

export function issuePage(state, ctx) {
  if (!canIssue(state)) {
    return el('div', { class: 'page' }, el('div', { class: 'empty' },
      el('div', { class: 'empty-ico' }, icon('lock')),
      el('h3', {}, 'Only teachers can issue documents'),
      el('p', {}, 'Ask an admin to give your account the teacher role.'),
    ));
  }

  const students = state.membersList().filter(m => m.role === 'student');
  const kindSelect = el('select', { class: 'select', id: 'is-kind' },
    el('option', { value: 'note' }, 'Note / file'),
    el('option', { value: 'report' }, 'Report card'),
  );
  const toSelect = el('select', { class: 'select', id: 'is-to' },
    ...(students.length
      ? students.map(s => el('option', { value: s.userId }, esc(s.name)))
      : [el('option', { value: '' }, 'No students found on the mesh')]),
  );
  const title = el('input', { class: 'input', id: 'is-title', placeholder: 'e.g. Term 1 Report Card' });
  const body = el('textarea', { class: 'textarea', id: 'is-body', rows: 4, placeholder: 'Message for the student' });

  const rowsWrap = el('div', { style: 'display:none' });
  const rows = [];
  const addRow = (r) => {
    rows.push(r);
    rowsWrap.append(el('div', { class: 'row', style: 'gap:8px;margin-bottom:7px' },
      el('input', { class: 'input', placeholder: 'Subject', value: r.subject || '', oninput: e => { r.subject = e.target.value; } }),
      el('input', { class: 'input', placeholder: 'Grade', value: r.grade || '', style: 'max-width:110px', oninput: e => { r.grade = e.target.value; } }),
      el('input', { class: 'input', placeholder: 'Comment', value: r.comment || '', oninput: e => { r.comment = e.target.value; } }),
    ));
  };
  addRow({});
  rowsWrap.append(el('button', { class: 'btn sm', click: () => addRow({}) }, icon('plus'), 'Add subject'));

  kindSelect.addEventListener('change', () => {
    rowsWrap.style.display = kindSelect.value === 'report' ? '' : 'none';
  });

  return el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('school') }, icon('back')),
      el('div', {},
        el('h1', {}, 'Issue a document'),
        el('p', { class: 'muted' }, 'Encrypted for the student on this device. The node never sees the content.'),
      ),
    ),
    el('div', { class: 'card' },
      el('div', { class: 'field' }, el('label', {}, 'Type'), kindSelect),
      el('div', { class: 'field' }, el('label', {}, 'Student'), toSelect),
      el('div', { class: 'field' }, el('label', {}, 'Title'), title),
      el('div', { class: 'field' }, el('label', {}, 'Message'), body),
      el('div', { class: 'field' }, el('label', {}, 'Subjects'), rowsWrap),
      el('button', { class: 'btn primary block', click: async () => {
        const to = toSelect.value;
        if (!to) { toast('Choose a student', 'warn'); return; }
        const t = title.value.trim();
        if (!t) { toast('Give the document a title', 'warn'); return; }
        const kind = kindSelect.value;
        const docBody = {
          title: t,
          body: body.value.trim(),
          rows: kind === 'report' ? rows.filter(r => r.subject || r.grade) : [],
        };
        try {
          await state.issueDoc({ kind, to, body: docBody });
          toast(kind === 'report' ? 'Report card sent' : 'Note sent', 'ok');
          ctx.navigateTo('school');
        } catch (err) {
          toast(err.message || 'Could not send the document', 'error');
        }
      } }, icon('send'), 'Send to student'),
    ),
  );
}
