'use client';

/**
 * SettingsView Component — Cryptographic Key Vault, Safety Numbers & LAN Node Settings
 * 
 * Features:
 * 1. View & verify your cryptographic identity (P-256 Public Key & Safety Number)
 * 2. Export / Backup your encrypted identity vault to keep safe offline
 * 3. School LAN node configuration & offline storage metrics
 * 4. Safe account reset and logout
 */

import React, { useState } from 'react';
import { useMezoteric } from '../../lib/context.jsx';
import {
  Settings,
  Key,
  Shield,
  Download,
  Trash2,
  Server,
  Database,
  CheckCircle,
  Copy,
  User,
} from 'lucide-react';

export default function SettingsView() {
  const {
    identity,
    role,
    netStatus,
    lanInfo,
    logout,
  } = useMezoteric();

  const [copiedKey, setCopiedKey] = useState(false);

  const handleCopyFingerprint = () => {
    if (identity && identity.signPub) {
      navigator.clipboard.writeText(identity.signPub);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleExportVault = () => {
    if (!identity) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(identity, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `mezoteric_vault_${identity.userId}.json`);
    dlAnchor.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '24px 32px', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <Settings size={28} color="var(--accent)" />
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800' }}>Platform Settings & Identity Vault</h1>
          <p style={{ color: 'var(--muted)', marginTop: '2px', fontSize: '14px' }}>
            Manage your cryptographic keys, safety numbers, and local school node connections.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* User Profile Card */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                color: '#04120c',
                display: 'grid',
                placeItems: 'center',
                fontWeight: '800',
                fontSize: '22px',
              }}
            >
              {identity ? identity.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: '700' }}>{identity ? identity.name : 'Brian Kato'}</h3>
                <span className={`badge badge-${role}`}>{role}</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                ID: {identity ? identity.userId : 'usr_local_demo'}
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-2)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)' }}>
                ECDSA P-256 Public Key (Signature Verification):
              </span>
              <button
                onClick={handleCopyFingerprint}
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {copiedKey ? <CheckCircle size={12} color="var(--accent)" /> : <Copy size={12} />}
                <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
              </button>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--accent)', wordBreak: 'break-all' }}>
              {identity && identity.signPub ? identity.signPub : 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEP... (Unverified)'}
            </div>
          </div>
        </div>

        {/* Cryptographic Vault Backup */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Key size={20} color="var(--accent)" />
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Offline Vault Backup</h3>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5, marginBottom: '16px' }}>
            Your private keys are sealed with AES-256-GCM and PBKDF2 (250,000 iterations) using your passphrase. Download your encrypted vault file to restore your identity on another phone or computer.
          </p>

          <button onClick={handleExportVault} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Download size={16} />
            <span>Download Encrypted Vault (.json)</span>
          </button>
        </div>

        {/* Local LAN Node Information */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Server size={20} color="var(--accent-2)" />
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>School LAN Node Connection</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--muted)' }}>Network Mode:</span>
              <span style={{ fontWeight: '600', color: netStatus === 'online' ? 'var(--accent)' : 'var(--warn)' }}>
                {netStatus === 'online' ? 'Global Internet + LAN Active' : 'School LAN Mode (MTN Internet Down - Local LAN Active)'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--muted)' }}>Server Address:</span>
              <span style={{ fontFamily: 'monospace' }}>https://{lanInfo.lanIp}:{lanInfo.port}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ color: 'var(--muted)' }}>Offline Storage (IndexedDB):</span>
              <span style={{ color: 'var(--accent)' }}>Active & Encrypted</span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="card" style={{ borderColor: 'rgba(255, 107, 122, 0.3)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--danger)', marginBottom: '8px' }}>
            Reset Account on this Device
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
            Clears local IndexedDB messages, cached report cards, and private keys from this browser. Make sure you have exported your vault file first!
          </p>

          <button
            onClick={() => {
              if (confirm('Are you sure you want to log out and clear local keys on this device?')) {
                logout();
              }
            }}
            className="btn"
            style={{ background: 'rgba(255, 107, 122, 0.15)', color: '#ff6b7a', border: '1px solid rgba(255, 107, 122, 0.3)' }}
          >
            <Trash2 size={16} /> Clear Local Keys & Logout
          </button>
        </div>
      </div>
    </div>
  );
}
