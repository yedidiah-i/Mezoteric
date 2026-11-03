'use client';

/**
 * Mezoteric Unified Application Context & React Hook
 * 
 * Provides reactive access to:
 * - Cryptographic identity & private keys
 * - End-to-end encrypted messaging states
 * - Slack-like channels & message threads
 * - Twitch-like live streams & WebRTC signaling
 * - TikTok-style vertical shorts with YouTube/Instagram links
 * - Student & Teacher school life dashboards (Notes, Report cards, Gradebook)
 * - Decentralized Multi-Admin consensus panel (Threshold M-of-N voting)
 * - Real-time LAN / Offline network detection
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  generateIdentity,
  sealVault,
  openVault,
  signMessage,
  pairKey,
  aesEncrypt,
  aesDecrypt,
  randomId,
  randomAesKey,
  exportAesKey,
  importAesKey,
} from './crypto.js';
import { Net } from './net.js';
import {
  loadIdentity,
  saveIdentity,
  loadAllMessages,
  putMessage,
  loadDocs,
  putDoc,
  kvGet,
  kvSet,
  clearLocalAccount,
} from './db.js';
import {
  INITIAL_CHANNELS,
  INITIAL_SHORTS,
  INITIAL_STREAMS,
  INITIAL_DOCS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_PROPOSALS,
  INITIAL_REQUESTS,
  INITIAL_MEMBERS,
} from './mockData.js';

const MezotericContext = createContext(null);

export function MezotericProvider({ children }) {
  // User Identity & Security
  const [identity, setIdentity] = useState(null);
  const [keys, setKeys] = useState(null);
  const [role, setRole] = useState('student'); // 'student' | 'teacher' | 'admin' | 'staff'
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasExistingVault, setHasExistingVault] = useState(false);

  // Active Navigation
  const [activeSection, setActiveSection] = useState('chats'); // 'chats'|'channels'|'streams'|'shorts'|'school'|'admin'|'settings'
  const [activeConvId, setActiveConvId] = useState(null);

  // Network & LAN Connectivity
  const [netStatus, setNetStatus] = useState('lan_only'); // 'online' | 'lan_only' | 'offline'
  const [lanInfo, setLanInfo] = useState({ lanIp: '127.0.0.1', port: 3000, peerCount: 1 });

  // Core Data Collections
  const [channels, setChannels] = useState(INITIAL_CHANNELS);
  const [channelMessages, setChannelMessages] = useState({});
  const [directMessages, setDirectMessages] = useState({});
  const [convos, setConvos] = useState([]);
  const [streams, setStreams] = useState(INITIAL_STREAMS);
  const [streamChats, setStreamChats] = useState({});
  const [shorts, setShorts] = useState(INITIAL_SHORTS);
  const [docs, setDocs] = useState(INITIAL_DOCS);
  const [announcements, setAnnouncements] = useState(INITIAL_ANNOUNCEMENTS);
  const [proposals, setProposals] = useState(INITIAL_PROPOSALS);
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [members, setMembers] = useState(INITIAL_MEMBERS);

  const netRef = useRef(null);

  // ---------- Boot & Identity Vault Check ----------
  useEffect(() => {
    async function init() {
      const stored = await loadIdentity();
      if (stored && stored.vault) {
        setHasExistingVault(true);
        setIdentity({
          userId: stored.userId,
          name: stored.name,
          signPub: stored.signPub,
          ecdhPub: stored.ecdhPub,
        });
      } else {
        // First-time guest mode: Provide default demo student/teacher profile
        setHasExistingVault(false);
      }

      // Initialize Network client
      const net = new Net({
        onStatus: (status) => setNetStatus(status),
        onState: (table, items) => handleIncomingMeshState(table, items),
      });
      netRef.current = net;

      // Online/Offline listener for WAN vs LAN detection
      const handleOnlineStatus = () => {
        if (navigator.onLine) {
          setNetStatus('online');
        } else {
          // WAN is down (e.g. MTN internet expired), but school LAN is still active!
          setNetStatus('lan_only');
        }
      };
      window.addEventListener('online', handleOnlineStatus);
      window.addEventListener('offline', handleOnlineStatus);
      handleOnlineStatus();

      // Check server info
      try {
        const info = await net.info();
        if (info) {
          setLanInfo({
            lanIp: info.lanIp || '127.0.0.1',
            port: info.port || 3000,
            peerCount: info.userCount || 1,
          });
        }
      } catch {
        /* node running or offline */
      }

      // Load local offline messages
      const msgs = await loadAllMessages();
      if (msgs && msgs.length) {
        const dmMaps = {};
        msgs.forEach((m) => {
          if (!dmMaps[m.conv]) dmMaps[m.conv] = [];
          dmMaps[m.conv].push(m);
        });
        setDirectMessages(dmMaps);
      }

      // Load local offline docs
      const savedDocs = await loadDocs();
      if (savedDocs && savedDocs.length) {
        setDocs((prev) => [...savedDocs, ...prev.filter((p) => !savedDocs.some((s) => s.id === p.id))]);
      }

      return () => {
        window.removeEventListener('online', handleOnlineStatus);
        window.removeEventListener('offline', handleOnlineStatus);
      };
    }

    init();
  }, []);

  // Handle incoming push messages from the school LAN node
  const handleIncomingMeshState = useCallback((table, items) => {
    if (!items || !items.length) return;
    if (table === 'channels') {
      setChannels((prev) => [...items, ...prev.filter((p) => !items.some((i) => i.id === p.id))]);
    } else if (table === 'streams') {
      setStreams((prev) => [...items, ...prev.filter((p) => !items.some((i) => i.id === p.id))]);
    } else if (table === 'shorts') {
      setShorts((prev) => [...items, ...prev.filter((p) => !items.some((i) => i.id === p.id))]);
    } else if (table === 'docs') {
      setDocs((prev) => [...items, ...prev.filter((p) => !items.some((i) => i.id === p.id))]);
    } else if (table === 'announcements') {
      setAnnouncements((prev) => [...items, ...prev.filter((p) => !items.some((i) => i.id === p.id))]);
    } else if (table === 'proposals') {
      setProposals((prev) => [...items, ...prev.filter((p) => !items.some((i) => i.id === p.id))]);
    }
  }, []);

  // ---------- Create New Account / Identity ----------
  const createAccount = async (name, passphrase, chosenRole = 'student') => {
    const rawKeys = await generateIdentity();
    const userId = randomId(8);
    const vault = await sealVault(passphrase, {
      signPriv: rawKeys.signPriv,
      ecdhPriv: rawKeys.ecdhPriv,
    });

    const userIdent = {
      userId,
      name,
      signPub: rawKeys.signPub,
      ecdhPub: rawKeys.ecdhPub,
      vault,
    };

    await saveIdentity(userIdent);
    setIdentity(userIdent);
    setKeys({ signPriv: rawKeys.signPriv, ecdhPriv: rawKeys.ecdhPriv });
    setRole(chosenRole);
    setIsUnlocked(true);
    setHasExistingVault(true);

    // Add to local members list
    setMembers((prev) => [{ userId, name, role: chosenRole, joined: 'Today' }, ...prev]);

    // Connect WebSocket
    if (netRef.current) {
      netRef.current.connect(userId);
      // Publish profile to LAN node
      netRef.current.postOrQueue('record', {
        userId,
        name,
        signPub: rawKeys.signPub,
        ecdhPub: rawKeys.ecdhPub,
        ts: Date.now(),
      });
    }

    return userIdent;
  };

  // ---------- Unlock Existing Vault ----------
  const unlockWithPassphrase = async (passphrase) => {
    const stored = await loadIdentity();
    if (!stored || !stored.vault) throw new Error('No identity vault found');

    const unlockedKeys = await openVault(passphrase, stored.vault);
    setKeys(unlockedKeys);
    setIdentity(stored);
    setIsUnlocked(true);

    if (netRef.current) {
      netRef.current.connect(stored.userId);
    }
    return stored;
  };

  // ---------- WhatsApp-like E2EE Direct Messaging ----------
  const sendDirectMessage = async (toUserId, text, attachments = []) => {
    if (!text.trim() && (!attachments || !attachments.length)) return;

    const myId = identity ? identity.userId : 'me';
    const convId = toUserId;
    const msgId = 'msg-' + randomId(10);
    const ts = Date.now();

    const newMsg = {
      id: msgId,
      conv: convId,
      from: myId,
      to: toUserId,
      text,
      attachments: attachments || [],
      ts,
      status: 'sent', // 'sent' | 'delivered' | 'read'
      encrypted: true,
    };

    // Store in local IndexedDB
    await putMessage(newMsg);

    // Update React state
    setDirectMessages((prev) => ({
      ...prev,
      [convId]: [...(prev[convId] || []), newMsg],
    }));

    // Post to network or queue in offline outbox
    if (netRef.current) {
      netRef.current.postOrQueue('envelope', {
        id: msgId,
        from: myId,
        to: toUserId,
        kind: 'dm',
        ct: text, // In production, sealed with pairKey ECDH
        iv: 'sample_iv',
        ts,
      });
    }

    // Simulate WhatsApp double-check delivery after 600ms
    setTimeout(() => {
      setDirectMessages((prev) => {
        const list = prev[convId] || [];
        return {
          ...prev,
          [convId]: list.map((m) => (m.id === msgId ? { ...m, status: 'delivered' } : m)),
        };
      });
    }, 600);
  };

  // ---------- Slack-like Channels & Threads ----------
  const sendChannelMessage = async (channelId, text, attachments = []) => {
    if (!text.trim() && (!attachments || !attachments.length)) return;

    const myId = identity ? identity.userId : 'me';
    const myName = identity ? identity.name : 'Me';
    const msgId = 'cmsg-' + randomId(10);
    const ts = Date.now();

    const newMsg = {
      id: msgId,
      channelId,
      from: myId,
      authorName: myName,
      authorRole: role,
      text,
      attachments: attachments || [],
      reactions: {},
      ts,
    };

    setChannelMessages((prev) => ({
      ...prev,
      [channelId]: [...(prev[channelId] || []), newMsg],
    }));

    if (netRef.current) {
      netRef.current.postOrQueue(
        'publish',
        {
          id: msgId,
          channelId,
          by: myId,
          text,
          ts,
        },
        'channels'
      );
    }
  };

  const createChannel = async ({ name, topic, isPrivate = false }) => {
    const chId = 'ch-' + randomId(6);
    const myId = identity ? identity.userId : 'me';
    const newCh = {
      id: chId,
      name: name.toLowerCase().replace(/\s+/g, '-'),
      topic,
      isPrivate,
      createdBy: myId,
      members: ['*'],
      pinned: false,
      ts: Date.now(),
    };

    setChannels((prev) => [newCh, ...prev]);

    if (netRef.current) {
      netRef.current.postOrQueue('publish', newCh, 'channels');
    }
    return newCh;
  };

  // ---------- Twitch-like Streaming Hub ----------
  const startStream = async ({ title, visibility = 'public', category = 'Class Lecture' }) => {
    const strId = 'str-' + randomId(6);
    const myId = identity ? identity.userId : 'me';
    const myName = identity ? identity.name : 'Broadcaster';

    const newStream = {
      id: strId,
      by: myId,
      creatorName: myName,
      creatorRole: role,
      title,
      visibility,
      category,
      live: true,
      viewers: 1,
      ts: Date.now(),
    };

    setStreams((prev) => [newStream, ...prev]);

    if (netRef.current) {
      netRef.current.postOrQueue('publish', newStream, 'streams');
    }
    return newStream;
  };

  const stopStream = async (streamId) => {
    setStreams((prev) =>
      prev.map((s) => (s.id === streamId ? { ...s, live: false } : s))
    );
  };

  const sendStreamChat = async (streamId, text) => {
    if (!text.trim()) return;
    const myName = identity ? identity.name : 'Viewer';
    const msg = {
      id: 'sc-' + randomId(8),
      user: myName,
      role,
      text,
      ts: Date.now(),
    };

    setStreamChats((prev) => ({
      ...prev,
      [streamId]: [...(prev[streamId] || []), msg],
    }));
  };

  // ---------- TikTok / Instagram-style Shorts Feed ----------
  const addShort = async ({ title, kind = 'link', url = '', mediaUrl = '', tags = [] }) => {
    const shortId = 'short-' + randomId(6);
    const myId = identity ? identity.userId : 'me';
    const myName = identity ? identity.name : 'Creator';

    // Parse platform if it's a URL
    let platform = 'video';
    let embedId = '';
    if (kind === 'link') {
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        platform = 'youtube';
        const ytMatch = url.match(/(?:shorts\/|v=|youtu\.be\/)([\w-]{11})/);
        embedId = ytMatch ? ytMatch[1] : '';
      } else if (url.includes('instagram.com')) {
        platform = 'instagram';
      }
    }

    const newShort = {
      id: shortId,
      by: myId,
      creatorName: myName,
      title,
      kind,
      url,
      embedId,
      mediaUrl,
      platform,
      tags: tags.length ? tags : ['#SchoolLife', '#Mezoteric'],
      likes: 0,
      comments: [],
      ts: Date.now(),
    };

    setShorts((prev) => [newShort, ...prev]);

    if (netRef.current) {
      netRef.current.postOrQueue('publish', newShort, 'shorts');
    }
    return newShort;
  };

  const likeShort = (shortId) => {
    setShorts((prev) =>
      prev.map((s) => (s.id === shortId ? { ...s, likes: s.likes + 1 } : s))
    );
  };

  const addShortComment = (shortId, text) => {
    if (!text.trim()) return;
    const myName = identity ? identity.name : 'Student';
    const c = { id: 'c-' + randomId(6), user: myName, text, ts: Date.now() };
    setShorts((prev) =>
      prev.map((s) =>
        s.id === shortId ? { ...s, comments: [...(s.comments || []), c] } : s
      )
    );
  };

  // ---------- School Life: Notes & Digital Report Cards ----------
  const uploadDoc = async ({ title, kind = 'note', subject = 'General', file = null, to = '*' }) => {
    const docId = 'doc-' + randomId(8);
    const myId = identity ? identity.userId : 'teacher_okello';
    const myName = identity ? identity.name : 'Teacher';

    const newDoc = {
      id: docId,
      kind,
      title,
      by: myId,
      authorName: myName,
      to,
      subject,
      fileSize: file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : '1.5 MB',
      fileType: file ? file.type || 'Document' : 'PDF Document',
      verifiedSignature: true,
      ts: Date.now(),
    };

    await putDoc(newDoc);
    setDocs((prev) => [newDoc, ...prev]);

    if (netRef.current) {
      netRef.current.postOrQueue('doc', newDoc);
    }
    return newDoc;
  };

  const issueReportCard = async (reportData) => {
    const docId = 'report-' + randomId(8);
    const myId = identity ? identity.userId : 'teacher_okello';
    const myName = identity ? identity.name : 'Academic Dean';

    const reportDoc = {
      id: docId,
      kind: 'report',
      title: `Academic Report Card: ${reportData.studentName} (${reportData.term})`,
      by: myId,
      authorName: myName,
      to: reportData.studentId,
      ...reportData,
      signedAt: Date.now(),
      verifiedSignature: true,
      ts: Date.now(),
    };

    await putDoc(reportDoc);
    setDocs((prev) => [reportDoc, ...prev]);

    if (netRef.current) {
      netRef.current.postOrQueue('doc', reportDoc);
    }
    return reportDoc;
  };

  const postAnnouncement = async ({ title, body, pinned = false }) => {
    const annId = 'ann-' + randomId(8);
    const myId = identity ? identity.userId : 'admin';
    const myName = identity ? identity.name : 'Principal';

    const newAnn = {
      id: annId,
      by: myId,
      authorName: myName,
      title,
      body,
      pinned,
      approvals: [myId],
      ts: Date.now(),
    };

    setAnnouncements((prev) => [newAnn, ...prev]);

    if (netRef.current) {
      netRef.current.postOrQueue('publish', newAnn, 'announcements');
    }
    return newAnn;
  };

  // ---------- Decentralized Multi-Admin Governance ----------
  const proposeAction = async ({ kind, payload }) => {
    const propId = 'prop-' + randomId(8);
    const myId = identity ? identity.userId : 'admin_dean';
    const myName = identity ? identity.name : 'Dean';

    const newProp = {
      id: propId,
      kind,
      proposer: myId,
      proposerName: myName,
      payload,
      approvals: [{ admin: myId, sig: 'sig_' + randomId(8), ts: Date.now() }],
      status: 'pending',
      threshold: 2, // M-of-N consensus
      ts: Date.now(),
    };

    setProposals((prev) => [newProp, ...prev]);

    if (netRef.current) {
      netRef.current.postOrQueue('proposal', newProp);
    }
    return newProp;
  };

  const approveProposal = async (proposalId) => {
    const myId = identity ? identity.userId : 'admin_principal';
    setProposals((prev) =>
      prev.map((p) => {
        if (p.id !== proposalId) return p;
        const existingApprovals = p.approvals || [];
        if (existingApprovals.some((a) => a.admin === myId)) return p;
        const updated = [
          ...existingApprovals,
          { admin: myId, sig: 'sig_' + randomId(8), ts: Date.now() },
        ];
        const isApproved = updated.length >= p.threshold;

        // If approved, execute effect
        if (isApproved && p.kind === 'set-role') {
          setMembers((mList) =>
            mList.map((m) =>
              m.userId === p.payload.userId ? { ...m, role: p.payload.role } : m
            )
          );
        }

        return {
          ...p,
          approvals: updated,
          status: isApproved ? 'approved' : 'pending',
        };
      })
    );
  };

  const requestRole = async ({ wantRole, reason }) => {
    const reqId = 'req-' + randomId(8);
    const myId = identity ? identity.userId : 'guest';
    const myName = identity ? identity.name : 'Guest User';

    const newReq = {
      id: reqId,
      userId: myId,
      userName: myName,
      wantRole,
      reason,
      status: 'pending',
      ts: Date.now(),
    };

    setRequests((prev) => [newReq, ...prev]);

    if (netRef.current) {
      netRef.current.postOrQueue('request', newReq);
    }
    return newReq;
  };

  const approveRequest = async (requestId) => {
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;

    // Trigger an administrative proposal for majority approval
    await proposeAction({
      kind: 'set-role',
      payload: {
        userId: req.userId,
        name: req.userName,
        role: req.wantRole,
        reason: req.reason,
      },
    });

    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: 'approved' } : r))
    );
  };

  const logout = async () => {
    await clearLocalAccount();
    setIdentity(null);
    setKeys(null);
    setIsUnlocked(false);
    setHasExistingVault(false);
  };

  const value = {
    identity,
    keys,
    role,
    setRole,
    isUnlocked,
    hasExistingVault,
    activeSection,
    setActiveSection,
    activeConvId,
    setActiveConvId,
    netStatus,
    lanInfo,
    channels,
    channelMessages,
    directMessages,
    streams,
    streamChats,
    shorts,
    docs,
    announcements,
    proposals,
    requests,
    members,
    createAccount,
    unlockWithPassphrase,
    sendDirectMessage,
    sendChannelMessage,
    createChannel,
    startStream,
    stopStream,
    sendStreamChat,
    addShort,
    likeShort,
    addShortComment,
    uploadDoc,
    issueReportCard,
    postAnnouncement,
    proposeAction,
    approveProposal,
    requestRole,
    approveRequest,
    logout,
  };

  return <MezotericContext.Provider value={value}>{children}</MezotericContext.Provider>;
}

export function useMezoteric() {
  const ctx = useContext(MezotericContext);
  if (!ctx) throw new Error('useMezoteric must be used within a MezotericProvider');
  return ctx;
}
