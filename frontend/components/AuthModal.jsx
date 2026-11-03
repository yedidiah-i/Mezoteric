'use client';

/**
 * AuthModal Component
 * 
 * Handles zero-knowledge user onboarding and passphrase vault unlocking:
 * - Generates P-256 ECDSA and ECDH keypairs client-side using WebCrypto
 * - Seals private keys using PBKDF2 (250,000 iterations) + AES-256-GCM
 * - No central server password storage: authentication is purely cryptographic.
 */

import React, { useState } from 'react';
import { useMezoteric } from '../lib/context.jsx';
import { Shield, Lock, User, Key, CheckCircle, AlertTriangle } from 'lucide-react';

export default function AuthModal({ isOpen, onClose }) {
  const { hasExistingVault, identity, unlockWithPassphrase, createAccount } = useMezoteric();
  const [isCreatingNew, setIsCreatingNew] = useState(!hasExistingVault);
  const [name, setName] = useState('');
  const [role, setRole] = useState('student');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleUnlock = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await unlockWithPassphrase(passphrase);
      onClose();
    } catch (err) {
      setError('Incorrect passphrase. Could not decrypt local key vault.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Please enter your full name or nickname.');
      return;
    }
    if (passphrase.length < 6) {
      setError('Passphrase must be at least 6 characters.');
      return;
    }
    if (passphrase !== confirmPass) {
      setError('Passphrases do not match.');
      return;
    }

    setLoading(true);
    try {
      await createAccount(name.trim(), passphrase, role);
      onClose();
    } catch (err) {
      setError('Error generating cryptographic keys: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 12px',
              boxShadow: '0 8px 24px rgba(61, 220, 151, 0.3)',
            }}
          >
            <Shield size={26} color="#04120c" />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '700' }}>
            {isCreatingNew ? 'Create Mezoteric Identity' : 'Unlock Your Device Vault'}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
            {isCreatingNew
              ? 'Zero-knowledge cryptographic keys for E2E messaging and school records.'
              : `Welcome back, ${identity ? identity.name : 'Student'}. Enter your passphrase to unlock your private keys.`}
          </p>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(255, 107, 122, 0.12)',
              border: '1px solid rgba(255, 107, 122, 0.3)',
              color: '#ff6b7a',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {isCreatingNew ? (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px', color: 'var(--muted)' }}>
                Full Name or School Alias
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted-2)' }} />
                <input
                  type="text"
                  required
                  placeholder="e.g. Brian Kato or Ms. Sarah Nakato"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '10px 14px 10px 36px',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px', color: 'var(--muted)' }}>
                School Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
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
                <option value="student">Student (Read notes, receive report cards, stream, chat)</option>
                <option value="teacher">Teacher (Upload notes, issue report cards, host lectures)</option>
                <option value="admin">Administrator (Threshold multi-admin proposals & governance)</option>
                <option value="staff">Staff / Faculty</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px', color: 'var(--muted)' }}>
                Local Key Vault Passphrase
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted-2)' }} />
                <input
                  type="password"
                  required
                  placeholder="Choose a passphrase (min. 6 characters)"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '10px 14px 10px 36px',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px', color: 'var(--muted)' }}>
                Confirm Passphrase
              </label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted-2)' }} />
                <input
                  type="password"
                  required
                  placeholder="Repeat passphrase"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '10px 14px 10px 36px',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: '8px', padding: '12px' }}>
              {loading ? 'Generating P-256 Keys...' : 'Generate Keys & Enter Platform'}
            </button>

            {hasExistingVault && (
              <button
                type="button"
                onClick={() => setIsCreatingNew(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: 'pointer' }}
              >
                Already have a vault on this device? Unlock with passphrase
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px', color: 'var(--muted)' }}>
                Passphrase
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted-2)' }} />
                <input
                  type="password"
                  required
                  placeholder="Enter vault passphrase"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '10px 14px 10px 36px',
                    color: 'var(--text)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: '8px', padding: '12px' }}>
              {loading ? 'Decrypting Vault...' : 'Unlock Private Keys'}
            </button>

            <button
              type="button"
              onClick={() => setIsCreatingNew(true)}
              style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '13px', cursor: 'pointer' }}
            >
              Want to create a different identity? Click here
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
