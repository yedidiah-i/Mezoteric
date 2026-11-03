'use client';

/**
 * Mezoteric Main Application Page (Next.js App Router)
 * 
 * Dynamically switches between the primary sections requested by the school:
 * 1. Chats: WhatsApp-like end-to-end encrypted direct messaging
 * 2. Channels: Slack-like channels & academic threads
 * 3. Streams: Twitch-like live broadcasting hub & WebRTC viewer chat
 * 4. Shorts: TikTok / Reels scrolling video feed with YouTube/Instagram embeds
 * 5. School: Student & Teacher Dashboards (Lesson notes, Digital report cards, Gradebook)
 * 6. Admin: Decentralized multi-admin governance (M-of-N threshold proposals & consensus)
 * 7. Settings: Cryptographic key vault management & offline LAN status
 */

import React from 'react';
import { useMezoteric } from '../lib/context.jsx';
import AppShell from '../components/AppShell.jsx';
import ChatsView from '../components/chats/ChatsView.jsx';
import ChannelsView from '../components/channels/ChannelsView.jsx';
import StreamsView from '../components/streams/StreamsView.jsx';
import ShortsView from '../components/shorts/ShortsView.jsx';
import SchoolView from '../components/school/SchoolView.jsx';
import AdminView from '../components/admin/AdminView.jsx';
import SettingsView from '../components/settings/SettingsView.jsx';

export default function MezotericHomePage() {
  const { activeSection } = useMezoteric();

  return (
    <AppShell>
      {activeSection === 'chats' && <ChatsView />}
      {activeSection === 'channels' && <ChannelsView />}
      {activeSection === 'streams' && <StreamsView />}
      {activeSection === 'shorts' && <ShortsView />}
      {activeSection === 'school' && <SchoolView />}
      {activeSection === 'admin' && <AdminView />}
      {activeSection === 'settings' && <SettingsView />}
    </AppShell>
  );
}
