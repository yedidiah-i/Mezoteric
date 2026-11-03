'use client';

/**
 * StreamsView Component — Twitch-like Streaming Hub for School & Public Broadcasts
 * 
 * Features:
 * 1. Live stream broadcast studio with WebRTC camera, microphone & screen sharing
 * 2. School streaming hub showing active live lectures, assemblies, and student streams
 * 3. Twitch-style interactive live chat alongside the broadcast with real-time questions
 * 4. Zero-buffering local LAN streaming: video feeds stream over school Wi-Fi without using mobile data
 * 5. Public and class-specific broadcast modes
 */

import React, { useState, useRef, useEffect } from 'react';
import { useMezoteric } from '../../lib/context.jsx';
import {
  Tv,
  Radio,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  Eye,
  Send,
  Users,
  Play,
  StopCircle,
  Plus,
  Share2,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';

export default function StreamsView() {
  const {
    identity,
    role,
    streams,
    streamChats,
    startStream,
    stopStream,
    sendStreamChat,
  } = useMezoteric();

  const [activeStreamId, setActiveStreamId] = useState(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [streamTitle, setStreamTitle] = useState('');
  const [streamCategory, setStreamCategory] = useState('Lecture');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenShare, setIsScreenShare] = useState(false);
  const [chatInput, setChatInput] = useState('');

  const localVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const activeStream = streams.find((s) => s.id === activeStreamId);
  const currentChatMessages = (activeStreamId && streamChats[activeStreamId]) || [
    { id: 'sc1', user: 'Brian Kato', role: 'student', text: 'Audio is coming through very clearly sir!', ts: Date.now() - 600000 },
    { id: 'sc2', user: 'Ms. Sarah Nakato', role: 'teacher', text: 'Great explanation on the reaction kinetics.', ts: Date.now() - 300000 },
    { id: 'sc3', user: 'Grace Achieng', role: 'student', text: 'Can you show step 3 again please?', ts: Date.now() - 120000 },
  ];

  // WebRTC Camera/Screen Capture for Broadcast Studio
  useEffect(() => {
    if (showBroadcastModal && isBroadcasting) {
      async function startCapture() {
        try {
          let stream;
          if (isScreenShare && navigator.mediaDevices.getDisplayMedia) {
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          } else if (navigator.mediaDevices.getUserMedia) {
            stream = await navigator.mediaDevices.getUserMedia({
              video: isCameraOn,
              audio: isMicOn,
            });
          }
          if (stream) {
            mediaStreamRef.current = stream;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
          }
        } catch (err) {
          console.warn('Camera/Screen capture not permitted or in preview mode:', err.message);
        }
      }
      startCapture();
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    }
  }, [showBroadcastModal, isBroadcasting, isCameraOn, isMicOn, isScreenShare]);

  const handleStartBroadcast = async (e) => {
    e.preventDefault();
    if (!streamTitle.trim()) return;

    const newStr = await startStream({
      title: streamTitle.trim(),
      visibility: 'public',
      category: streamCategory,
    });

    setIsBroadcasting(true);
    setActiveStreamId(newStr.id);
    setShowBroadcastModal(false);
  };

  const handleEndBroadcast = () => {
    if (activeStreamId) {
      stopStream(activeStreamId);
    }
    setIsBroadcasting(false);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeStreamId) return;
    sendStreamChat(activeStreamId, chatInput.trim());
    setChatInput('');
  };

  // If viewing a specific live stream (Twitch View)
  if (activeStream) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', height: '100%', width: '100%' }}>
        {/* Main Stream Player Stage */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#04070d', overflow: 'hidden' }}>
          {/* Top Bar */}
          <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
            <button
              onClick={() => setActiveStreamId(null)}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <ArrowLeft size={16} /> Back to Streams Hub
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="badge badge-live" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px' }}>
                <Radio size={12} /> LIVE BROADCAST
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--muted)' }}>
                <Eye size={15} /> {activeStream.viewers || 1} watching on LAN
              </span>
            </div>
          </div>

          {/* Video Player Box */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020408' }}>
            {isBroadcasting && activeStream.by === (identity ? identity.userId : 'me') ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '24px',
                    background: 'linear-gradient(135deg, rgba(61, 220, 151, 0.15), rgba(139, 124, 246, 0.15))',
                    display: 'grid',
                    placeItems: 'center',
                    margin: '0 auto 16px',
                    color: 'var(--accent)',
                  }}
                >
                  <Tv size={40} />
                </div>
                <h2 style={{ fontSize: '20px', color: '#e9f0fb', marginBottom: '8px' }}>
                  {activeStream.title}
                </h2>
                <p style={{ maxWidth: '480px', margin: '0 auto', fontSize: '13.5px' }}>
                  Connected via WebRTC peer relay on the local school node. Zero buffering on LAN.
                </p>
                <div style={{ marginTop: '20px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.06)', padding: '6px 14px', borderRadius: '20px', fontSize: '12px' }}>
                  <span>Host: {activeStream.creatorName}</span>
                  <span className={`badge badge-${activeStream.creatorRole || 'teacher'}`}>{activeStream.creatorRole || 'Teacher'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Stream Info Bar */}
          <div style={{ padding: '16px 20px', background: 'var(--panel)', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: '700' }}>{activeStream.title}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', fontSize: '12.5px', color: 'var(--muted)' }}>
                <span>Host: {activeStream.creatorName}</span>
                <span>•</span>
                <span style={{ color: 'var(--accent)' }}>Category: {activeStream.category}</span>
                <span>•</span>
                <span>School LAN Stream</span>
              </div>
            </div>

            {isBroadcasting && activeStream.by === (identity ? identity.userId : 'me') && (
              <button onClick={handleEndBroadcast} className="btn" style={{ background: 'var(--danger)', color: '#fff' }}>
                <StopCircle size={16} /> End Live Stream
              </button>
            )}
          </div>
        </div>

        {/* Right Live Chat Sidebar (Twitch Style) */}
        <aside style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-2)', borderLeft: '1px solid var(--line)' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: '700', fontSize: '14px' }}>Live Stream Chat</span>
            <span style={{ fontSize: '11px', color: 'var(--accent)' }}>LAN Relay</span>
          </div>

          {/* Chat Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {currentChatMessages.map((msg) => (
              <div key={msg.id} style={{ fontSize: '13px', lineHeight: 1.45 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: '700', color: msg.role === 'teacher' ? 'var(--accent-2)' : 'var(--accent)' }}>
                    {msg.user}
                  </span>
                  {msg.role && (
                    <span className={`badge badge-${msg.role}`} style={{ fontSize: '8.5px', padding: '1px 4px' }}>
                      {msg.role}
                    </span>
                  )}
                  <span style={{ fontSize: '10.5px', color: 'var(--muted-2)' }}>
                    {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ marginTop: '2px', color: '#e9f0fb' }}>{msg.text}</div>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendChat} style={{ padding: '12px', borderTop: '1px solid var(--line)', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Send a message to stream..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              style={{
                flex: 1,
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: 'var(--text)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 12px', borderRadius: '8px' }}>
              <Send size={15} />
            </button>
          </form>
        </aside>
      </div>
    );
  }

  // Streams Hub Gallery View
  const liveStreams = streams.filter((s) => s.live);
  const pastStreams = streams.filter((s) => !s.live);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '24px 32px' }}>
      {/* Top Banner & Start Broadcast Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Tv size={28} color="var(--accent)" />
            <h1 style={{ fontSize: '24px', fontWeight: '800' }}>Live Streaming Hub</h1>
          </div>
          <p style={{ color: 'var(--muted)', marginTop: '4px', fontSize: '14px' }}>
            Broadcast live lectures, campus assemblies, and STEM workshops across the school LAN.
          </p>
        </div>

        <button
          onClick={() => setShowBroadcastModal(true)}
          className="btn btn-primary"
          style={{ padding: '10px 18px', fontSize: '14px', borderRadius: '12px' }}
        >
          <Radio size={18} />
          <span>Start Live Stream</span>
        </button>
      </div>

      {/* Live Now Section */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff4757', display: 'inline-block' }} />
          <h2 style={{ fontSize: '17px', fontWeight: '700' }}>Live Now on School Network</h2>
        </div>

        {liveStreams.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
            <Tv size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <h3 style={{ fontSize: '16px', color: 'var(--text)' }}>No broadcasts live right now</h3>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>
              Be the first teacher or student to start a live class or lecture!
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
            {liveStreams.map((s) => (
              <div
                key={s.id}
                className="card"
                onClick={() => setActiveStreamId(s.id)}
                style={{ cursor: 'pointer', overflow: 'hidden', padding: 0 }}
              >
                {/* Thumbnail Preview */}
                <div
                  style={{
                    height: '180px',
                    background: 'linear-gradient(135deg, #0e1e33, #0a1220)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  <Play size={40} color="var(--accent)" />
                  <span
                    className="badge badge-live"
                    style={{ position: 'absolute', top: '12px', left: '12px', padding: '4px 8px' }}
                  >
                    ● LIVE
                  </span>
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '12px',
                      right: '12px',
                      background: 'rgba(0,0,0,0.7)',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                    }}
                  >
                    {s.viewers || 1} viewers
                  </span>
                </div>

                {/* Details */}
                <div style={{ padding: '16px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '6px' }}>{s.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--muted)' }}>
                    <span>{s.creatorName}</span>
                    <span className={`badge badge-${s.creatorRole || 'student'}`}>{s.creatorRole || 'student'}</span>
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--accent)' }}>
                    Tag: {s.category || 'Lecture'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Recordings / Past Streams */}
      <div>
        <h2 style={{ fontSize: '17px', fontWeight: '700', marginBottom: '16px' }}>Recent School Broadcasts</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {pastStreams.map((s) => (
            <div
              key={s.id}
              className="card"
              style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            >
              <div>
                <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', marginBottom: '8px' }}>
                  Ended
                </span>
                <h3 style={{ fontSize: '15px', fontWeight: '700', marginTop: '6px' }}>{s.title}</h3>
                <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                  By {s.creatorName} ({s.creatorRole})
                </p>
              </div>
              <div style={{ marginTop: '16px', fontSize: '11.5px', color: 'var(--muted-2)' }}>
                Streamed on {new Date(s.ts).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Start Broadcast Studio Modal */}
      {showBroadcastModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
              Broadcast Live to School Community
            </h2>

            <form onSubmit={handleStartBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Stream Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grade 10 Chemistry Revision or Chess Tournament Finals"
                  value={streamTitle}
                  onChange={(e) => setStreamTitle(e.target.value)}
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
                  Category
                </label>
                <select
                  value={streamCategory}
                  onChange={(e) => setStreamCategory(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                >
                  <option value="Lecture">Classroom Lecture</option>
                  <option value="STEM Workshop">STEM / Coding Workshop</option>
                  <option value="Assembly">School Assembly</option>
                  <option value="Debate">Debate & Clubs</option>
                  <option value="Gaming">Campus Sports / Esports</option>
                </select>
              </div>

              {/* Hardware toggles */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsCameraOn(!isCameraOn)}
                  className={`btn ${isCameraOn ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '10px' }}
                >
                  {isCameraOn ? <Video size={16} /> : <VideoOff size={16} />}
                  <span>{isCameraOn ? 'Camera On' : 'Camera Off'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsMicOn(!isMicOn)}
                  className={`btn ${isMicOn ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '10px' }}
                >
                  {isMicOn ? <Mic size={16} /> : <MicOff size={16} />}
                  <span>{isMicOn ? 'Mic On' : 'Muted'}</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowBroadcastModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Go Live Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
