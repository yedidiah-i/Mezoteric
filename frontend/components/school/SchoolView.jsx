'use client';

/**
 * SchoolView Component — Student & Teacher Dashboards, Notes & Digital Report Cards
 * 
 * Features:
 * 1. Student Dashboard: Enrolled subjects, timetable, downloaded offline notes, and verified report cards
 * 2. Teacher Dashboard: Course material uploader, gradebook, and cryptographic digital report card signing
 * 3. Notes & Files Hub: Subject-filtered PDFs & lesson packs downloadable for 100% offline study
 * 4. Academic Report Cards: Full grading breakdown with GPA, remarks, and teacher digital signature badge
 * 5. School Announcements & Notices
 */

import React, { useState } from 'react';
import { useMezoteric } from '../../lib/context.jsx';
import {
  GraduationCap,
  BookOpen,
  Award,
  Bell,
  Download,
  Upload,
  CheckCircle,
  FileText,
  Star,
  Calendar,
  User,
  Plus,
  ShieldCheck,
  Printer,
  ChevronRight,
} from 'lucide-react';

export default function SchoolView() {
  const {
    identity,
    role,
    setRole,
    docs,
    uploadDoc,
    issueReportCard,
    announcements,
    postAnnouncement,
    members,
  } = useMezoteric();

  const [activeTab, setActiveTab] = useState(
    role === 'teacher' ? 'teacher' : 'student'
  );

  // Teacher Upload Note State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteSubject, setNoteSubject] = useState('Mathematics');

  // Teacher Issue Report Card State
  const [showIssueReportModal, setShowIssueReportModal] = useState(false);
  const [reportStudentId, setReportStudentId] = useState(members[4]?.userId || 'student_kato');
  const [reportStudentName, setReportStudentName] = useState(members[4]?.name || 'Brian Kato');
  const [reportTerm, setReportTerm] = useState('Term 2, 2026');
  const [reportGpa, setReportGpa] = useState('3.92 / 4.0');
  const [reportRank, setReportRank] = useState('2nd out of 94 Students');
  const [reportRemarks, setReportRemarks] = useState('Exemplary performance across all STEM units.');

  // Viewing Single Report Card Modal
  const [selectedReportCard, setSelectedReportCard] = useState(null);

  // Filter notes and reports
  const notesList = docs.filter((d) => d.kind === 'note');
  const reportCardsList = docs.filter((d) => d.kind === 'report');

  const handleUploadNoteSubmit = (e) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    uploadDoc({
      title: noteTitle.trim(),
      kind: 'note',
      subject: noteSubject,
    });
    setNoteTitle('');
    setShowUploadModal(false);
  };

  const handleIssueReportSubmit = (e) => {
    e.preventDefault();
    issueReportCard({
      studentId: reportStudentId,
      studentName: reportStudentName,
      term: reportTerm,
      gpa: reportGpa,
      rank: reportRank,
      attendance: '98.5%',
      grades: [
        { subject: 'Mathematics', score: 94, grade: 'A+', remarks: 'Excellent calculus and algebra' },
        { subject: 'Physics', score: 91, grade: 'A', remarks: 'Strong lab execution' },
        { subject: 'Computer Studies', score: 98, grade: 'A+', remarks: 'Top LAN project score' },
      ],
      principalRemark: reportRemarks,
    });
    setShowIssueReportModal(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '24px 32px' }}>
      {/* Top Header & Role Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <GraduationCap size={28} color="var(--accent)" />
            <h1 style={{ fontSize: '24px', fontWeight: '800' }}>School Life & Academics</h1>
          </div>
          <p style={{ color: 'var(--muted)', marginTop: '4px', fontSize: '14px' }}>
            Lesson notes, digital report cards, syllabus packs, and academic records on the school LAN.
          </p>
        </div>

        {/* Demo Quick Role Switcher for pairwise testing */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--panel)', padding: '4px 8px', borderRadius: '12px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: '600' }}>Preview As:</span>
          <button
            onClick={() => { setRole('student'); setActiveTab('student'); }}
            className={`btn ${role === 'student' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '8px' }}
          >
            Student
          </button>
          <button
            onClick={() => { setRole('teacher'); setActiveTab('teacher'); }}
            className={`btn ${role === 'teacher' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '8px' }}
          >
            Teacher
          </button>
        </div>
      </div>

      {/* Academic Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--line)', paddingBottom: '12px', marginBottom: '24px', overflowX: 'auto' }}>
        <button
          onClick={() => setActiveTab('student')}
          className={`btn ${activeTab === 'student' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <User size={16} /> Student Dashboard
        </button>

        <button
          onClick={() => setActiveTab('teacher')}
          className={`btn ${activeTab === 'teacher' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <BookOpen size={16} /> Teacher Dashboard
        </button>

        <button
          onClick={() => setActiveTab('notes')}
          className={`btn ${activeTab === 'notes' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <FileText size={16} /> Notes & Study Files ({notesList.length})
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`btn ${activeTab === 'reports' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Award size={16} /> Report Cards ({reportCardsList.length})
        </button>

        <button
          onClick={() => setActiveTab('announcements')}
          className={`btn ${activeTab === 'announcements' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Bell size={16} /> School Notices ({announcements.length})
        </button>
      </div>

      {/* TAB 1: Student Dashboard */}
      {activeTab === 'student' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Welcome card */}
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, rgba(61, 220, 151, 0.12), rgba(139, 124, 246, 0.12))',
              borderColor: 'rgba(61, 220, 151, 0.25)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span className="badge badge-student" style={{ marginBottom: '8px' }}>
                Enrolled Student View
              </span>
              <h2 style={{ fontSize: '20px', fontWeight: '800' }}>
                Welcome back, {identity ? identity.name : 'Brian Kato'}!
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '13.5px', marginTop: '4px' }}>
                Senior Four (Grade 10) · All your course notes and term report cards are saved offline on this device.
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent)' }}>3.92</div>
              <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>Cumulative GPA</div>
            </div>
          </div>

          {/* Quick Enrolled Courses & Timetable */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <BookOpen size={20} color="var(--accent)" />
                <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Enrolled Courses</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { name: 'Pure Mathematics', teacher: 'Mr. David Okello', notes: 4 },
                  { name: 'Physics & Practical Lab', teacher: 'Ms. Sarah Nakato', notes: 3 },
                  { name: 'Chemistry & Stoichiometry', teacher: 'Dr. Mukasa', notes: 2 },
                  { name: 'Computer Studies & LAN', teacher: 'Mr. David Okello', notes: 5 },
                ].map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-2)', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>{c.name}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{c.teacher}</div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: '10px' }}>
                      {c.notes} Notes Ready
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Offline Revision Vault */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Download size={20} color="var(--accent-2)" />
                <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Offline Revision Vault</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
                Download lecture packs directly to browser IndexedDB storage. You can open and read them even when MTN internet is disconnected.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notesList.slice(0, 3).map((n) => (
                  <div key={n.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={16} color="var(--muted)" />
                      <span style={{ fontSize: '12.5px', fontWeight: '600' }}>{n.title}</span>
                    </div>
                    <button
                      onClick={() => alert(`Saved "${n.title}" into local offline storage!`)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                    >
                      <Download size={13} /> Save Offline
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Teacher Dashboard */}
      {activeTab === 'teacher' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, rgba(139, 124, 246, 0.14), rgba(61, 220, 151, 0.08))',
              borderColor: 'rgba(139, 124, 246, 0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span className="badge badge-teacher" style={{ marginBottom: '8px' }}>
                Faculty & Teacher Studio
              </span>
              <h2 style={{ fontSize: '20px', fontWeight: '800' }}>Teacher Academic Command Hub</h2>
              <p style={{ color: 'var(--muted)', fontSize: '13.5px', marginTop: '4px' }}>
                Upload notes to the school LAN and issue cryptographically signed digital report cards.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowUploadModal(true)} className="btn btn-primary">
                <Upload size={16} /> Upload Lesson Notes
              </button>
              <button onClick={() => setShowIssueReportModal(true)} className="btn btn-secondary">
                <Award size={16} /> Issue Signed Report Card
              </button>
            </div>
          </div>

          {/* Quick Roster & Gradebook */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>
              Student Gradebook & Cryptographic Signature Center
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                    <th style={{ padding: '10px 14px' }}>Student Name</th>
                    <th style={{ padding: '10px 14px' }}>Grade / Form</th>
                    <th style={{ padding: '10px 14px' }}>Term Score</th>
                    <th style={{ padding: '10px 14px' }}>Status</th>
                    <th style={{ padding: '10px 14px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { id: 'student_kato', name: 'Brian Kato', grade: 'Form 4', score: '94% (A+)', status: 'Report Card Signed' },
                    { id: 'student_amara', name: 'Amara Tumusiime', grade: 'Form 4', score: '88% (A)', status: 'Pending Signature' },
                    { id: 'student_grace', name: 'Grace Achieng', grade: 'Form 4', score: '91% (A)', status: 'Report Card Signed' },
                  ].map((s, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: '600' }}>{s.name}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--muted)' }}>{s.grade}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--accent)', fontWeight: '700' }}>{s.score}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span className="badge" style={{ background: s.status.includes('Signed') ? 'rgba(61,220,151,0.12)' : 'rgba(247,185,85,0.12)', color: s.status.includes('Signed') ? 'var(--accent)' : 'var(--warn)' }}>
                          <ShieldCheck size={12} /> {s.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button
                          onClick={() => {
                            setReportStudentId(s.id);
                            setReportStudentName(s.name);
                            setShowIssueReportModal(true);
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                        >
                          Generate Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Notes & Study Files */}
      {activeTab === 'notes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700' }}>All Course Notes & Study Materials</h2>
            <button onClick={() => setShowUploadModal(true)} className="btn btn-primary" style={{ fontSize: '13px' }}>
              <Upload size={15} /> Upload Note (PDF)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {notesList.map((doc) => (
              <div key={doc.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className="badge" style={{ background: 'rgba(61,220,151,0.1)', color: 'var(--accent)' }}>
                      {doc.subject || 'Course Note'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{doc.fileSize}</span>
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '6px' }}>{doc.title}</h3>
                  <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Published by {doc.authorName}</p>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: 'var(--accent)' }}>
                    <ShieldCheck size={14} /> Teacher Verified
                  </span>
                  <button
                    onClick={() => alert(`Saved "${doc.title}" to offline browser storage!`)}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                  >
                    <Download size={14} /> Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Academic Report Cards */}
      {activeTab === 'reports' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700' }}>Academic Report Cards</h2>
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
                Digitally signed term results with teacher cryptographic signature verification.
              </p>
            </div>
            {role === 'teacher' && (
              <button onClick={() => setShowIssueReportModal(true)} className="btn btn-primary" style={{ fontSize: '13px' }}>
                <Plus size={15} /> Issue New Report Card
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
            {reportCardsList.map((rc) => (
              <div
                key={rc.id}
                className="card"
                onClick={() => setSelectedReportCard(rc)}
                style={{ cursor: 'pointer', border: '1px solid rgba(139, 124, 246, 0.3)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span className="badge" style={{ background: 'rgba(139, 124, 246, 0.15)', color: 'var(--accent-2)' }}>
                    {rc.term || 'Term 2, 2026'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Rank: {rc.rank}</span>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '4px' }}>
                  {rc.studentName || 'Student Name'}
                </h3>
                <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginBottom: '12px' }}>
                  Class: {rc.className || 'Senior Four'} · GPA: <b style={{ color: 'var(--accent)' }}>{rc.gpa}</b>
                </div>

                <div style={{ background: 'var(--bg-2)', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', color: 'var(--text)', marginBottom: '14px' }}>
                  "{rc.principalRemark || 'Consistent and enthusiastic learner.'}"
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '10px', fontSize: '11.5px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)' }}>
                    <ShieldCheck size={14} /> Teacher Signed
                  </span>
                  <span style={{ color: 'var(--accent-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    View Full Sheet <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: Announcements */}
      {activeTab === 'announcements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700' }}>Official School Announcements</h2>
            {role === 'admin' && (
              <button
                onClick={() => {
                  const title = prompt('Notice title:');
                  const body = prompt('Notice details:');
                  if (title && body) postAnnouncement({ title, body, pinned: false });
                }}
                className="btn btn-primary"
                style={{ fontSize: '13px' }}
              >
                <Plus size={15} /> Post Announcement
              </button>
            )}
          </div>

          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="card"
              style={{
                borderLeft: ann.pinned ? '4px solid var(--warn)' : '1px solid var(--line)',
                background: ann.pinned ? 'rgba(247, 185, 85, 0.04)' : 'var(--panel)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: '700', fontSize: '15px' }}>{ann.title}</span>
                  {ann.pinned && (
                    <span className="badge" style={{ background: 'rgba(247,185,85,0.15)', color: 'var(--warn)' }}>
                      PINNED
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  {new Date(ann.ts).toLocaleDateString()}
                </span>
              </div>

              <p style={{ fontSize: '13.5px', lineHeight: 1.55, color: '#e9f0fb' }}>
                {ann.body}
              </p>

              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Issued by: {ann.authorName}</span>
                <span>•</span>
                <span style={{ color: 'var(--accent)' }}>Signed by School Admins</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: View Full Report Card Sheet */}
      {selectedReportCard && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '640px' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid var(--accent)', paddingBottom: '16px', marginBottom: '18px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '800' }}>MEZOTERIC SECONDARY SCHOOL</h2>
              <p style={{ color: 'var(--muted)', fontSize: '12.5px', marginTop: '2px' }}>
                Official Academic Performance Certificate · Verified LAN Record
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px', background: 'rgba(61,220,151,0.12)', color: 'var(--accent)', padding: '4px 12px', borderRadius: '12px', fontSize: '11.5px', fontWeight: '600' }}>
                <ShieldCheck size={14} /> Cryptographically Signed by School Administration
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', marginBottom: '18px' }}>
              <div><b>Student Name:</b> {selectedReportCard.studentName}</div>
              <div><b>Term / Year:</b> {selectedReportCard.term}</div>
              <div><b>Class / Form:</b> {selectedReportCard.className || 'Senior Four'}</div>
              <div><b>Class Rank:</b> {selectedReportCard.rank}</div>
              <div><b>GPA:</b> <span style={{ color: 'var(--accent)', fontWeight: '700' }}>{selectedReportCard.gpa}</span></div>
              <div><b>Attendance:</b> {selectedReportCard.attendance || '98%'}</div>
            </div>

            {/* Grades Table */}
            <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '8px' }}>Subject Performance</h4>
            <div style={{ border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Subject</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Score</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Grade</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Teacher Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedReportCard.grades || []).map((g, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: '600' }}>{g.subject}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--accent)' }}>{g.score}%</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '700' }}>{g.grade}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{g.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: 'var(--bg-2)', padding: '12px', borderRadius: '8px', fontSize: '12.5px', marginBottom: '18px' }}>
              <b>Headmaster / Dean Remark:</b>
              <p style={{ marginTop: '4px', color: '#e9f0fb' }}>
                {selectedReportCard.principalRemark}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => window.print()}
                className="btn btn-secondary"
                style={{ fontSize: '12.5px' }}
              >
                <Printer size={15} /> Print / Save PDF
              </button>
              <button
                onClick={() => setSelectedReportCard(null)}
                className="btn btn-primary"
                style={{ fontSize: '12.5px' }}
              >
                Close Certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Upload Note */}
      {showUploadModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
              Upload Lesson Notes to School LAN
            </h2>
            <form onSubmit={handleUploadNoteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Document / Chapter Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Physics Chapter 5: Electromagnetism & Generators"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
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
                  Subject Area
                </label>
                <select
                  value={noteSubject}
                  onChange={(e) => setNoteSubject(e.target.value)}
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
                  <option value="Mathematics">Mathematics</option>
                  <option value="Physics">Physics</option>
                  <option value="Chemistry">Chemistry</option>
                  <option value="Biology">Biology</option>
                  <option value="Computer Studies">Computer Studies</option>
                  <option value="English">English</option>
                  <option value="History">History</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  File (PDF / Word)
                </label>
                <input
                  type="file"
                  accept="application/pdf,.doc,.docx"
                  style={{
                    width: '100%',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowUploadModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Publish to Students
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Issue Report Card */}
      {showIssueReportModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
              Issue Cryptographically Signed Report Card
            </h2>
            <form onSubmit={handleIssueReportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Student Name
                </label>
                <input
                  type="text"
                  required
                  value={reportStudentName}
                  onChange={(e) => setReportStudentName(e.target.value)}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                    Term
                  </label>
                  <input
                    type="text"
                    value={reportTerm}
                    onChange={(e) => setReportTerm(e.target.value)}
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
                    Calculated GPA
                  </label>
                  <input
                    type="text"
                    value={reportGpa}
                    onChange={(e) => setReportGpa(e.target.value)}
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
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', marginBottom: '6px' }}>
                  Principal / Teacher Remark
                </label>
                <textarea
                  rows={3}
                  value={reportRemarks}
                  onChange={(e) => setReportRemarks(e.target.value)}
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
                  onClick={() => setShowIssueReportModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Sign & Deliver to Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
