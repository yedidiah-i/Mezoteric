// The admin panel.
//
// Power is deliberately not concentrated. A role change or an announcement
// becomes a proposal; it only takes effect once a majority of the elected
// admins have co-signed it, and a single admin can veto it outright. The
// node applies the same rule — it is a helper, not the authority.
//
// The first person on a fresh mesh can claim the genesis admin role; from
// then on the panel is shared.
import { el, esc, avatar, avatarEl, roleBadge, roleBadgeEl, icon, fmtWhen, toast } from '../ui/dom.js';
import { proposalRow } from './dashboard.js';

export function adminSidebar(state, ctx) {
  const list = el('div');
  const isAdmin = state.role() === 'admin';
  const requests = state.allRequests().filter(r => !r.decided);
  const proposals = state.allProposals().filter(p => p.status === 'pending');

  list.append(el('div', { class: 'section-label' }, 'Panel'));
  list.append(navItem(ctx, 'school/announcements', 'news', 'Announcements', 'Post school-wide notices'));
  list.append(navItem(ctx, 'admin/members', 'users', 'Members', 'People, roles and status'));
  list.append(navItem(ctx, 'admin/requests', 'check', 'Role requests', requests.length ? requests.length + ' waiting' : 'People asking to be promoted'));
  list.append(navItem(ctx, 'admin/proposals', 'shield', 'Proposals', proposals.length ? proposals.length + ' open' : 'Decisions needing signatures'));

  if (state.admins.length === 0) {
    list.append(el('div', { class: 'section-label', style: 'margin-top:14px' }, 'First admin'));
    list.append(el('button', {
      class: 'btn primary block', style: 'margin-top:4px',
      click: async () => {
        try {
          await state.becomeGenesisAdmin();
          toast('You are now the first admin. Share the power by adding others.', 'ok');
          ctx.onStateChange?.();
        } catch (err) {
          toast(err.message || 'Could not claim the first admin role', 'error');
        }
      },
    }, icon('shield'), 'Become the first admin'));
  } else if (isAdmin) {
    list.append(el('div', { class: 'section-label', style: 'margin-top:14px' }, 'Admins'));
    list.append(el('div', { style: 'padding:4px 6px' },
      ...state.admins.map(id => el('div', { class: 'row', style: 'gap:8px;padding:4px 0' },
        avatarEl(state.nameOf(id), id, 24),
        el('span', { style: 'font-size:12.5px' }, esc(state.nameOf(id))),
        id === state.me.userId ? el('span', { class: 'chip' }, 'you') : '',
      )),
    ));
  } else {
    list.append(el('div', { class: 'section-label', style: 'margin-top:14px' }, 'Admins'));
    list.append(el('div', { style: 'padding:4px 6px' },
      ...state.admins.map(id => el('div', { class: 'row', style: 'gap:8px;padding:4px 0' },
        avatarEl(state.nameOf(id), id, 24),
        el('span', { style: 'font-size:12.5px' }, esc(state.nameOf(id))),
      )),
      el('button', { class: 'btn sm block', style: 'margin-top:8px', click: async () => {
        try { await state.requestRole('admin'); toast('Request sent to the admins', 'ok'); ctx.onStateChange?.(); }
        catch (e) { toast(e.message, 'error'); }
      } }, 'Request admin rights'),
    ));
  }

  return list;
}

function navItem(ctx, route, ic, label, sub) {
  return el('div', { class: 'list-item', click: () => ctx.navigateTo(route) },
    icon(ic),
    el('div', { class: 'li-main' },
      el('div', { class: 'li-top' }, el('span', { class: 'li-name' }, label)),
      el('div', { class: 'li-sub' }, sub),
    ),
  );
}

// ---------- members ----------

export function membersPage(state, ctx) {
  const members = state.membersList();
  const isAdmin = state.role() === 'admin';

  const page = el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('admin') }, icon('back')),
      el('div', {},
        el('h1', {}, 'Members'),
        el('p', { class: 'muted' }, 'Everyone who has joined this mesh, with the role their signatures prove.'),
      ),
    ),
  );

  page.append(el('div', { class: 'card card-flush' },
    el('div', { class: 'table-wrap' },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Person'), el('th', {}, 'Role'), el('th', {}, 'Signed in'), el('th', {}, ''),
        )),
        el('tbody', {}, ...members.map(m => el('tr', {},
          el('td', {}, el('div', { class: 'row', style: 'gap:9px' },
            avatarEl(m.name, m.userId, 30),
            el('div', {},
              el('div', { style: 'font-weight:600' }, esc(m.name)),
              el('div', { class: 'muted mono', style: 'font-size:11px' }, esc(m.userId)),
            ),
          )),
          el('td', {}, roleBadgeEl(m.role)),
          el('td', { class: 'muted' }, fmtWhen(m.ts)),
          el('td', {}, isAdmin && !m.mine ? el('button', { class: 'btn sm ghost', click: () => proposeRoleForm(state, ctx, m) }, 'Change role') : ''),
        ))),
      ),
    ),
  ));

  // Slot where the "change role" form is inserted.
  page.append(el('div', { id: 'role-propose-slot' }));

  return page;
}

function proposeRoleForm(state, ctx, member) {
  const select = el('select', { class: 'select' },
    ...['student', 'teacher', 'staff', 'admin', 'suspended'].map(r =>
      el('option', { value: r, selected: member.role === r ? 'selected' : null }, r)),
  );
  const card = el('div', { class: 'card', style: 'margin-top:12px' },
    el('h3', {}, 'Propose a role for ' + esc(member.name)),
    el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:4px' },
      'This creates a proposal. It only applies once a majority of admins co-sign it.'),
    el('div', { class: 'field', style: 'margin-top:10px' }, el('label', {}, 'New role'), select),
    el('div', { class: 'row', style: 'gap:8px' },
      el('button', { class: 'btn primary sm', click: async () => {
        try {
          await state.proposeSetRole(member.userId, select.value);
          toast('Proposal created. Other admins must co-sign it.', 'ok');
          ctx.navigateTo('admin/proposals');
        } catch (e) { toast(e.message, 'error'); }
      } }, 'Propose'),
      el('button', { class: 'btn sm ghost', click: () => card.remove() }, 'Cancel'),
    ),
  );
  const holder = document.getElementById('role-propose-slot');
  if (holder) holder.innerHTML = '';
  holder.append(card);
}

// ---------- role requests ----------

export function requestsPage(state, ctx) {
  const requests = state.allRequests();
  const isAdmin = state.role() === 'admin';

  const page = el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('admin') }, icon('back')),
      el('div', {},
        el('h1', {}, 'Role requests'),
        el('p', { class: 'muted' }, 'People asking to be given a role. An admin has to propose it and the rest have to agree.'),
      ),
    ),
  );

  if (!requests.length) {
    page.append(el('div', { class: 'empty' },
      el('div', { class: 'empty-ico' }, icon('check')),
      el('h3', {}, 'No requests'),
      el('p', {}, 'Nobody has asked for a role change.'),
    ));
    return page;
  }

  page.append(el('div', {}, ...requests.map(r => el('div', { class: 'doc-row' },
    el('div', { class: 'doc-ico' }, icon('users')),
    el('div', { style: 'flex:1;min-width:0' },
      el('div', { style: 'font-weight:600;font-size:13.5px' }, esc(r.name)),
      el('div', { class: 'muted', style: 'font-size:12px' },
        'wants ' + esc(r.wantRole) + ' · currently ' + esc(r.currentRole) + ' · ' + fmtWhen(r.ts)),
    ),
    r.decided
      ? el('span', { class: 'chip secure' }, 'Decided')
      : isAdmin
        ? el('button', { class: 'btn primary sm', click: async () => {
            try {
              await state.proposeSetRole(r.userId, r.wantRole);
              toast('Proposal created for ' + r.name, 'ok');
              ctx.navigateTo('admin/proposals');
            } catch (e) { toast(e.message, 'error'); }
          } }, 'Propose ' + r.wantRole)
        : el('span', { class: 'chip' }, 'Waiting'),
  ))));

  return page;
}

// ---------- proposals ----------

export function proposalsPage(state, ctx) {
  const proposals = state.allProposals();
  const isAdmin = state.role() === 'admin';

  const page = el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('admin') }, icon('back')),
      el('div', {},
        el('h1', {}, 'Proposals'),
        el('p', { class: 'muted' }, 'Every decision that the admins have to agree on. ' +
          'A proposal needs a majority of admins to co-sign; one veto stops it completely.'),
      ),
    ),
  );

  if (!proposals.length) {
    page.append(el('div', { class: 'empty' },
      el('div', { class: 'empty-ico' }, icon('shield')),
      el('h3', {}, 'No proposals'),
      el('p', {}, 'Nothing is waiting for a decision right now.'),
    ));
    return page;
  }

  page.append(el('div', {}, ...proposals.map(p => proposalRow(p, state, ctx))));

  if (!isAdmin) {
    page.append(el('div', { class: 'inline-note', style: 'margin-top:14px' },
      icon('info'),
      el('div', {}, el('p', {}, 'Only admins can sign or veto. You can still watch how decisions are made.')),
    ));
  }

  return page;
}
