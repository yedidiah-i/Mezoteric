// Settings: profile, key backup/restore, peer node management, encryption info.
import { el, esc, icon, avatar, fmtTime, fmtDay, fmtWhen, toast, confirmBox, roleBadge } from '../ui/dom.js';
import { loadIdentity, saveIdentity, clearLocalAccount } from '../core/db.js';

let _ctx = null;

export function settingsPage(state, ctx) {
  _ctx = ctx;
  const me = state.me;
  const role = state.role ? state.role() : 'student';
  const wrap = el('div', { class: 'page' });
  wrap.append(
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('chats') }, icon('back')),
      el('h1', {}, 'Settings'),
      el('p', { class: 'muted' }, 'Your profile, keys, peer nodes and privacy.'),
    ),
  );

  // Profile summary card
  wrap.append(el('div', { class: 'card' },
    el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:12px' },
      avatar(me?.name || '?', me?.userId || '', 56),
      el('div', { style: 'flex:1' },
        el('h2', { style: 'font-size:17px;font-weight:650' }, esc(me?.name || 'No name')),
        el('p', { class: 'muted', style: 'font-size:12px;margin-top:2px' }, 'User ID: ' + esc(me?.userId || '?')),
        el('div', { style: 'margin-top:6px' }, roleBadge(role)),
      ),
    ),
  ));

  // Tabs
  const tabsBar = el('div', { class: 'tabs' });
  const tabContent = el('div', { id: 'settings-tab', style: 'padding-top:14px' });
  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'keys', label: 'Key backup' },
    { key: 'peers', label: 'Peer nodes' },
    { key: 'about', label: 'About encryption' },
  ];
  tabs.forEach(t => {
    const btn = el('button', { class: 'tab', click: () => {
      tabsBar.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabContent.innerHTML = '';
      tabContent.append(renderTab(t.key, state, ctx));
    }}, t.label);
    tabsBar.append(btn);
  });
  // Default to profile tab
  tabsBar.querySelector('.tab').classList.add('active');
  tabContent.append(renderTab('profile', state, ctx));

  wrap.append(tabsBar, tabContent);

  // Sign out button at the bottom
  wrap.append(el('div', { style: 'margin-top:18px' },
    el('button', { class: 'btn danger block', click: async () => {
      const ok = await confirmBox('Sign out', 'Your encrypted keys stay on this device. You will need to unlock them again with your passphrase.', 'Sign out');
      if (!ok) return;
      try { await state.signOut(); } catch {}
      location.reload();
    }}, icon('logout'), 'Sign out'),
  ));

  return wrap;
}

function renderTab(tab, state, ctx) {
  if (tab === 'profile') return profileTab(state, ctx);
  if (tab === 'keys') return keysTab(state, ctx);
  if (tab === 'peers') return peersTab(state, ctx);
  if (tab === 'about') return aboutTab();
  return el('div');
}

function profileTab(state, ctx) {
  const me = state.me;
  const wrap = el('div', { class: 'card' });
  wrap.append(
    el('h3', { style: 'margin-bottom:10px' }, 'Your profile'),
    el('div', { class: 'field' },
      el('label', {}, 'Display name'),
      el('input', { class: 'input', id: 's-name', value: me?.name || '', maxlength: 60, placeholder: 'Your name' }),
    ),
    el('button', { class: 'btn primary sm', click: async () => {
      const name = document.getElementById('s-name')?.value.trim();
      if (!name || name.length < 2) { toast('Name must be at least 2 characters', 'warn'); return; }
      try { await state.setDisplayName(name); toast('Name updated', 'ok'); }
      catch (e) { toast(e.message, 'error'); }
    }}, icon('check'), 'Save name'),
    el('div', { style: 'margin-top:14px;padding-top:14px;border-top:1px solid var(--line)' },
      el('h3', { style: 'font-size:13px;margin-bottom:8px' }, 'Claim a role'),
      el('p', { class: 'muted', style: 'font-size:12px;margin-bottom:10px' }, 'Students are auto-claimed. To become a teacher or admin, request the role and an admin will approve it.'),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        el('button', { class: 'btn sm', click: async () => {
          try { await state.requestRole('teacher'); toast('Requested teacher role - waiting for admin approval', 'ok'); }
          catch (e) { toast(e.message, 'error'); }
        }}, 'Request teacher'),
        el('button', { class: 'btn sm', click: async () => {
          try { await state.requestRole('admin'); toast('Requested admin role - waiting for approval', 'ok'); }
          catch (e) { toast(e.message, 'error'); }
        }}, 'Request admin'),
        el('button', { class: 'btn sm', click: async () => {
          try { await state.becomeGenesisAdmin(); toast('You are now the first admin', 'ok'); }
          catch (e) { toast(e.message, 'error'); }
        }}, 'Become first admin'),
      ),
    ),
  );
  return wrap;
}

function keysTab(state, ctx) {
  const me = state.me;
  const wrap = el('div', { class: 'card' });
  wrap.append(
    el('h3', { style: 'margin-bottom:6px' }, 'Key backup'),
    el('p', { class: 'muted', style: 'font-size:12px;margin-bottom:12px' }, 'Export an encrypted backup of your identity. Restore it on another device.'),
    el('div', { class: 'field' },
      el('label', {}, 'Backup passphrase'),
      el('input', { class: 'input', id: 's-bp', type: 'password', minlength: 6, placeholder: 'At least 6 characters' }),
    ),
    el('div', { class: 'field' },
      el('label', {}, 'Confirm passphrase'),
      el('input', { class: 'input', id: 's-bp2', type: 'password', minlength: 6, placeholder: 'Repeat' }),
    ),
    el('div', { id: 's-ke', class: 'error-text', style: 'margin-bottom:8px' }),
    el('button', { class: 'btn primary block', click: async () => {
      const p = document.getElementById('s-bp')?.value || '';
      const p2 = document.getElementById('s-bp2')?.value || '';
      const err = document.getElementById('s-ke');
      err.textContent = '';
      if (p.length < 6) { err.textContent = 'Passphrase too short'; return; }
      if (p !== p2) { err.textContent = 'Passphrases do not match'; return; }
      try {
        const blob = await state.exportEncryptedBackup(p);
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: 'mezoteric-backup-' + (me?.userId || 'id') + '.json' });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        toast('Backup exported - store it safely', 'ok');
      } catch (e) { err.textContent = e.message; }
    }}, icon('file'), 'Export encrypted backup'),
  );

  wrap.append(
    el('h3', { style: 'font-size:15px;margin:18px 0 6px' }, 'Restore from backup'),
    el('p', { class: 'muted', style: 'font-size:12px;margin-bottom:10px' }, 'Import keys from another device. This replaces your current identity.'),
    el('div', { class: 'field' },
      el('label', {}, 'Backup file'),
      el('input', { id: 's-rf', type: 'file', accept: 'application/json,.json' }),
    ),
    el('div', { class: 'field' },
      el('label', {}, '...or paste backup JSON'),
      el('textarea', { class: 'textarea', id: 's-rj', placeholder: '{"app":"mezoteric",...}', style: 'min-height:100px' }),
    ),
    el('div', { class: 'field' },
      el('label', {}, 'Backup passphrase'),
      el('input', { class: 'input', id: 's-rp', type: 'password', placeholder: 'Passphrase from the export' }),
    ),
    el('div', { id: 's-re', class: 'error-text', style: 'margin-bottom:8px' }),
    el('button', { class: 'btn primary block', click: async () => {
      const err = document.getElementById('s-re');
      err.textContent = '';
      const fileInput = document.getElementById('s-rf');
      const jsonInput = document.getElementById('s-rj');
      const passInput = document.getElementById('s-rp');
      let json = jsonInput?.value.trim() || '';
      if (!json && fileInput?.files?.[0]) json = await fileInput.files[0].text();
      if (!json) { err.textContent = 'Provide a backup file or paste JSON'; return; }
      let data;
      try { data = JSON.parse(json); } catch { err.textContent = 'Invalid JSON'; return; }
      if (!data.userId || !data.signPub) { err.textContent = 'Not a valid backup'; return; }
      const pass = passInput?.value || '';
      let keys;
      if (data.vault) {
        if (!pass) { err.textContent = 'Enter the backup passphrase'; return; }
        try { keys = await state.openBackupVault(pass, data.vault); } catch { err.textContent = 'Wrong passphrase'; return; }
      } else if (data.signPriv && data.ecdhPriv) {
        keys = { signPriv: data.signPriv, ecdhPriv: data.ecdhPriv };
      } else { err.textContent = 'Backup has no private keys'; return; }
      try {
        await state.importBackup(data, keys, pass);
        toast('Identity restored - reloading', 'ok');
        setTimeout(() => location.reload(), 800);
      } catch (e) { err.textContent = e.message; }
    }}, icon('download'), 'Restore and sign in'),
    el('p', { class: 'muted', style: 'font-size:11px;margin-top:10px' }, 'Only your device can read the backup. The server never sees your private keys.'),
  );
  return wrap;
}

async function peersTab(state, ctx) {
  const wrap = el('div', { class: 'card' });
  wrap.append(
    el('h3', { style: 'margin-bottom:6px' }, 'Peer nodes'),
    el('p', { class: 'muted', style: 'font-size:12px;margin-bottom:12px' }, 'Add other Mezoteric nodes on the LAN for resilience. Discovery is automatic on the same network.'),
    el('div', { class: 'field' },
      el('label', {}, 'Node IP address'),
      el('input', { class: 'input', id: 's-pa', placeholder: '192.168.1.50' }),
    ),
    el('div', { class: 'field' },
      el('label', {}, 'HTTP port'),
      el('input', { class: 'input', id: 's-pp', type: 'number', value: '3000', placeholder: '3000' }),
    ),
    el('div', { id: 's-pe', class: 'error-text', style: 'margin-bottom:8px' }),
    el('button', { class: 'btn primary block', click: async () => {
      const addr = document.getElementById('s-pa')?.value.trim();
      const port = parseInt(document.getElementById('s-pp')?.value) || 3000;
      const err = document.getElementById('s-pe');
      err.textContent = '';
      if (!addr) { err.textContent = 'Enter an IP address'; return; }
      try { await state.addPeer(addr, port, port); toast('Peer added: ' + addr, 'ok'); }
      catch (e) { err.textContent = e.message; }
    }}, icon('plus'), 'Add peer node'),
  );

  // List known peers
  try {
    const peers = await state.getPeers();
    if (peers && peers.length) {
      wrap.append(el('h3', { style: 'font-size:13px;margin:16px 0 8px' }, 'Known peers'));
      peers.forEach(p => {
        wrap.append(el('div', { class: 'key-row' },
          el('div', { style: 'flex:1' },
            el('p', { style: 'font-size:13px;font-weight:600' }, esc(p.addr) + ':' + esc(p.port)),
            el('p', { class: 'muted', style: 'font-size:11px' }, p.connected ? 'Connected' : 'Offline', ' - ', esc(p.via || 'manual')),
          ),
          p.connected ? el('span', { class: 'chip secure' }, 'Live') : el('span', { class: 'chip' }, 'Offline'),
        ));
      });
    }
  } catch {}

  return wrap;
}

function aboutTab() {
  return el('div', { class: 'card' },
    el('h3', { style: 'margin-bottom:8px' }, 'About the encryption'),
    el('p', { style: 'font-size:13.5px;color:#c9d5e8;line-height:1.6;margin-bottom:12px' },
      'Mezoteric is built so the node that relays messages does not need to be trusted. Every message, file, announcement and admin decision is signed and encrypted so only the intended recipient can read it.'),
    el('div', { class: 'inline-note' }, icon('lock'), el('div', {},
      el('p', { style: 'font-weight:600;margin:0 0 4px' }, 'How it works'),
      el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:#c9d5e8;line-height:1.7' },
        el('li', {}, 'Each device generates its own identity keys inside the browser. Nothing leaves until you choose.'),
        el('li', {}, 'Direct messages use AES-GCM with a shared ECDH secret. Only the two people can read them.'),
        el('li', {}, 'Channels have their own AES keys, distributed encrypted to each member.'),
        el('li', {}, 'Admin power is shared. Changes need a majority of elected admins to sign.'),
        el('li', {}, 'Files are encrypted before upload. The node stores only opaque blobs.'),
        el('li', {}, 'Everything is signed. Your browser verifies authenticity even if the node is offline.'),
      ),
    )),
    el('div', { class: 'inline-note warn', style: 'margin-top:14px' }, icon('info'), el('div', {},
      el('p', { style: 'font-weight:600;margin:0 0 4px' }, 'Important'),
      el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:#f0d6a4;line-height:1.7' },
        el('li', {}, 'Your passphrase only unlocks this device. Without a backup, it cannot be recovered.'),
        el('li', {}, 'The node can see who talks to whom and when, but cannot read message content.'),
        el('li', {}, 'On a public computer, sign out when done so others cannot use your identity.'),
      ),
    )),
    el('p', { class: 'muted', style: 'font-size:11px;margin-top:14px' }, 'Mezoteric - school life, encrypted, online or on the LAN.'),
  );
}