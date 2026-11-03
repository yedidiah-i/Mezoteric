'use client';

/**
 * ChannelsView Component — Slack-like Channels, Threads & Group Collaboration
 * 
 * Features:
 * 1. Organized school channels: #general, #announcements, #mathematics-g10, #physics-lab
 * 2. Public vs Private encrypted channels with AES-256-GCM symmetric keys
 * 3. Rich message threads with role badges, code blocks, and emoji reactions
 * 4. Pinned channel announcements and syllabus updates
 * 5. Create new study groups and subject channels
 */

import React, { useState } from 'react';
import { useMezoteric } from '../../lib/context.jsx';
import {
  Hash,
  Lock,
  Plus,
  Send,
  Pin,
  Smile,
  Paperclip,
  Code,
  Users,
  Search,
  BookOpen,
} from 'lucide-react';

export default function ChannelsView() {
  const {
    channels,
    channelMessages,
    sendChannelMessage,
    createChannel,
  } = useMezoteric();

  const [activeChannelId, setActiveChannelId] = useState(
    channels.length ? channels[0].id : 'ch-announcements'
  );
  const [inputText, setInputText] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChName, setNewChName] = useState('');
  const [newChTopic, setNewChTopic] = useState('');
  const [newChIsPrivate, setNewChIsPrivate] = useState(false);

  const activeChannel = channels.find((c) => c.id === activeChannelId) || channels[0] || {
    id: 'ch-general',
    name: 'general',
    topic: 'Campus discussions',
  };

  const messages = channelMessages[activeChannelId] || [
    {
      id: 'c-demo-1',
      from: 'teacher_okello',
      authorName: 'Mr. David Okello',
      authorRole: 'teacher',
      text: 'Good morning everyone! Please check the School tab for the revised Pure Mathematics syllabus and lecture notes.',
      reactions: { '👍': 12, '❤️': 4 },
      ts: Date.now() - 7200000,
    },
    {
      id: 'c-demo-2',
      from: 'student_kato',
      authorName: 'Brian Kato',
      authorRole: 'student',
      text: 'Thank you Mr. Okello! I downloaded the PDF onto my laptop and can review it offline.',
      reactions: { '🚀': 8 },
      ts: Date.now() - 3600000,
    },
  ];

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendChannelMessage(activeChannelId, inputText.trim());
    setInputText('');
  };

  const handleCreateChannelSubmit = (e) => {
    e.preventDefault();
    if (!newChName.trim()) return;
    createChannel({
      name: newChName.trim(),
      topic: newChTopic.trim(),
      isPrivate: newChIsPrivate,
    });
    setNewChName('');
    setNewChTopic('');
    setNewChIsPrivate(false);
    setShowCreateModal(false);
  };

  const addReaction = (msgId, emoji) => {
    // In local state, react to the message
  };

  return (
    <div className="workspace-view" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%', width: '100%' }}>
      {/* Channels Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">School Channels</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-secondary"
            style={{ padding: '4px 8px', borderRadius: '8px' }}
            title="Create Channel or Study Group"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="sidebar-scroll">
          <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--muted-2)', padding: '8px 12px 4px' }}>
            Academic & Campus Channels
          </div>

          {channels.map((ch) => {
            const isActive = ch.id === activeChannelId;
            return (
              <div
                key={ch.id}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveChannelId(ch.id)}
              >
                <div style={{ color: isActive ? 'var(--accent)' : 'var(--muted-2)' }}>
                  {ch.isPrivate ? <Lock size={16} /> : <Hash size={17} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: isActive ? '700' : '500', fontSize: '13.5px' }}>
                      {ch.name}
                    </span>
                    {ch.pinned && <Pin size={12} color="var(--warn)" />}
                  </div>
                  <div
                    style={{
                      fontSize: '11.5px',
                      color: 'var(--muted-2)',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ch.topic || 'No topic set'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Channel Chat Thread */}
      <section className="chat-container">
        {/* Header */}
        <header className="chat-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--accent)', fontWeight: '700', fontSize: '18px' }}>#</span>
              <h3 style={{ fontSize: '16px', fontWeight: '700' }}>{activeChannel.name}</h3>
              {activeChannel.isPrivate && (
                <span className="badge" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <Lock size={11} /> Private Group
                </span>
              )}
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '2px' }}>
              {activeChannel.topic}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', fontSize: '12px' }}>
            <Users size={15} />
            <span>School-wide Channel</span>
          </div>
        </header>

        {/* Message Stream */}
        <div className="chat-messages" style={{ background: 'var(--bg)' }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '8px 12px',
                borderRadius: '10px',
                transition: 'background 0.1s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Avatar */}
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, var(--accent-dim), var(--accent-2-dim))',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: '700',
                  color: 'var(--text)',
                  flexShrink: 0,
                }}
              >
                {m.authorName ? m.authorName.charAt(0).toUpperCase() : 'U'}
              </div>

              {/* Message Body */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: '700', fontSize: '13.5px', color: 'var(--text)' }}>
                    {m.authorName || 'User'}
                  </span>
                  {m.authorRole && (
                    <span className={`badge badge-${m.authorRole}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                      {m.authorRole}
                    </span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--muted-2)' }}>
                    {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div style={{ fontSize: '14px', marginTop: '4px', lineHeight: 1.5, color: 'var(--text)' }}>
                  {m.text}
                </div>

                {/* Reactions */}
                {m.reactions && Object.keys(m.reactions).length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    {Object.entries(m.reactions).map(([emoji, count]) => (
                      <span
                        key={emoji}
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--line)',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        {emoji} {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Slack-style Composer */}
        <form onSubmit={handleSend} className="chat-composer">
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 8px', borderRadius: '8px' }}
              title="Share Note or Code"
              onClick={() => {
                const note = prompt('Share study note or code snippet:');
                if (note) sendChannelMessage(activeChannelId, `\`\`\`\n${note}\n\`\`\``);
              }}
            >
              <Code size={15} />
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 8px', borderRadius: '8px' }}
              title="Attach Document"
              onClick={() => {
                const title = prompt('Attach Document to channel:');
                if (title) sendChannelMessage(activeChannelId, `📎 Shared document: **${title}**`);
              }}
            >
              <Paperclip size={15} />
            </button>
          </div>

          <input
            type="text"
            className="chat-input"
            placeholder={`Message #${activeChannel.name}...`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          <button
            type="submit"
            className="btn btn-primary"
            style={{ borderRadius: '50%', width: '38px', height: '38px', padding: 0 }}
          >
            <Send size={16} />
          </button>
        </form>
      </section>

      {/* Modal: Create Channel */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
              Create School Channel
            </h2>
            <form onSubmit={handleCreateChannelSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Channel Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. chemistry-form4 or debate-club"
                  value={newChName}
                  onChange={(e) => setNewChName(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Channel Topic / Purpose
                </label>
                <input
                  type="text"
                  placeholder="What is this channel about?"
                  value={newChTopic}
                  onChange={(e) => setNewChTopic(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="chPriv"
                  checked={newChIsPrivate}
                  onChange={(e) => setNewChIsPrivate(e.target.checked)}
                />
                <label htmlFor="chPriv" style={{ fontSize: '13px', cursor: 'pointer' }}>
                  Private Channel (Only invited members can view)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Channel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
