// Identity onboarding: create a device-owned keypair, unlock it, or restore an
// encrypted backup. The passphrase only ever guards keys stored on this device.
import { generateIdentity, sealVault, openVault, randomId } from '../core/crypto.js';
import { loadIdentity, saveIdentity, clearLocalAccount } from '../core/db.js';
import { esc, icon, toast, confirmBox } from '../ui/dom.js';

const ART = `
  <div class="auth-art">
    <div class="auth-brand">
      <div class="brand">M</div>
      <div>Mezoteric<small style="display:block;letter-spacing:.14em;font-size:10px;color:#8b9cba;text-transform:uppercase">school network</small></div>
    </div>
    <div>
      <h1>School life,<br>encrypted,<br>online or offline.</h1>
      <p class="lede" style="margin-top:16px">
        Messages, classes, live streams and report cards on one private network.
        When the internet drops, the school LAN keeps working.
      </p>
    </div>
    <div class="auth-points">
      <div class="auth-point">${icon('lock')}<div><b>End-to-end by default</b><p>Keys are generated on your device. The node only relays ciphertext.</p></div></div>
      <div class="auth-point">${icon('wifi')}<div><b>Built for the school LAN</b><p>No internet needed for chat, files, announcements or streams.</p></div></div>
      <div class="auth-point">${icon('shield')}<div><b>Shared admin power</b><p>Decisions need a majority of elected admins, not one superuser.</p></div></div>
    </div>
  </div>
`;

export async function renderAuth(root, { onUnlocked }) {
  const existing = await loadIdentity();
  const mode = existing ? 'unlock' : 'create';

  root.innerHTML = `
    <div class="auth">
      ${ART}
      <div class="auth-form">
        <div id="auth-body"></div>
      </div>
    </div>
  `;
  const body = root.querySelector('#auth-body');

  const paint = () => {
    if (mode === 'create') body.innerHTML = createPane();
    else if (mode === 'restore') body.innerHTML = restorePane();
    else body.innerHTML = unlockPane(existing);
  };

  const createPane = () => `
    <h2>Create your identity</h2>
    <p class="sub">This school node has no account for you yet. Your keys are made here and never leave your device.</p>
    <div class="inline-note">${icon('info')}<div>Your passphrase encrypts your private keys on this device. It cannot be recovered — export a backup once you are in.</div></div>
    <div style="height:16px"></div>
    <form id="f-create">
      <div class="field">
        <label for="c-name">Full name</label>
        <input class="input" id="c-name" maxlength="60" placeholder="e.g. Amina Were" autocomplete="name" required>
      </div>
      <div class="field">
        <label for="c-pass">Passphrase</label>
        <input class="input" id="c-pass" type="password" minlength="6" placeholder="At least 6 characters" autocomplete="new-password" required>
      </div>
      <div class="field">
        <label for="c-pass2">Confirm passphrase</label>
        <input class="input" id="c-pass2" type="password" minlength="6" autocomplete="new-password" required>
      </div>
      <div id="c-err" class="error-text"></div>
      <button class="btn primary block" type="submit" style="margin-top:6px">Create my encrypted identity</button>
    </form>
    <p class="auth-note">
      Already have a backup from another device? <a href="#" id="go-restore">Restore it</a>.
    </p>
  `;

  const unlockPane = ident => `
    <h2>Welcome back${ident && ident.name ? ', ' + esc(ident.name) : ''}</h2>
    <p class="sub">Unlock your keys on this device to continue.</p>
    <form id="f-unlock">
      <div class="field">
        <label for="u-pass">Passphrase</label>
        <input class="input" id="u-pass" type="password" autocomplete="current-password" placeholder="Your passphrase" required>
      </div>
      <div id="u-err" class="error-text"></div>
      <button class="btn primary block" type="submit">Unlock</button>
    </form>
    <p class="auth-note">
      Lost the passphrase? It cannot be reset — use an encrypted backup from Settings on another device.
      <br><a href="#" id="go-restore">Restore a backup</a> · <a href="#" id="go-forget">Forget this device</a>
    </p>
  `;

  const restorePane = () => `
    <h2>Restore your identity</h2>
    <p class="sub">Paste or load a Mezoteric backup file. It contains your encrypted private keys.</p>
    <form id="f-restore">
      <div class="field">
        <label for="r-file">Backup file</label>
        <input class="input" id="r-file" type="file" accept="application/json,.json">
      </div>
      <div class="field">
        <label for="r-json">…or paste the backup JSON</label>
        <textarea class="textarea" id="r-json" placeholder='{"app":"mezoteric", ...}'></textarea>
      </div>
      <div class="field">
        <label for="r-pass">Backup passphrase</label>
        <input class="input" id="r-pass" type="password" placeholder="Passphrase used on the old device">
        <span class="hint">Leave empty for a plaintext backup export.</span>
      </div>
      <div id="r-err" class="error-text"></div>
      <button class="btn primary block" type="submit">Restore and unlock</button>
    </form>
    <p class="auth-note"><a href="#" id="go-back">Back</a></p>
  `;

  let currentMode = mode;
  paint();

  body.addEventListener('click', async e => {
    const t = e.target.closest('a[id], button[data-mode]');
    if (!t) return;
    if (t.id === 'go-restore') { e.preventDefault(); currentMode = 'restore'; paint(); }
    if (t.id === 'go-back') { e.preventDefault(); currentMode = existing ? 'unlock' : 'create'; paint(); }
    if (t.id === 'go-forget') {
      e.preventDefault();
      const ok = await confirmBox('Forget this device?', 'Your encrypted keys and local message history are deleted from this browser. Without a backup the identity is gone for good.', 'Forget device');
      if (!ok) return;
      await clearLocalAccount();
      toast('This device has been reset', 'ok');
      setTimeout(() => location.reload(), 600);
    }
  });

  body.addEventListener('change', async e => {
    if (e.target.id !== 'r-file') return;
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const box = body.querySelector('#r-json');
    if (box) box.value = text;
  });

  body.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type=submit]');
    const setErr = (sel, msg) => { const n = body.querySelector(sel); if (n) n.textContent = msg; };
    setErr('#c-err', ''); setErr('#u-err', ''); setErr('#r-err', '');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Working…';
    try {
      if (form.id === 'f-create') {
        const name = body.querySelector('#c-name').value.trim();
        const pass = body.querySelector('#c-pass').value;
        const pass2 = body.querySelector('#c-pass2').value;
        if (name.length < 2) throw new Error('Please enter your full name');
        if (pass.length < 6) throw new Error('Passphrase must be at least 6 characters');
        if (pass !== pass2) throw new Error('The two passphrases do not match');
        const pair = await generateIdentity();
        const vault = await sealVault(pass, { signPriv: pair.signPriv, ecdhPriv: pair.ecdhPriv });
        const identity = {
          userId: randomId(9),
          name,
          signPub: pair.signPub,
          ecdhPub: pair.ecdhPub,
          vault,
          created: Date.now(),
          published: false,
        };
        await saveIdentity(identity);
        toast('Identity created on this device', 'ok');
        onUnlocked(identity, { signPriv: pair.signPriv, ecdhPriv: pair.ecdhPriv }, { fresh: true });
        return;
      }

      if (form.id === 'f-unlock') {
        const pass = body.querySelector('#u-pass').value;
        const ident = await loadIdentity();
        if (!ident) throw new Error('No identity on this device');
        let keys;
        try {
          keys = await openVault(pass, ident.vault);
        } catch {
          throw new Error('That passphrase does not unlock your keys');
        }
        onUnlocked(ident, keys, { fresh: false });
        return;
      }

      if (form.id === 'f-restore') {
        const raw = body.querySelector('#r-json').value.trim();
        const pass = body.querySelector('#r-pass').value;
        if (!raw) throw new Error('Paste a backup or choose the backup file');
        let data;
        try { data = JSON.parse(raw); } catch { throw new Error('That is not valid backup JSON'); }
        if (!data.userId || !data.signPub || !data.ecdhPub) throw new Error('Backup is missing identity fields');
        let keys;
        if (data.vault) {
          if (!pass) throw new Error('This backup is encrypted — enter its passphrase');
          try { keys = await openVault(pass, data.vault); } catch { throw new Error('Wrong backup passphrase'); }
        } else if (data.signPriv && data.ecdhPriv) {
          if (!pass) throw new Error('Choose a new passphrase to protect the restored keys');
          keys = { signPriv: data.signPriv, ecdhPriv: data.ecdhPriv };
        } else {
          throw new Error('Backup has no private keys');
        }
        const identity = {
          userId: data.userId,
          name: data.name || 'Restored user',
          signPub: data.signPub,
          ecdhPub: data.ecdhPub,
          vault: data.vault || await sealVault(pass, keys),
          created: data.created || Date.now(),
          published: true,
        };
        await saveIdentity(identity);
        toast('Identity restored', 'ok');
        onUnlocked(identity, keys, { fresh: false });
        return;
      }
    } catch (err) {
      const target = form.id === 'f-create' ? '#c-err' : form.id === 'f-unlock' ? '#u-err' : '#r-err';
      setErr(target, err.message || 'Could not continue');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}
