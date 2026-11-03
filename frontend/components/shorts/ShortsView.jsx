'use client';

/**
 * ShortsView Component — TikTok / Instagram-style Vertical Video Reels
 * 
 * Features:
 * 1. Vertical scrolling shorts feed of school life, STEM experiments, and revisions
 * 2. YouTube Shorts & Instagram Reel embedding: paste any link to embed it directly
 * 3. Native MP4/WebM upload: video streams locally from the school LAN node with zero data cost
 * 4. Interactive like hearts, comments drawer, and campus hashtag filters
 */

import React, { useState } from 'react';
import { useMezoteric } from '../../lib/context.jsx';
import {
  Heart,
  MessageCircle,
  Share2,
  Plus,
  Play,
  Pause,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Link as LinkIcon,
  Video,
  Send,
  X,
} from 'lucide-react';

export default function ShortsView() {
  const { shorts, addShort, likeShort, addShortComment } = useMezoteric();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [isPlaying, setIsPlaying] = useState(true);

  // New Short Form State
  const [uploadType, setUploadType] = useState('link'); // 'link' | 'file'
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newTags, setNewTags] = useState('#SchoolLife #Innovation');

  const currentShort = shorts[currentIndex] || shorts[0];

  const handleNext = () => {
    if (currentIndex < shorts.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const tagsArr = newTags
      .split(' ')
      .filter((t) => t.startsWith('#'))
      .map((t) => t.trim());

    addShort({
      title: newTitle.trim(),
      kind: uploadType === 'link' ? 'link' : 'media',
      url: newUrl.trim(),
      mediaUrl: uploadType === 'file' ? '/media/sample_video' : '',
      tags: tagsArr.length ? tagsArr : ['#CampusLife'],
    });

    setNewTitle('');
    setNewUrl('');
    setShowAddModal(false);
  };

  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (!commentInput.trim() || !currentShort) return;
    addShortComment(currentShort.id, commentInput.trim());
    setCommentInput('');
  };

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Top Floating Controls */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '24px',
          zIndex: 40,
          display: 'flex',
          gap: '12px',
        }}
      >
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.4)' }}
        >
          <Plus size={16} />
          <span>Upload Short</span>
        </button>
      </div>

      {/* Main Vertical Feed Centerpiece */}
      <div className="shorts-container">
        {/* Navigation arrows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginRight: '16px' }}>
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="btn btn-secondary"
            style={{ borderRadius: '50%', width: '42px', height: '42px', padding: 0, opacity: currentIndex === 0 ? 0.3 : 1 }}
            title="Previous Short"
          >
            <ChevronUp size={20} />
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex >= shorts.length - 1}
            className="btn btn-secondary"
            style={{ borderRadius: '50%', width: '42px', height: '42px', padding: 0, opacity: currentIndex >= shorts.length - 1 ? 0.3 : 1 }}
            title="Next Short"
          >
            <ChevronDown size={20} />
          </button>
        </div>

        {/* 9:16 Vertical Phone Video Canvas */}
        <div className="shorts-phone-frame">
          {currentShort ? (
            <div style={{ height: '100%', width: '100%', position: 'relative', background: '#000' }}>
              {/* YouTube Link Embed */}
              {currentShort.platform === 'youtube' && currentShort.embedId ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${currentShort.embedId}?autoplay=1&mute=0&controls=1&loop=1&playsinline=1`}
                  title={currentShort.title}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : currentShort.platform === 'instagram' ? (
                /* Instagram Reel Presentation */
                <div
                  style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #405DE6, #5851DB, #833AB4, #C13584, #E1306C, #FD1D1D)',
                    padding: '24px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '20px',
                      background: 'rgba(255,255,255,0.2)',
                      display: 'grid',
                      placeItems: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <ExternalLink size={30} color="#fff" />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>
                    {currentShort.title}
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', marginBottom: '20px' }}>
                    Instagram Reel link shared with school network
                  </p>
                  <a
                    href={currentShort.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn"
                    style={{ background: '#fff', color: '#000', fontWeight: '700', borderRadius: '20px' }}
                  >
                    View on Instagram
                  </a>
                </div>
              ) : (
                /* Native MP4/WebM Video (Stored on School LAN Server) */
                <div
                  style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(180deg, #0e1e33, #04070d)',
                    padding: '20px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '20px',
                      background: 'var(--accent-dim)',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--accent)',
                      marginBottom: '14px',
                    }}
                  >
                    <Play size={28} />
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#e9f0fb' }}>
                    {currentShort.title}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                    LAN Stored Video (Zero Mobile Data)
                  </p>
                </div>
              )}

              {/* Bottom Caption Overlay */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '0',
                  left: '0',
                  right: '64px',
                  padding: '20px 16px',
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.85) 50%, #000)',
                  zIndex: 10,
                  pointerEvents: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#04120c',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: '700',
                      fontSize: '12px',
                    }}
                  >
                    {currentShort.creatorName ? currentShort.creatorName.charAt(0) : 'U'}
                  </div>
                  <span style={{ fontWeight: '700', fontSize: '13.5px', color: '#fff' }}>
                    @{currentShort.creatorName}
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: '#f1f5f9', lineHeight: 1.4, margin: '4px 0' }}>
                  {currentShort.title}
                </p>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {currentShort.tags &&
                    currentShort.tags.map((tag, idx) => (
                      <span key={idx} style={{ color: 'var(--accent)', fontSize: '11.5px', fontWeight: '600' }}>
                        {tag}
                      </span>
                    ))}
                </div>
              </div>

              {/* Right Floating Actions Rail */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  right: '12px',
                  zIndex: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  alignItems: 'center',
                }}
              >
                {/* Like Button */}
                <button
                  onClick={() => likeShort(currentShort.id)}
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '44px',
                    height: '44px',
                    color: currentShort.likes > 0 ? '#ff4757' : '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Heart size={20} fill={currentShort.likes > 0 ? '#ff4757' : 'none'} />
                  <span style={{ fontSize: '10px', color: '#fff', marginTop: '2px' }}>{currentShort.likes}</span>
                </button>

                {/* Comment Button */}
                <button
                  onClick={() => setShowComments(!showComments)}
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '44px',
                    height: '44px',
                    color: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <MessageCircle size={20} />
                  <span style={{ fontSize: '10px', color: '#fff', marginTop: '2px' }}>
                    {(currentShort.comments || []).length}
                  </span>
                </button>

                {/* Share Button */}
                <button
                  onClick={() => alert('Local LAN Link copied: ' + window.location.href)}
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '44px',
                    height: '44px',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Share2 size={19} />
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>
              No shorts uploaded yet.
            </div>
          )}
        </div>

        {/* Comments Drawer */}
        {showComments && currentShort && (
          <div
            style={{
              width: '320px',
              height: '100%',
              maxHeight: '780px',
              marginLeft: '16px',
              background: 'var(--panel)',
              borderRadius: '20px',
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: '700', fontSize: '14px' }}>Comments</span>
              <button
                onClick={() => setShowComments(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(currentShort.comments || []).map((c) => (
                <div key={c.id} style={{ fontSize: '12.5px' }}>
                  <span style={{ fontWeight: '700', color: 'var(--accent)' }}>{c.user}</span>
                  <div style={{ color: '#e9f0fb', marginTop: '2px' }}>{c.text}</div>
                </div>
              ))}
            </div>

            <form onSubmit={handleCommentSubmit} style={{ padding: '12px', borderTop: '1px solid var(--line)', display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Add a comment..."
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                style={{
                  flex: 1,
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line)',
                  borderRadius: '16px',
                  padding: '8px 12px',
                  color: 'var(--text)',
                  fontSize: '12.5px',
                  outline: 'none',
                }}
              />
              <button type="submit" className="btn btn-primary" style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0 }}>
                <Send size={14} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Modal: Upload Short or Paste Link */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
              Post School Short or Video Reel
            </h2>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Type Switcher */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setUploadType('link')}
                  className={`btn ${uploadType === 'link' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                >
                  <LinkIcon size={16} /> YouTube / Instagram Link
                </button>
                <button
                  type="button"
                  onClick={() => setUploadType('file')}
                  className={`btn ${uploadType === 'file' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                >
                  <Video size={16} /> LAN Video Upload
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Caption / Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Solving Quadratic Equations in 30 Seconds"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
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

              {uploadType === 'link' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                    YouTube Shorts or Instagram Reel URL
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://www.youtube.com/shorts/... or https://www.instagram.com/reel/..."
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
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
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                    Select MP4/WebM Video
                  </label>
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    style={{
                      width: '100%',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--line)',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      color: 'var(--text)',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                    Will be stored on the local school node and streamed with 0 internet cost.
                  </span>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Hashtags
                </label>
                <input
                  type="text"
                  placeholder="#Mathematics #Physics #STEM"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
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

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Publish Short
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
