// Live streaming hub: go live, browse, watch and chat.
//
// Video travels peer-to-peer over WebRTC. The signalling rides Mezoteric's own
// encrypted envelopes, so the node never sees the media or the SDP. Two
// devices on the same LAN connect through host candidates alone, which is why
// a broadcast keeps working after the school's internet drops.
import { el, esc, avatar, icon, fmtWhen, toast, emptyState } from '../ui/dom.js';
import { conversationPane } from '../ui/conversation.js';

export function sidebar(state, ctx) {
  const list = el('div');
  list.append(el('button', {
    class: 'btn primary block', style: 'margin-bottom:12px',
    click: () => ctx.navigateTo('streams/go-live'),
  }, icon('video'), 'Go live'));

  const live = state.liveStreams();
  list.append(el('div', { class: 'section-label' }, 'Live now'));
  if (!live.length) {
    list.append(el('div', { class: 'muted', style: 'font-size:12.5px;padding:2px 6px 10px' }, 'Nobody is streaming right now.'));
  }
  for (const s of live) {
    list.append(el('div', { class: 'list-item', click: () => ctx.navigateTo('streams/' + s.id) },
      avatar(state.nameOf(s.by), s.by, 36),
      el('div', { class: 'li-main' },
        el('div', { class: 'li-top' },
          el('span', { class: 'li-name' }, esc(s.title || 'Untitled stream')),
        ),
        el('div', { class: 'li-sub' }, esc(state.nameOf(s.by)) + ' · ' + (s.visibility === 'class' ? 'Class' : 'Public')),
      ),
      el('span', { class: 'chip live' }, 'LIVE'),
    ));
  }

  const mine = state.myLiveStream();
  if (mine) {
    list.append(el('div', { class: 'section-label', style: 'margin-top:12px' }, 'You are live'));
    list.append(el('div', { class: 'list-item active' },
      el('div', { class: 'li-main' },
        el('div', { class: 'li-name' }, esc(mine.title || 'Untitled')),
        el('div', { class: 'li-sub' }, 'Open the studio to manage it'),
      ),
      el('span', { class: 'chip live' }, 'ON'),
    ));
  }
  return list;
}

export function streamList(state, ctx) {
  const live = state.liveStreams();
  const recent = state.allStreams().filter(s => !live.includes(s)).slice(0, 12);

  const page = el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', {}, 'Live hub'),
        el('p', { class: 'muted' }, 'Broadcast to the whole school or just your class. Streams work on the LAN with no internet.'),
      ),
      el('div', { class: 'actions' },
        el('button', { class: 'btn primary', click: () => ctx.navigateTo('streams/go-live') }, icon('video'), 'Go live'),
      ),
    ),
  );

  if (!live.length && !recent.length) {
    page.append(el('div', { class: 'empty' },
      el('div', { class: 'empty-ico' }, icon('video')),
      el('h3', {}, 'No streams yet'),
      el('p', {}, 'Start a broadcast. Everyone on the school LAN can watch, even with the internet down.'),
    ));
    return page;
  }

  if (live.length) {
    page.append(el('div', { class: 'section-label' }, 'Live now'));
    page.append(el('div', { class: 'stream-grid', style: 'margin-bottom:22px' }, ...live.map(s => streamCard(state, s, ctx))));
  }
  if (recent.length) {
    page.append(el('div', { class: 'section-label' }, 'Ended'));
    page.append(el('div', { class: 'stream-grid' }, ...recent.map(s => streamCard(state, s, ctx))));
  }
  return page;
}

function streamCard(state, s, ctx) {
  const isLive = s.live && !s.ended;
  const name = state.nameOf(s.by);
  return el('div', { class: 'stream-card', click: () => ctx.navigateTo('streams/' + s.id) },
    el('div', { class: 'stream-thumb' },
      el('div', { class: 'play-ico' }, icon('play')),
      isLive ? el('span', { class: 'chip live' }, 'LIVE') : el('span', { class: 'chip', style: 'position:absolute;top:10px;left:10px' }, 'ENDED'),
      el('span', { class: 'chip vis' }, s.visibility === 'class' ? 'Class' : 'Public'),
    ),
    el('div', { class: 'sc-body' },
      el('div', { class: 'sc-title' }, esc(s.title || 'Untitled stream')),
      el('div', { class: 'sc-meta' },
        avatar(name, s.by, 22),
        el('span', {}, esc(name)),
        el('span', { class: 'spacer' }),
        el('span', {}, fmtWhen(s.ts)),
      ),
    ),
  );
}

// ---------- go live ----------

export function goLiveForm(state, ctx) {
  const myChannels = state.myChannels();
  let visibility = 'public';
  let channelId = myChannels[0] ? myChannels[0].id : '';

  const channelSelect = el('select', { class: 'select' },
    ...myChannels.map(c => el('option', { value: c.id }, esc(c.name))),
    ...(myChannels.length ? [] : [el('option', { value: '' }, 'No channel available')]),
  );
  channelSelect.disabled = true;

  const visButtons = [];
  const visRow = el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' });
  for (const v of [{ id: 'public', label: 'Public — anyone on the mesh', ic: 'users' },
                   { id: 'class', label: 'Class — only that channel', ic: 'hash' }]) {
    const b = el('button', {
      class: 'btn sm' + (v.id === visibility ? ' primary' : ''),
      click: () => {
        visibility = v.id;
        visButtons.forEach(x => x.btn.classList.toggle('primary', x.id === visibility));
        channelSelect.disabled = visibility !== 'class' || !myChannels.length;
      },
    }, icon(v.ic), v.label);
    visButtons.push({ id: v.id, btn: b });
    visRow.append(b);
  }

  const preview = el('video', {
    autoplay: 'true', muted: 'true', playsinline: 'true',
    style: 'width:100%;max-height:320px;background:#04070d;border-radius:12px;object-fit:contain;display:none',
  });

  let mediaStream = null;
  let started = false;

  const startBtn = el('button', {
    class: 'btn', click: async () => {
      if (started) {
        stopCapture();
        return;
      }
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        preview.srcObject = mediaStream;
        preview.style.display = 'block';
        started = true;
        startBtn.textContent = 'Stop camera';
        startBtn.classList.add('danger');
        toast('Camera on — press Start to broadcast', 'ok');
      } catch (err) {
        toast('Camera and microphone are required to broadcast: ' + err.message, 'error');
      }
    },
  }, 'Enable camera');

  function stopCapture() {
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
    preview.srcObject = null;
    preview.style.display = 'none';
    started = false;
    startBtn.textContent = 'Enable camera';
    startBtn.classList.remove('danger');
  }

  const page = el('div', { class: 'page' },
    el('div', { class: 'page-head' },
      el('button', { class: 'icon-btn', click: () => ctx.navigateTo('streams') }, icon('back')),
      el('div', {},
        el('h1', {}, 'Go live'),
        el('p', { class: 'muted' }, 'Your video goes straight to the people watching, peer to peer over the LAN.'),
      ),
    ),
    el('div', { class: 'card' },
      el('div', { class: 'field' }, el('label', {}, 'Title'), el('input', { class: 'input', id: 'gl-title', placeholder: 'e.g. Physics revision — Chapter 4' })),
      el('div', { class: 'field' }, el('label', {}, 'Who can watch'), visRow),
      el('div', { class: 'field' }, el('label', {}, 'Class channel'), channelSelect),
      el('div', { class: 'field' }, el('label', {}, 'Camera'), preview,
        el('div', { class: 'row', style: 'margin-top:8px' }, startBtn)),
      el('button', { class: 'btn primary block', style: 'margin-top:6px', click: async () => {
        const title = document.getElementById('gl-title').value.trim();
        if (!title) { toast('Give your stream a title', 'warn'); return; }
        if (!started || !mediaStream) { toast('Enable the camera first', 'warn'); return; }
        try {
          const { item } = await state.createStream({
            title,
            visibility,
            channelId: visibility === 'class' ? channelSelect.value : '',
          });
          state.rtc.publish(item.id, mediaStream);
          // Keep the broadcast alive: the node prunes streams that stop being refreshed.
          const timer = setInterval(() => {
            state.refreshStream(state.streams[item.id]).catch(() => {});
          }, 20000);
          window.addEventListener('beforeunload', () => {
            clearInterval(timer);
            state.endStream(item.id).catch(() => {});
          });
          toast('You are live', 'ok');
          ctx.navigateTo('streams/' + item.id);
        } catch (err) {
          toast(err.message || 'Could not start the stream', 'error');
        }
      } }, icon('video'), 'Start broadcasting'),
    ),
  );
  return page;
}

// ---------- watch ----------

export function watchStream(state, streamId, ctx) {
  const stream = state.streams[streamId];
  if (!stream) {
    return el('div', { class: 'page' }, el('div', { class: 'empty' },
      el('div', { class: 'empty-ico' }, icon('video')),
      el('h3', {}, 'This stream has ended'),
      el('p', {}, 'The broadcaster stopped, or the node pruned it.'),
      el('button', { class: 'btn primary sm', style: 'margin-top:12px', click: () => ctx.navigateTo('streams') }, 'Back to hub'),
    ));
  }

  const isMine = stream.by === state.me.userId;
  const video = el('video', { autoplay: 'true', playsinline: 'true', style: 'width:100%;height:100%;object-fit:contain;background:#04070d' });
  const hint = el('div', { class: 'video-hint' }, isMine ? 'You are the broadcaster. Your camera preview appears once viewers connect.' : 'Connecting to the broadcaster…');
  const stage = el('div', { class: 'video-wrap' }, video, hint);

  const chat = conversationPane(state, {
    conv: 'sc:' + streamId,
    peerId: 's' + streamId,
    title: 'Stream chat',
    subtitle: stream.visibility === 'class' ? 'Class stream' : 'Public stream',
    send: async (text, files) => {
      await state.sendStreamChat(streamId, text, files);
      state.markRead('sc:' + streamId);
    },
  });
  chat.classList.remove('chat-body');
  chat.style.display = 'flex';
  chat.style.flexDirection = 'column';
  chat.style.minHeight = '0';

  const chatPane = el('div', { class: 'watch-chat' }, chat);

  const viewers = el('span', { class: 'chip' }, '0 watching');
  const bar = el('div', { class: 'watch-bar' },
    el('div', { style: 'flex:1;min-width:0' },
      el('div', { style: 'font-weight:650;font-size:15px' }, esc(stream.title || 'Untitled stream')),
      el('div', { class: 'muted', style: 'font-size:12px' },
        esc(state.nameOf(stream.by)) + ' · ' + (stream.visibility === 'class' ? 'Class stream' : 'Public stream') + ' · ' + fmtWhen(stream.ts)),
    ),
    viewers,
    stream.live && !stream.ended ? el('span', { class: 'chip live' }, 'LIVE') : el('span', { class: 'chip' }, 'Ended'),
    isMine && stream.live ? el('button', { class: 'btn danger sm', click: async () => {
      try {
        await state.endStream(streamId);
        if (state.rtc) state.rtc.stopPublishing(streamId);
        toast('Stream ended', 'ok');
        ctx.navigateTo('streams');
      } catch (e) { toast(e.message, 'error'); }
    } }, 'End stream') : '',
  );

  const page = el('div', { class: 'watch' },
    el('div', { class: 'watch-stage' }, stage, bar),
    chatPane,
  );

  // ---- connect the media ----
  if (isMine) {
    // The broadcaster already has the local media; show it as a preview.
    const local = state.rtc && state.rtc.local.get(streamId);
    if (local) {
      video.srcObject = local;
      video.muted = true;
      hint.style.display = 'none';
    }
    if (state.rtc) {
      state.rtc.handlers.onWatcher = (sid, peerId) => {
        viewers.textContent = state.rtc.watcherCount(sid) + ' watching';
      };
    }
  } else if (stream.live && !stream.ended) {
    state.connectStreamStream(streamId)
      .then(media => {
        if (!media) throw new Error('The broadcaster did not answer.');
        video.srcObject = media;
        hint.style.display = 'none';
      })
      .catch(err => {
        hint.textContent = err.message || 'Could not connect to the stream.';
        hint.style.display = '';
      });
  } else {
    hint.textContent = 'This stream has ended.';
  }

  // Stop watching when we navigate away.
  const obs = new MutationObserver(() => {
    if (!document.body.contains(page)) {
      if (!isMine && state.rtc) state.rtc.unwatch(streamId, stream.by);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  return page;
}
