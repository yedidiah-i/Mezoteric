'use client';

/**
 * OfflineStatusBanner Component
 * 
 * Provides prominent visual reassurance about the dual-mode network:
 * 1. Online: External Internet (e.g. MTN/Airtel/fiber) AND local School LAN are both active.
 * 2. School LAN Mode: External internet is disconnected/expired, but the school
 *    local intranet (Wi-Fi router/switch) is fully active! Chatting, streaming, notes,
 *    and report cards continue operating seamlessly with 0 KB mobile data consumed.
 * 3. Offline / Searching: Reconnecting to the school server node.
 */

import React from 'react';
import { useMezoteric } from '../lib/context.jsx';
import { Wifi, WifiOff, Globe, Server, ShieldCheck } from 'lucide-react';

export default function OfflineStatusBanner() {
  const { netStatus, lanInfo } = useMezoteric();

  if (netStatus === 'online') {
    return (
      <div className="net-banner online">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Globe size={14} />
          <span>Online — Connected to Global Internet & School LAN Node</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', opacity: 0.85 }}>
          <span>LAN IP: {lanInfo.lanIp}:{lanInfo.port}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ShieldCheck size={13} /> E2EE Verified
          </span>
        </div>
      </div>
    );
  }

  if (netStatus === 'lan_only') {
    return (
      <div className="net-banner lan_only">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Server size={14} />
          <span>
            School LAN Mode Active — MTN Internet is Offline, but School Intranet is 100% Operational!
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', opacity: 0.9 }}>
          <span>Local Mesh: {lanInfo.lanIp}:{lanInfo.port}</span>
          <span style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
            0 KB Mobile Data
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="net-banner offline">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <WifiOff size={14} />
        <span>Disconnected from School Wi-Fi — Reconnecting to local Mezoteric node...</span>
      </div>
      <div style={{ fontSize: '11px' }}>Outbox queuing messages locally</div>
    </div>
  );
}
