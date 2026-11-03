'use client';

/**
 * AppShell Component
 * 
 * Provides the overarching navigation rail, active section switching,
 * responsive sidebars, user profile drawer, and LAN network status.
 */

import React, { useState } from 'react';
import { useMezoteric } from '../lib/context.jsx';
import OfflineStatusBanner from './OfflineStatusBanner.jsx';
import AuthModal from './AuthModal.jsx';
import {
  MessageSquare,
  Hash,
  Tv,
  Film,
  GraduationCap,
  Shield,
  Settings,
  User,
  Plus,
  KeyRound,
} from 'lucide-react';

export default function AppShell({ children }) {
  const {
    identity,
    role,
    activeSection,
    setActiveSection,
    isUnlocked,
    hasExistingVault,
  } = useMezoteric();

  const [showAuthModal, setShowAuthModal] = useState(!isUnlocked && !hasExistingVault);

  const navItems = [
    { key: 'chats', label: 'Chats', icon: MessageSquare, badge: null },
    { key: 'channels', label: 'Channels', icon: Hash, badge: null },
    { key: 'streams', label: 'Streams', icon: Tv, badge: 'LIVE' },
    { key: 'shorts', label: 'Shorts', icon: Film, badge: null },
    { key: 'school', label: 'School', icon: GraduationCap, badge: null },
    { key: 'admin', label: 'Admin', icon: Shield, badge: null },
  ];

  const getRoleBadgeClass = (r) => {
    if (r === 'admin') return 'badge-admin';
    if (r === 'teacher') return 'badge-teacher';
    return 'badge-student';
  };

  return (
    <div className="app-shell">
      {/* Top Banner: Distinguishes between Internet WAN and Local School LAN */}
      <OfflineStatusBanner />

      <div className="app-body">
        {/* Navigation Rail (Leftmost bar) */}
        <nav className="rail">
          {/* Brand icon */}
          <div
            className="rail-brand"
            title="Mezoteric School Platform"
            onClick={() => setActiveSection('chats')}
          >
            M
          </div>

          {/* Core Navigation Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', alignItems: 'center' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  className={`rail-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveSection(item.key)}
                  title={item.label}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                  {item.badge && <span className="rail-badge">{item.badge}</span>}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          {/* Bottom Settings & User Profile */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', width: '100%' }}>
            <button
              className={`rail-btn ${activeSection === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveSection('settings')}
              title="Settings & Key Vault"
            >
              <Settings size={20} />
              <span>Settings</span>
            </button>

            {/* Profile Avatar & Role Indicator */}
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(61, 220, 151, 0.2), rgba(139, 124, 246, 0.3))',
                border: '1px solid var(--line)',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                fontWeight: '700',
                color: 'var(--accent)',
              }}
              title={identity ? `${identity.name} (${role})` : 'Set Up Profile'}
              onClick={() => setShowAuthModal(true)}
            >
              {identity ? identity.name.charAt(0).toUpperCase() : <KeyRound size={18} />}
            </div>
          </div>
        </nav>

        {/* Dynamic Main View */}
        <main className="main-content">
          {children}
        </main>
      </div>

      {/* Cryptographic Key Vault / Onboarding Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}
