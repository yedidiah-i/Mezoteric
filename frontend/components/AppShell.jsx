'use client';

import React, { useState } from 'react';
import { useMezoteric } from '../lib/context.jsx';
import OfflineStatusBanner from './OfflineStatusBanner.jsx';
import AuthModal from './AuthModal.jsx';
import {
  MessageSquare, Hash, Tv, Film, GraduationCap, Shield, Settings,
  KeyRound, Search, Bell, ChevronDown, PanelLeft, LockKeyhole,
} from 'lucide-react';

const navItems = [
  { key: 'chats', label: 'Messages', description: 'Private conversations', icon: MessageSquare },
  { key: 'channels', label: 'Channels', description: 'School communities', icon: Hash },
  { key: 'streams', label: 'Live streams', description: 'Classes and events', icon: Tv, badge: 'LIVE' },
  { key: 'shorts', label: 'Shorts', description: 'Campus highlights', icon: Film },
  { key: 'school', label: 'School hub', description: 'Learning workspace', icon: GraduationCap },
  { key: 'admin', label: 'Governance', description: 'Trust and approvals', icon: Shield },
];

const sectionNames = Object.fromEntries(navItems.map((item) => [item.key, item.label]));

export default function AppShell({ children }) {
  const { identity, role, activeSection, setActiveSection, isUnlocked, hasExistingVault } = useMezoteric();
  const [showAuthModal, setShowAuthModal] = useState(!isUnlocked && !hasExistingVault);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <OfflineStatusBanner />
      <div className="app-body">
        <aside className="app-sidebar" aria-label="Main navigation">
          <div className="brand-lockup" onClick={() => setActiveSection('chats')} role="button" tabIndex={0}>
            <div className="brand-mark">M</div>
            <div className="brand-copy"><strong>mezoteric</strong><span>School network</span></div>
          </div>

          <div className="sidebar-section-label">Workspace</div>
          <nav className="primary-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.key;
              return (
                <button key={item.key} className={`nav-item ${active ? 'active' : ''}`} onClick={() => setActiveSection(item.key)} type="button" aria-current={active ? 'page' : undefined}>
                  <Icon aria-hidden="true" />
                  <span className="nav-item-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                  {item.badge && <span className="live-pill">{item.badge}</span>}
                </button>
              );
            })}
          </nav>

          <div className="sidebar-spacer" />
          <div className="trust-card"><div className="trust-icon"><LockKeyhole aria-hidden="true" /></div><div><strong>Private by design</strong><span>End-to-end encryption is active</span></div></div>
          <button className={`nav-item ${activeSection === 'settings' ? 'active' : ''}`} onClick={() => setActiveSection('settings')} type="button"><Settings aria-hidden="true" /><span className="nav-item-copy"><strong>Settings</strong><small>Keys and preferences</small></span></button>
          <button className="profile-card" onClick={() => setShowAuthModal(true)} type="button"><span className="avatar">{identity ? identity.name.charAt(0).toUpperCase() : <KeyRound aria-hidden="true" />}</span><span className="profile-copy"><strong>{identity?.name || 'Set up profile'}</strong><small>{identity ? role : 'Secure your account'}</small></span><ChevronDown aria-hidden="true" /></button>
        </aside>

        <main className="main-content">
          <header className="topbar">
            <div className="topbar-title"><button className="icon-button mobile-menu" onClick={() => setCollapsed((value) => !value)} type="button" aria-label="Toggle navigation"><PanelLeft aria-hidden="true" /></button><div><span className="eyebrow">{sectionNames[activeSection] || 'Workspace'}</span><h1>{activeSection === 'chats' ? `Good morning, ${identity?.name || 'there'}` : sectionNames[activeSection]}</h1></div></div>
            <div className="topbar-actions"><label className="global-search"><Search aria-hidden="true" /><input aria-label="Search Mezoteric" placeholder="Search Mezoteric" /></label><button className="icon-button" type="button" aria-label="Notifications"><Bell aria-hidden="true" /><span className="notification-dot" /></button><button className="icon-button desktop-menu" onClick={() => setCollapsed((value) => !value)} type="button" aria-label="Collapse navigation"><PanelLeft aria-hidden="true" /></button></div>
          </header>
          <div className="content-canvas">{children}</div>
        </main>
      </div>
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}
