'use client';

/**
 * AdminView Component — Decentralized Multi-Admin Governance Panel
 * 
 * CORE ARCHITECTURAL RULE:
 * Power is NEVER centralized in a single person or root account.
 * Key administrative actions (promoting teachers/admins, issuing critical announcements,
 * suspending accounts) require an M-of-N threshold consensus where a strict majority
 * of independent administrators cryptographically sign the proposal.
 */

import React, { useState } from 'react';
import { useMezoteric } from '../../lib/context.jsx';
import {
  Shield,
  CheckCircle2,
  Users,
  UserCheck,
  AlertOctagon,
  Vote,
  Plus,
  Server,
  Activity,
  Key,
  ShieldAlert,
  ChevronRight,
  Clock,
} from 'lucide-react';

export default function AdminView() {
  const {
    identity,
    role,
    members,
    proposals,
    requests,
    proposeAction,
    approveProposal,
    approveRequest,
    lanInfo,
  } = useMezoteric();

  const [activeTab, setActiveTab] = useState('proposals'); // 'proposals' | 'requests' | 'members' | 'mesh'
  const [showNewProposalModal, setShowNewProposalModal] = useState(false);
  const [targetUserId, setTargetUserId] = useState(members[4]?.userId || 'student_amara');
  const [targetRole, setTargetRole] = useState('teacher');
  const [proposalReason, setProposalReason] = useState('Recommended by Science department.');

  // Count active administrators
  const adminMembers = members.filter((m) => m.role === 'admin');
  const totalAdmins = Math.max(adminMembers.length, 3);
  const thresholdNeed = Math.floor(totalAdmins / 2) + 1; // M-of-N majority

  const handleCreateProposalSubmit = (e) => {
    e.preventDefault();
    const targetMember = members.find((m) => m.userId === targetUserId) || { name: 'User' };
    proposeAction({
      kind: 'set-role',
      payload: {
        userId: targetUserId,
        name: targetMember.name,
        role: targetRole,
        reason: proposalReason,
      },
    });
    setShowNewProposalModal(false);
  };

  return (
    <div className="admin-view" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '24px 32px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={28} color="var(--accent)" />
            <h1 style={{ fontSize: '24px', fontWeight: '800' }}>Decentralized Admin Panel</h1>
          </div>
          <p style={{ color: 'var(--muted)', marginTop: '4px', fontSize: '14px' }}>
            Multi-signature governance: administrative powers are distributed with M-of-N threshold consensus.
          </p>
        </div>

        <button
          onClick={() => setShowNewProposalModal(true)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>New Multi-Admin Proposal</span>
        </button>
      </div>

      {/* Decentralized Governance Info Card */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(61, 220, 151, 0.08), rgba(20, 34, 56, 0.9))',
          border: '1px solid rgba(61, 220, 151, 0.25)',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'var(--accent-dim)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--accent)',
            }}
          >
            <Vote size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Decentralized Consensus Rule Active</h3>
            <p style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '2px' }}>
              No single administrator can unilaterally promote members or modify school policies.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent)' }}>
              {adminMembers.length} Admins
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Active Governance Quorum</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: '20px' }}>
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--warn)' }}>
              {thresholdNeed} of {totalAdmins} Signatures
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Threshold Needed to Execute</div>
          </div>
        </div>
      </div>

      {/* Admin Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--line)', paddingBottom: '12px', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('proposals')}
          className={`btn ${activeTab === 'proposals' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Vote size={15} /> Active Proposals ({proposals.length})
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`btn ${activeTab === 'requests' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <UserCheck size={15} /> Role Requests ({requests.filter((r) => r.status === 'pending').length})
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`btn ${activeTab === 'members' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Users size={15} /> Member Roster ({members.length})
        </button>

        <button
          onClick={() => setActiveTab('mesh')}
          className={`btn ${activeTab === 'mesh' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Server size={15} /> School LAN Mesh Node
        </button>
      </div>

      {/* TAB 1: Proposals Queue */}
      {activeTab === 'proposals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {proposals.map((prop) => {
            const approvalsCount = (prop.approvals || []).length;
            const isApproved = prop.status === 'approved' || approvalsCount >= prop.threshold;
            const hasSigned = (prop.approvals || []).some(
              (a) => a.admin === (identity ? identity.userId : 'admin_principal')
            );

            return (
              <div
                key={prop.id}
                className="card"
                style={{
                  borderLeft: isApproved ? '4px solid var(--accent)' : '4px solid var(--warn)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge" style={{ background: isApproved ? 'rgba(61,220,151,0.15)' : 'rgba(247,185,85,0.15)', color: isApproved ? 'var(--accent)' : 'var(--warn)' }}>
                      {isApproved ? 'CONSENSUS REACHED (EXECUTED)' : 'AWAITING ADMIN SIGNATURES'}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Proposed by {prop.proposerName}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', fontWeight: '700', color: isApproved ? 'var(--accent)' : 'var(--warn)' }}>
                    {approvalsCount} of {prop.threshold} Signatures Collected
                  </div>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>
                  {prop.kind === 'set-role'
                    ? `Promote ${prop.payload.name} to ${prop.payload.role.toUpperCase()}`
                    : prop.payload.title || 'Administrative Proposal'}
                </h3>

                <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
                  {prop.payload.reason || prop.payload.body}
                </p>

                {/* Progress bar */}
                <div style={{ height: '6px', width: '100%', background: 'var(--bg-2)', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, (approvalsCount / prop.threshold) * 100)}%`,
                      background: isApproved ? 'var(--accent)' : 'var(--warn)',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
                    <Key size={14} />
                    <span>Cryptographic signers: {(prop.approvals || []).map((a) => a.admin).join(', ')}</span>
                  </div>

                  {!isApproved && (
                    <button
                      onClick={() => approveProposal(prop.id)}
                      disabled={hasSigned}
                      className="btn btn-primary"
                      style={{ fontSize: '12.5px', padding: '6px 14px' }}
                    >
                      <CheckCircle2 size={15} />
                      {hasSigned ? 'You Signed This Proposal' : 'Sign & Vote Approval'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: Role Requests */}
      {activeTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {requests.map((req) => (
            <div key={req.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700' }}>{req.userName}</h3>
                  <span className="badge badge-student">Current: Student</span>
                  <span>→</span>
                  <span className={`badge badge-${req.wantRole}`}>Wants: {req.wantRole}</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                  "{req.reason}"
                </p>
              </div>

              <div>
                {req.status === 'pending' ? (
                  <button
                    onClick={() => approveRequest(req.id)}
                    className="btn btn-primary"
                    style={{ fontSize: '12.5px' }}
                  >
                    Create Multi-Admin Proposal
                  </button>
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: '600' }}>
                    Proposal Submitted
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Member Directory */}
      {activeTab === 'members' && (
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>
            Registered School Members ({members.length})
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '10px 14px' }}>Name</th>
                  <th style={{ padding: '10px 14px' }}>Role</th>
                  <th style={{ padding: '10px 14px' }}>User ID</th>
                  <th style={{ padding: '10px 14px' }}>Joined</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: '600' }}>{m.name}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className={`badge badge-${m.role}`}>{m.role}</span>
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--muted)' }}>
                      {m.userId}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--muted)' }}>{m.joined}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--accent)' }}>Active on LAN</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: School LAN Mesh Node */}
      {activeTab === 'mesh' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Server size={22} color="var(--accent)" />
              <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Local School Node</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>LAN IP Address:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: '700' }}>{lanInfo.lanIp}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Node HTTP/WS Port:</span>
                <span style={{ fontFamily: 'monospace' }}>{lanInfo.port}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Self-Signed TLS:</span>
                <span style={{ color: 'var(--accent)', fontWeight: '600' }}>Active (SHA-256)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>UDP Discovery:</span>
                <span style={{ color: 'var(--accent)' }}>Broadcasting on port {lanInfo.port}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Activity size={22} color="var(--warn)" />
              <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Offline Resilience Status</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
              Whenever the school's external MTN internet connection drops, this node automatically assumes local mesh leadership. All messages, notes, live streams, and announcements remain 100% accessible to every device connected to the school router.
            </p>
          </div>
        </div>
      )}

      {/* MODAL: New Multi-Admin Proposal */}
      {showNewProposalModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
              Create Decentralized Governance Proposal
            </h2>
            <form onSubmit={handleCreateProposalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Target School Member
                </label>
                <select
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
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
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.role}) - {m.userId}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Proposed New Role
                </label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
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
                  <option value="teacher">Promote to Teacher</option>
                  <option value="admin">Promote to Administrator</option>
                  <option value="staff">Promote to Staff</option>
                  <option value="suspended">Suspend Account</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Proposal Justification
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="State reason for the other admins to review and sign..."
                  value={proposalReason}
                  onChange={(e) => setProposalReason(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: 'var(--text)',
                    outline: 'none',
                    resize: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewProposalModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
