// Shorts: a vertical feed of short videos.
//
// A short is either an encrypted upload (the bytes never leave the device in
// the clear, and the key travels inside the signed record) or a link to a
// YouTube / Instagram video, which is rendered as an embed.
//
// Every short is signed by its author, so the node cannot swap the media key
// of an encrypted upload for one of its own.
import { el, esc, avatar, icon, fmtWhen, toast } from '../ui/dom.js';

/** Work out how to embed a link, or return null if we do not host it. */
export function linkEmbed(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    let id = u.searchParams.get('v');
    if (!id) {
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{6,})/);
      if (m) id = m[1];
    }
    if (id) {
      return {
        kind: 'youtube',
        id,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?rel=0',
        label: 'YouTube',
      };
    }
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    if (id) {
      return {
        kind: 'youtube',
        id,
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?rel=0',
        label: 'YouTube',
      };
    }
  }
  if (host === 'instagram.com' || host === 'instagr.am') {
    const pm = u.pathname.match(/\/(?:p|reel|reels|tv)\/([\w-]+)/);
    if (pm) {
      const isReel = /reel/.test(u.pathname);
      return {
        kind: 'instagram',
        id: pm[1],
        embedUrl: 'https://www.instagram.com/' + (isReel ? 'reel' : 'p') + '/' + encodeURIComponent(pm[1]) + '/embed/',
        label: 'Instagram',
      };
    }
  }
  return null;
}

export function shortsSidebar(state, ctx) {
  const list = el('div');
  list.append(el('button', {
    class: 'btn primary block', style: 'margin-bottom:12px',
    click: () => ctx.navigateTo('shorts/create'),
  }, icon('plus'), 'Add a short'));

  const shorts = state.shortList();
  list.append(el('div', { class: 'section-label' }, 'Shorts'));
  if (!shorts.length) {
    list.append(el('div', { class: 'muted', style: 'font-size:12.5px;padding:2px 6px 10px' }, 'No shorts yet.'));
  }
  for (const s of shorts.slice(0, 40)) {
    const by = state.nameOf(s.by);
    list.append(el('div', { class: 'list-item', click: () => ctx.navigateTo('shorts') },
      avatar(by, s.by, 34),
      el('div', { class: 'li-main' },
        el('div', { class: 'li-top' }, el('span', { class: 'li-name' }, esc(s.title || 'Untitled'))),
        el('div', { class: 'li-sub' }, esc(by) + ' · ' + fmtWhen(s.ts)),
      ),
      el('span', { class: 'chip' }, s.kind === 'link' ? 'Link' : 'Video'),
    ));
  }
  return list;
}

export function shortsFeed(state, ctx) {
  const shorts = state.shortList();
  const feed = el('div', { class: 'shorts-feed' });

  if (!shorts.length) {
    return el('div', { class: 'shorts-shell' },
      el('div', { class: 'shorts-hint' }, 'No shorts yet'),
      el('div', { class: 'empty' },
        el('div', { class: 'empty-ico' }, icon('play')),
        el('h3', {}, 'Nothing here yet'),
        el('p', {}, 'Add a short video, or paste a YouTube or Instagram link.'),
        el('button', { class: 'btn primary sm', style: 'margin-top:12px', click: () => ctx.navigateTo('shorts/create') }, 'Add a short'),
      ),
    );
  }

  for (const s of shorts) feed.append(shortCard(state, s, ctx));

  return el('div', { class: 'shorts-shell' },
    el('div', { class: 'shorts-hint' }, shorts.length + ' short' + (shorts.length === 1 ? '' : 's')),
    feed,
  );
}

function shortCard(state, s, ctx) {
  const by = state.nameOf(s.by);
  const card = el('div', { class: 'short' });

  if (s.kind === 'link') {
    const embed = linkEmbed(s.url);
    if (embed) {
      card.append(el('iframe', {
        src: embed.embedUrl,
        title: s.title || embed.label,
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture',
        allowfullscreen: 'true',
        loading: 'lazy',
      }));
    } else {
      // Not a provider we embed — show it as a rich link card instead.
      card.append(el('div', { class: 'link-card' },
        icon('link'),
        el('div', { style: 'font-weight:600;font-size:14px' }, esc(s.title || s.url)),
        el('a', { href: s.url, target: '_blank', rel: 'noreferrer noopener', style: 'font-size:12px;color:var(--accent)' }, esc(s.url)),
      ));
    }
  } else {
    // Encrypted upload: fetch the ciphertext and decrypt it locally.
    const video = el('video', { autoplay: 'true', muted: 'true', loop: 'true', playsinline: 'true', controls: 'true' });
    card.append(video);
    decryptShort(state, s).then(url => {
      video.src = url;
    }).catch(err => {
      card.append(el('div', { class: 'short-overlay' }, el('div', {}, 'Could not load this short: ' + (err.message || 'unknown error'))));
    });
  }

  const overlay = el('div', { class: 'short-overlay' },
    el('div', { class: 'short-meta' },
      avatar(by, s.by, 34),
      el('div', { style: 'min-width:0' },
        el('div', { class: 'short-title' }, esc(s.title || 'Untitled short')),
        el('div', { class: 'short-sub' }, esc(by) + ' · ' + fmtWhen(s.ts)),
      ),
    ),
  );
  card.append(overlay);
  return card;
}

async function decryptShort(state, s) {
  if (!s.mediaId) throw new Error('This short has no media attached.');
  const key = s.meta && s.meta.key;
  const iv = s.meta && s.meta.iv;
  if (!key || !iv) throw new Error('This short has no decryption key.');
  const bytes = await state.downloadAttachment({ mediaId: s.mediaId, key, iv });
  const blob = new Blob([bytes], { type: (s.meta && s.meta.mime) || 'video/mp4' });
  return URL.createObjectURL(blob);
}

export function createShortForm(state, ctx) {
  const titleInput = el('input', { class: 'input', id: 'sh-title', placeholder: 'What is this about?' });
  const linkInput = el('input', { class: 'input', id: 'sh-link', placeholder: 'https://youtube.com/watch?v=…' });
  const fileInput = el('input', { type: 'file', class: 'input', accept: 'video/mp4,video/webm,video/quicktime', style: 'padding:8px' });

  const linkPreview = el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px' });
  linkInput.addEventListener('input', () => {
    const embed = linkEmbed(linkInput.value);
    linkPreview.textContent = embed
      ? 'Ready to embed from ' + embed.label + '.'
      : linkInput.value ? 'This link will be shown as a card.' : '';
  });

  return el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('shorts') }, icon('back')),
      el('div', {},
        el('h1', {}, 'Add a short'),
        el('p', { class: 'muted' }, 'Upload a video (encrypted on this device) or paste a YouTube / Instagram link.'),
      ),
    ),
    el('div', { class: 'card' },
      el('div', { class: 'field' }, el('label', {}, 'Title'), titleInput),
      el('div', { class: 'field' }, el('label', {}, 'Video file'), fileInput),
      el('div', { class: 'field' }, el('label', {}, 'Or a link'), linkInput, linkPreview),
      el('button', { class: 'btn primary block', click: async () => {
        const title = titleInput.value.trim();
        const file = fileInput.files && fileInput.files[0];
        const link = linkInput.value.trim();
        try {
          if (file) {
            await state.uploadShort(file, title || file.name);
            toast('Short published', 'ok');
          } else if (link) {
            await state.createShortFromLink(link, title || 'Shared video');
            toast('Short published', 'ok');
          } else {
            toast('Choose a file or paste a link', 'warn');
            return;
          }
          ctx.navigateTo('shorts');
        } catch (err) {
          toast(err.message || 'Could not publish the short', 'error');
        }
      } }, icon('plus'), 'Publish short'),
    ),
  );
}
