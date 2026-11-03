// Live video over the school LAN using WebRTC.
//
// The signalling (offer / answer / ICE) travels through Mezoteric's own
// end-to-end encrypted envelopes, so the node never learns who is watching or
// what the SDP contained.
//
// No STUN server is required by default. Two devices on the same LAN find
// each other through host candidates alone, which is exactly what keeps a
// broadcast working after the school's internet (MTN) drops — the case this
// app is built for. A STUN/TURN server can still be added in Settings for
// devices that are not on the same subnet.

import { kvGet, kvSet } from './db.js';

const peerKey = (streamId, peerId) => `${streamId}:${peerId}`;

export class StreamMesh {
  constructor(state) {
    this.state = state;
    /** peerKey -> { pc, streamId, peerId, pendingIce: [] } */
    this.peers = new Map();
    /** streamId -> MediaStream this device is publishing */
    this.local = new Map();
    /** streamId -> Set of peerIds currently watching us */
    this.watchers = new Map();
    this.handlers = {
      /** (streamId, MediaStream) => void — a viewer's remote video arrived */
      onRemoteStream: null,
      /** (streamId, peerId) => void — a viewer started watching */
      onWatcher: null,
      /** (event) => void — peer state changes, for status text */
      onState: null,
    };
    this.iceServers = [];
  }

  get rtcConfig() {
    return { iceServers: this.iceServers };
  }

  /** Called when the app boots so LAN-only streaming works without a STUN server. */
  async loadConfig() {
    try {
      const raw = await kvGet('iceServers', []);
      if (Array.isArray(raw)) this.iceServers = raw;
    } catch { /* keep defaults */ }
  }

  async setIceServers(list) {
    this.iceServers = Array.isArray(list) ? list : [];
    await kvSet('iceServers', this.iceServers);
  }

  // ---------- publishing ----------

  /** Start publishing `mediaStream` under `streamId`. */
  publish(streamId, mediaStream) {
    this.local.set(streamId, mediaStream);
    for (const track of mediaStream.getTracks()) {
      track.onended = () => this.stopPublishing(streamId);
    }
  }

  stopPublishing(streamId) {
    this.local.delete(streamId);
    for (const [key, entry] of [...this.peers]) {
      if (entry.streamId === streamId) this.closePeer(key);
    }
  }

  isPublishing(streamId) {
    return this.local.has(streamId);
  }

  // ---------- watching ----------

  /**
   * Watch a stream. Resolves with the remote MediaStream once the broadcaster
   * has answered and media is flowing.
   */
  watch(streamId, broadcasterId) {
    const key = peerKey(streamId, broadcasterId);
    const existing = this.peers.get(key);
    if (existing) return existing.promise;

    const pc = new RTCPeerConnection(this.rtcConfig);
    const entry = {
      pc, streamId, peerId: broadcasterId, pendingIce: [], remote: null,
      promise: null, resolve: null, reject: null, timer: null,
    };
    entry.promise = new Promise((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
      entry.timer = setTimeout(() => {
        this.closePeer(key);
        reject(new Error('The broadcaster did not answer. They may have gone offline.'));
      }, 25000);
    });
    this.peers.set(key, entry);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.state.sendIce(broadcasterId, streamId, ev.candidate.toJSON()).catch(() => {});
      }
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
      entry.remote = stream;
      if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
      entry.resolve(stream);
      if (this.handlers.onRemoteStream) this.handlers.onRemoteStream(streamId, stream);
    };
    pc.onconnectionstatechange = () => {
      if (this.handlers.onState) {
        this.handlers.onState({ streamId, peerId: broadcasterId, state: pc.connectionState });
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.closePeer(key);
    };

    // Receive-only transceivers so the offer has media lines to answer.
    try {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    } catch { /* older browsers negotiate from the offer instead */ }

    this.state.requestStream(streamId, broadcasterId).catch(() => {});
    return entry.promise;
  }

  /** Stop watching a stream. */
  unwatch(streamId, broadcasterId) {
    this.closePeer(peerKey(streamId, broadcasterId));
  }

  closePeer(key) {
    const entry = this.peers.get(key);
    if (!entry) return;
    this.peers.delete(key);
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    try { entry.pc.close(); } catch { /* already closed */ }
    if (entry.reject) {
      try { entry.reject(new Error('The stream ended.')); } catch { /* resolved already */ }
    }
    const set = this.watchers.get(entry.streamId);
    if (set) set.delete(entry.peerId);
  }

  // ---------- signalling ----------

  /** Handle one decrypted signalling envelope. */
  async handleSignal(env, body) {
    if (!env || !body) return;
    const from = env.from;
    const streamId = body.streamId;
    if (!streamId) return;

    try {
      if (env.kind === 'rtc-watch') {
        await this.createOfferFor(streamId, from);
        return;
      }
      if (env.kind === 'rtc-offer') {
        const entry = this.peers.get(peerKey(streamId, from));
        if (!entry) return;
        await entry.pc.setRemoteDescription(new RTCSessionDescription(body.sdp));
        await entry.pc.setLocalDescription(await entry.pc.createAnswer());
        await this.state.sendSdp(from, 'rtc-answer', streamId, {
          type: entry.pc.localDescription.type,
          sdp: entry.pc.localDescription.sdp,
        });
        await this.flushIce(entry);
        return;
      }
      if (env.kind === 'rtc-answer') {
        const entry = this.peers.get(peerKey(streamId, from));
        if (!entry) return;
        await entry.pc.setRemoteDescription(new RTCSessionDescription(body.sdp));
        await this.flushIce(entry);
        return;
      }
      if (env.kind === 'rtc-ice') {
        const entry = this.peers.get(peerKey(streamId, from));
        if (!entry) return;
        if (!entry.pc.remoteDescription) { entry.pendingIce.push(body.candidate); return; }
        await entry.pc.addIceCandidate(new RTCIceCandidate(body.candidate));
      }
    } catch (err) {
      console.warn('rtc signalling failed', err.message);
    }
  }

  /** Broadcaster side: a viewer asked to watch, so send them an offer. */
  async createOfferFor(streamId, viewerId) {
    const media = this.local.get(streamId);
    if (!media) return; // we are not publishing this stream (any more)
    const key = peerKey(streamId, viewerId);
    if (this.peers.has(key)) return;

    const pc = new RTCPeerConnection(this.rtcConfig);
    const entry = { pc, streamId, peerId: viewerId, pendingIce: [], role: 'broadcaster' };
    this.peers.set(key, entry);

    for (const track of media.getTracks()) {
      try { pc.addTrack(track, media); } catch { /* ignore duplicate track */ }
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.state.sendIce(viewerId, streamId, ev.candidate.toJSON()).catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (this.handlers.onState) {
        this.handlers.onState({ streamId, peerId: viewerId, state: pc.connectionState });
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.closePeer(key);
    };

    await pc.setLocalDescription(await pc.createOffer());
    await this.state.sendSdp(viewerId, 'rtc-offer', streamId, {
      type: pc.localDescription.type,
      sdp: pc.localDescription.sdp,
    });

    if (!this.watchers.has(streamId)) this.watchers.set(streamId, new Set());
    this.watchers.get(streamId).add(viewerId);
    if (this.handlers.onWatcher) this.handlers.onWatcher(streamId, viewerId);
  }

  async flushIce(entry) {
    const pending = entry.pendingIce.splice(0);
    for (const c of pending) {
      try { await entry.pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* stale candidate */ }
    }
  }

  /** How many people are watching one of our streams. */
  watcherCount(streamId) {
    const set = this.watchers.get(streamId);
    return set ? set.size : 0;
  }
}
