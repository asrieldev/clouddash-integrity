import VideoMetricResults from './VideoMetricResults.jsx';
import { verifyVideoMetrics } from './matching/verifyMetrics.js';
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Archive,
  Bell,
  BookOpen,
  Boxes,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  CircleUserRound,
  Clock3,
  Cloud,
  Cpu,
  Download,
  FileCheck2,
  FileVideo,
  Gauge,
  HardDriveUpload,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  Lock,
  LockKeyhole,
  LogOut,
  MapPinned,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
  Users as UsersIcon,
  Wallet,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { auditLogs, incidents, initialVideos, fmt } from "./lib";
import { getDashboardMetrics } from "./api";
import { signInWithPassword, signOut, signUp, subscribeToAuth } from "./auth";
import { supabase } from "./supabase";
import { createEvidenceSegment, sha256, verifyEvidenceChain } from "./security/chain";
import { getOrCreateDeviceKeyPair, getStoredDeviceKeyPair, signFingerprint, verifyFingerprintSignature } from "./security/deviceKeys";
import { createDevice, downloadEvidenceSegment, listEvidenceSegments } from "./evidenceRepository";
import { acknowledgeQueuedSegment, clearQueuedSegments, enqueueSegment, flushQueue, listQueuedSegments } from "./storage/offlineQueue";
import { canDeleteLocalVideo, clearLocalVideos, deleteLocalVideo, getLocalVideo, listLocalVideos, purgeExpiredVideos, saveLocalVideo, totalLocalBytes, updateLocalVideo } from "./storage/localEvidenceStore";
import { createEvidenceManifest, parseEvidenceManifest, parseFingerprintFile } from "./security/fingerprintFile";
import { compareVideoHash, verifyTrustedFingerprint } from "./security/verification";
import { createCaptureSession, createIncident, downloadIncidentVideo, endCaptureSession, listFingerprints, listIncidentVideos, storeFingerprint, uploadIncidentVideo } from "./fingerprintRepository";
import { subscribeToEvidence } from "./realtime";
import VerificationHistory from './VerificationHistory.jsx';
import { recordVerification } from './verificationHistory';
import EvaluationLab from './EvaluationLab';
import { extractVideoFingerprints } from './matching/video';

const NAV = [
  { label: "Encoder / transmitter", items: [["Driver capture", "/encoder", Camera]] },
  { label: "Decoder / insurer", items: [["Live monitor", "/", Activity], ["Verify evidence", "/decoder", ShieldCheck], ["Integrity & history", "/integrity", FileCheck2], ["Evaluation lab", "/evaluation", Gauge]] },
  { label: "Operations", items: [["Ingestion queue", "/queue", HardDriveUpload], ["Settings", "/settings", Settings], ["Documentation", "/documentation", BookOpen]] },
];
const chartData = [
  { d: "Mon", v: 18, c: 72 },
  { d: "Tue", v: 25, c: 78 },
  { d: "Wed", v: 20, c: 74 },
  { d: "Thu", v: 34, c: 88 },
  { d: "Fri", v: 29, c: 82 },
  { d: "Sat", v: 16, c: 58 },
  { d: "Sun", v: 22, c: 67 },
];
const pieData = [
  { name: "Collision", value: 42, color: "#ef4444" },
  { name: "Traffic", value: 28, color: "#2563eb" },
  { name: "Pedestrian", value: 18, color: "#f59e0b" },
  { name: "Other", value: 12, color: "#64748b" },
];

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function IconButton({ children, label, onClick }) {
  return (
    <button
      className="icon-button"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
function SectionHead({ title, copy, action }) {
  return (
    <div className="section-head">
      <div>
        <h1>{title}</h1>
        {copy && <p>{copy}</p>}
      </div>
      {action}
    </div>
  );
}
function Metric({ label, value, change, icon: Icon, tone = "blue" }) {
  return (
    <article className="metric">
      <div className={`metric-icon ${tone}`}>
        <Icon size={20} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small className={change?.startsWith("-") ? "negative" : ""}>
          {change}
        </small>
      </div>
    </article>
  );
}
function Empty({ text }) {
  return (
    <div className="empty">
      <CircleHelp size={24} />
      <p>{text}</p>
    </div>
  );
}

function exportCsv(filename, columns, rows) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const content = [columns, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Layout({ children, alerts, setAlerts, session }) {
  const loc = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const user = session?.user;
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Workspace member';
  const email = user?.email || '';
  async function handleSignOut() {
    if (!supabase) return;
    await signOut();
    setProfileOpen(false);
  }
  return (
    <div className="focused-shell">
      <aside className="app-sidepanel">
        <NavLink to="/" className="app-identity" aria-label="CloudDash home">
          <span className="brand-mark"><ShieldCheck size={19} /></span>
          <span>
            <small>INTEGRITY RELAY</small>
            <strong>CloudDash</strong>
          </span>
        </NavLink>
        <nav className="side-navigation" aria-label="Primary navigation">
          {NAV.map((group) => <div className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.items.map(([name, path, Icon]) => (
              <NavLink key={path} to={path} end={path === "/"}>
                <Icon size={16} />
                {name}
              </NavLink>
            ))}
          </div>)}
        </nav>
        <div className="side-status">
          <div className="profile-control">
            <button
              className="side-profile"
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              aria-expanded={profileOpen}
              aria-controls="account-panel"
              aria-label="Open account details"
              title="Account details"
            >
              <CircleUserRound size={16} />
            </button>
            {profileOpen && (
              <section className="account-panel" id="account-panel" aria-label="Account details">
                <div className="account-panel-head">
                  <CircleUserRound size={18} />
                  <div><strong>{displayName}</strong><span>Signed in</span></div>
                </div>
                <dl>
                  <div><dt>Email</dt><dd>{email}</dd></div>
                  <div><dt>Workspace access</dt><dd>RLS controlled</dd></div>
                  <div><dt>Authentication</dt><dd>Supabase Auth</dd></div>
                </dl>
                {supabase && <button className="account-signout" type="button" onClick={handleSignOut}><LogOut size={15} /> Sign out</button>}
              </section>
            )}
          </div>
          <span className="signal" /> Secure sync
        </div>
      </aside>
      <main className="focused-main">
        {children}
      </main>
    </div>
  );
}

function Monitor({ videos, notify }) {
  const [stored, setStored] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const records = stored;
  const reload = async () => {
    if (!supabase) return;
    try {
      const { data: workspaceId, error } = await supabase.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' });
      if (error) throw error;
      const fingerprints = await listFingerprints(workspaceId);
      setStored(fingerprints.map((record) => ({
        id: record.id,
        name: `fingerprint-${record.sequence}`,
        captured: new Date(record.captured_at).toLocaleString(),
        capturedAt: record.captured_at,
        location: record.devices?.label || 'Driver dashcam',
        deviceId: record.device_id,
        sessionId: record.session_id,
        segmentId: record.segment_id,
        version: Number(record.version ?? 1),
        sequence: record.sequence,
        bytes: record.bytes,
        hash: record.sha256,
        integrity: 'SENT',
      })));
    } catch (error) { notify(`Could not refresh live evidence: ${error.message}`); }
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    if (!supabase) return undefined;
    let channel;
    supabase.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' }).then(({ data: workspaceId }) => {
      if (workspaceId) channel = subscribeToEvidence(workspaceId, reload, reload);
    });
    return () => channel?.unsubscribe();
  }, []);
  const valid = records.filter((video) => video.integrity === "SENT").length;
  const legacyCount = records.filter(record => record.version < 2 || !record.sessionId).length;
  const sessions = [...records]
    .sort((a, b) => new Date(a.capturedAt || 0) - new Date(b.capturedAt || 0))
    .reduce((groups, record) => {
      const deviceId = record.deviceId || record.location || 'local';
      const legacy = record.version < 2 || !record.sessionId;
      const id = legacy ? `legacy:${deviceId}` : record.sessionId;
      const capturedAt = new Date(record.capturedAt || 0).getTime();
      let session = groups.find(group => group.id === id);
      if (!session) {
        session = { id, deviceId, device: record.location, startAt: capturedAt, endAt: capturedAt, legacy, records: [] };
        groups.push(session);
      }
      session.records.push(record);
      session.startAt = Math.min(session.startAt, capturedAt);
      session.endAt = Math.max(session.endAt, capturedAt);
      return groups;
    }, []);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || sessions.at(-1);
  const formatWindow = (session) => {
    const start = new Date(session.startAt);
    const end = new Date(session.endAt);
    return Number.isNaN(start.getTime()) ? 'Local demo data' : `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };
  return (
    <div className="page monitor-page">
      <SectionHead
        title="Live monitor"
        copy="A concise view of cloud-acknowledged evidence fingerprints."
        action={<button className="button secondary" onClick={reload}><Activity size={16} /> Refresh</button>}
      />
      <section className="metrics monitor-metrics">
        <Metric label="Evidence records" value={records.length} change="Stored evidence segments" icon={FileVideo} />
        <Metric label="Cloud acknowledged" value={valid} change="Fingerprint inserts accepted" icon={ShieldCheck} tone="green" />
        <Metric label="Legacy records" value={legacyCount} change="No capture-session guarantee" icon={AlertTriangle} tone="amber" />
        <Metric label="Capture devices" value={new Set(records.map(record => record.deviceId)).size} change="Devices in cloud stream" icon={Camera} tone="violet" />
      </section>
      <VerificationHistory />
      <section className="panel monitor-sessions">
        <div className="panel-title">
          <div><h2>Evidence sessions</h2><p>Cloud records grouped by their signed capture-session identity.</p></div>
          <NavLink className="button secondary" to="/encoder"><Camera size={16} /> Open capture</NavLink>
        </div>
        {sessions.length ? <div className="table-wrap"><table><thead><tr><th>Session</th><th>Device</th><th>Capture window</th><th>Segments</th><th>Size</th><th>Integrity</th><th /></tr></thead><tbody>
          {sessions.map((session, index) => {
            const totalBytes = session.records.reduce((total, record) => total + (record.bytes || 0), 0);
            return <tr key={session.id} className="clickable" onClick={() => setSelectedSessionId(session.id)}><td><b>{session.legacy ? 'Legacy evidence' : `Session ${String(index + 1).padStart(2, '0')}`}</b><small>{session.legacy ? session.deviceId.slice(0, 8) : session.id.slice(0, 8)}</small></td><td>{session.device}</td><td>{formatWindow(session)}</td><td>{session.records.length}</td><td>{totalBytes ? `${Math.max(1, Math.round(totalBytes / 1024))} KB` : 'Pending'}</td><td><Badge tone={session.legacy ? 'warning' : 'success'}>{session.legacy ? 'Legacy / review' : 'Cloud acknowledged'}</Badge></td><td><NavLink to="/integrity" className="text-button" onClick={(event) => event.stopPropagation()}>Audit</NavLink></td></tr>;
          })}
        </tbody></table></div> : <Empty text="No evidence sessions yet. Start Driver capture to create one." />}
      </section>
      <section className="panel fingerprint-stream">
        <div className="panel-title"><div><h2>{selectedSession ? 'Selected session segments' : 'Incoming fingerprints'}</h2><p>{selectedSession ? `${selectedSession.device} - ${formatWindow(selectedSession)}` : 'Fingerprints acknowledged by the evidence service.'}</p></div>{selectedSession && <Badge tone="info">{selectedSession.records.length} segments</Badge>}</div>
        <div className="fingerprint-list">{(selectedSession?.records || records).map((video, index) => <div key={video.id}><span>{video.sessionId ? `${video.sessionId.slice(0, 6)} · #${video.sequence}` : `legacy · #${video.sequence ?? index}`}</span><b>{video.name || video.id}</b><code>{video.hash}</code><Badge tone={video.version >= 2 ? "success" : "warning"}>{video.version >= 2 ? "sent" : "legacy"}</Badge></div>)}</div>
      </section>
    </div>
  );
}

function Dashboard({ videos, alerts, setAlerts }) {
  return (
    <div className="page">
      <SectionHead
        title="Command center"
        copy="Evidence operations at a glance. Last updated just now."
        action={
          <button className="button primary">
            <HardDriveUpload size={17} />
            Upload evidence
          </button>
        }
      />
      <section className="metrics">
        <Metric
          label="Evidence processed"
          value="1,284"
          change="+12.4% this month"
          icon={FileCheck2}
        />
        <Metric
          label="Open incidents"
          value="18"
          change="3 require review"
          icon={AlertTriangle}
          tone="amber"
        />
        <Metric
          label="Integrity verified"
          value="99.8%"
          change="1 evidence under review"
          icon={ShieldCheck}
          tone="green"
        />
        <Metric
          label="Cloud spend"
          value="$1,842"
          change="-8.2% vs forecast"
          icon={Wallet}
          tone="violet"
        />
      </section>
      <section className="dash-grid">
        <article className="panel wide">
          <div className="panel-title">
            <div>
              <h2>Evidence activity</h2>
              <p>Processed video volume this week</p>
            </div>
            <button className="text-button">
              Last 7 days <ChevronDown size={15} />
            </button>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity=".35" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#263244" />
                <XAxis dataKey="d" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#area)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="panel">
          <div className="panel-title">
            <div>
              <h2>System health</h2>
              <p>Core pipeline services</p>
            </div>
            <Badge tone="success">Healthy</Badge>
          </div>
          <div className="health-list">
            {[
              ["Ingestion gateway", "99.99%", "success"],
              ["AI analysis workers", "98.6%", "success"],
              ["Integrity ledger", "99.9%", "success"],
              ["Notification delivery", "99.2%", "success"],
            ].map((x) => (
              <div key={x[0]}>
                <span className={`signal ${x[2]}`} />
                <b>{x[0]}</b>
                <small>{x[1]}</small>
              </div>
            ))}
          </div>
          <button className="text-button full">
            View system health <span>→</span>
          </button>
        </article>
        <article className="panel">
          <div className="panel-title">
            <div>
              <h2>Priority alerts</h2>
              <p>Requires analyst attention</p>
            </div>
            <button className="text-button">View all</button>
          </div>
          <div className="alert-list">
            {alerts.slice(0, 3).map((a) => (
              <div key={a.id} className="alert-row">
                <span className={`severity-dot ${a.severity}`} />
                <div>
                  <b>{a.title}</b>
                  <small>
                    {a.time} · {a.source}
                  </small>
                </div>
                <IconButton label="Review alert">
                  <ChevronDown size={16} />
                </IconButton>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-title">
            <div>
              <h2>Recent incidents</h2>
              <p>AI-detected evidence events</p>
            </div>
            <button className="text-button">View all</button>
          </div>
          <div className="incident-list">
            {incidents.map((i) => (
              <div key={i.id}>
                <Badge tone={i.severity}>{i.severity}</Badge>
                <div>
                  <b>{i.title}</b>
                  <small>
                    {i.id} · {i.location}
                  </small>
                </div>
                <strong>{i.confidence}%</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Ingestion activity</h2>
            <p>Latest evidence processing jobs</p>
          </div>
          <button className="text-button">
            Open queue <span>→</span>
          </button>
        </div>
        <EvidenceTable videos={videos.slice(0, 3)} compact />
      </section>
    </div>
  );
}

function EvidenceTable({ videos, compact, onSelect, onPlay, statusLabel = 'Analysis' }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Evidence</th>
            <th>Capture location</th>
            <th>Integrity</th>
            <th>{statusLabel}</th>
            {!compact && onPlay && <th>Play</th>}
          </tr>
        </thead>
        <tbody>
          {videos.map((v) => (
            <tr
              key={v.id}
              onClick={() => onSelect?.(v)}
              className={onSelect ? "clickable" : ""}
            >
              <td>
                <div className="evidence-cell">
                  <div className="video-icon">
                    <Play size={13} />
                  </div>
                  <div>
                    <b>{v.name}</b>
                    <small>
                      {v.id} · {v.duration} · {v.size}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                {v.location}
                <small>{v.captured}</small>
              </td>
              <td>
                <Badge
                  tone={v.integrity === "SENT" ? "success" : v.integrity === "FAILED" ? "danger" : "warning"}
                >
                  {v.integrity}
                </Badge>
              </td>
              <td>
                <Badge
                  tone={v.status === "Analysis complete" ? "info" : "neutral"}
                >
                  {v.status}
                </Badge>
              </td>
              {!compact && onPlay && (
                <td>
                  <IconButton label={`Play ${v.name}`} onClick={(event) => {
                    event.stopPropagation();
                    onPlay(v);
                  }}>
                    <Play size={17} />
                  </IconButton>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Evidence({ videos, setVideos, notify }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(videos[0]);
  const [upload, setUpload] = useState(false);
  const [progress, setProgress] = useState(0);
  const [storedVideos, setStoredVideos] = useState([]);
  const [localVideos, setLocalVideos] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [playback, setPlayback] = useState(null);
  const playbackUrlRef = useRef(null);
  const localUrlsRef = useRef([]);
  const allVideos = [...localVideos, ...(storedVideos.length ? storedVideos : videos)];
  useEffect(() => {
    if (!supabase) return;
    listEvidenceSegments()
      .then((segments) => {
        const records = segments.map((segment) => ({
          id: segment.id,
          name: segment.object_path.split('/').pop(),
          size: `${Math.max(1, Math.round(segment.bytes / 1024))} KB`,
          location: segment.devices?.label || "Driver dashcam",
          captured: new Date(segment.captured_at).toLocaleString(),
          hash: segment.sha256,
          integrity: segment.status === "transmitted" ? "SENT" : "QUEUED",
          status: segment.status,
          severity: segment.locked ? "high" : "low",
          objectPath: segment.object_path,
        }));
        setStoredVideos(records);
        if (records[0]) setSelected(records[0]);
      })
      .catch((error) => notify(`Could not load stored evidence: ${error.message}`));
  }, [notify]);
  useEffect(() => () => {
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    localUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const filtered = allVideos.filter(
    (v) =>
      v.name.toLowerCase().includes(query.toLowerCase()) ||
      v.id.toLowerCase().includes(query.toLowerCase()),
  );
  async function uploadFile(file) {
    if (!file) return;
    setUpload(true);
    setProgress(0);
    try {
      const localHash = await sha256(new Uint8Array(await file.arrayBuffer()));
      const serverRecord = allVideos.find((video) => video.hash === localHash);
      const item = {
        id: serverRecord?.id || `LOCAL-${Date.now().toString(36).toUpperCase()}`,
        name: file.name,
        size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        location: "Local verification file",
        captured: "Local file",
        hash: localHash,
        integrity: serverRecord ? "Cloud fingerprint found" : "No matching server record",
        status: serverRecord ? "Hash matched" : "Local hash calculated",
        severity: serverRecord ? "low" : "medium",
        localUrl: URL.createObjectURL(file),
      };
      localUrlsRef.current.push(item.localUrl);
      setProgress(100);
      setLocalVideos((items) => [item, ...items]);
      setSelected(item);
      notify(serverRecord ? "File verified: SHA-256 matches the stored evidence." : "Local SHA-256 calculated. No stored match was found.");
    } catch (error) {
      notify(`Could not verify this file: ${error.message}`);
    } finally {
      setUpload(false);
    }
  }
  async function downloadSelected() {
    if (!selected.objectPath) {
      notify("Downloads are available for recordings created with Driver capture.");
      return;
    }
    setDownloading(true);
    try {
      const blob = await downloadEvidenceSegment(selected.objectPath);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = selected.name;
      anchor.click();
      URL.revokeObjectURL(url);
      notify("Video downloaded. Add it here again to verify its SHA-256 fingerprint.");
    } catch (error) {
      notify(`Could not download video: ${error.message}`);
    } finally {
      setDownloading(false);
    }
  }
  async function playEvidence(video) {
    try {
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
      if (video.localUrl) {
        playbackUrlRef.current = null;
        setPlayback({ name: video.name, url: video.localUrl, integrity: video.integrity, hash: video.hash });
        return;
      }
      if (!video.objectPath) throw new Error('This sample record has no stored video. Record a new clip first.');
      const blob = await downloadEvidenceSegment(video.objectPath);
      const url = URL.createObjectURL(blob);
      playbackUrlRef.current = url;
      setPlayback({ name: video.name, url, integrity: video.integrity, hash: video.hash });
    } catch (error) {
      notify(`Could not play video: ${error.message}`);
    }
  }
  return (
    <div className="page">
      <SectionHead
        title="Verify evidence"
        copy="Load a submitted recording or add a local clip to inspect its integrity record."
        action={
          <label className="button primary">
            <HardDriveUpload size={17} />
            Upload evidence
            <input
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => uploadFile(e.target.files?.[0])}
            />
          </label>
        }
      />
      <section className="evidence-layout">
        <div>
          <article className="panel upload-zone">
            <HardDriveUpload size={25} />
            <div className="upload-zone-copy">
              <span>Evidence intake</span>
              <b>Open a recording to verify it</b>
              <p>Add a downloaded MP4, MOV, or WebM clip. CloudDash calculates its SHA-256 fingerprint and checks it against the stored evidence record.</p>
            </div>
            <div className="upload-library-stat"><b>{storedVideos.length}</b><span>cloud clip{storedVideos.length === 1 ? "" : "s"}</span></div>
            <label className="button secondary">
              Choose video
              <input
                type="file"
                accept="video/*"
                hidden
                onChange={(e) => uploadFile(e.target.files?.[0])}
              />
            </label>
            {upload && (
              <div className="progress">
                <span style={{ width: `${progress}%` }} />
                <b>{progress}% uploading</b>
              </div>
            )}
          </article>
          <article className="panel">
            <div className="toolbar">
              <div className="search wide">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search evidence ID or filename"
                />
              </div>
              <button className="button secondary">
                <ListFilter size={16} />
                Filters
              </button>
            </div>
            <EvidenceTable videos={filtered} onSelect={setSelected} onPlay={playEvidence} />
            {filtered.length === 0 && (
              <Empty text="No evidence matches this search." />
            )}
          </article>
        </div>
        <aside className="detail panel">
          <div className="detail-head">
            <div>
              <h2>{selected.name}</h2>
              <p>
                {selected.id} · Captured {selected.captured}
              </p>
            </div>
            <Badge tone={selected.severity}>{selected.severity}</Badge>
          </div>
          <div className="detail-block">
            <h3>Integrity result</h3>
            <div className="verify">
              <ShieldCheck size={20} />
              <div>
                <b>{selected.integrity}</b>
                <small>Fingerprint is stored with this evidence record.</small>
              </div>
            </div>
            <code className="evidence-hash">{selected.hash}</code>
          </div>
          <div className="detail-block">
            <h3>Chain details</h3>
            <dl className="evidence-details">
              <div><dt>Evidence ID</dt><dd>{selected.id}</dd></div>
              <div><dt>Captured</dt><dd>{selected.captured}</dd></div>
              <div><dt>File size</dt><dd>{selected.size}</dd></div>
              <div><dt>Source</dt><dd>{selected.location}</dd></div>
            </dl>
          </div>
          <button className="button secondary full" onClick={downloadSelected} disabled={downloading}>
            <Download size={16} />
            {downloading ? "Downloading..." : "Download video"}
          </button>
        </aside>
      </section>
      {playback && <div className="video-modal" role="dialog" aria-modal="true" aria-label={`Play ${playback.name}`}>
        <article className="video-modal-content">
          <header className="video-modal-header">
            <div>
              <span>Evidence preview</span>
              <b>{playback.name}</b>
            </div>
            <div>
              {playback.integrity && <Badge tone={playback.integrity === "Cloud fingerprint found" ? "success" : "warning"}>{playback.integrity}</Badge>}
              <IconButton label="Close video player" onClick={() => setPlayback(null)}><X size={18} /></IconButton>
            </div>
          </header>
          <div className="video-player-stage">
            <video src={playback.url} controls autoPlay playsInline />
          </div>
          {playback.hash && <footer className="video-modal-footer"><span>SHA-256</span><code>{playback.hash}</code></footer>}
        </article>
      </div>}
    </div>
  );
}

function Encoder({ notify }) {
  const [recording, setRecording] = useState(false);
  const [offline, setOffline] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [incidentActive, setIncidentActive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastClip, setLastClip] = useState(null);
  const [segmentLength, setSegmentLength] = useState(5);
  const [retentionMinutes, setRetentionMinutes] = useState(3);
  const [incidentBefore, setIncidentBefore] = useState(2);
  const [incidentAfter, setIncidentAfter] = useState(2);
  const [recordingSource, setRecordingSource] = useState('camera');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState([]);
  const [outbox, setOutbox] = useState([]);
  const [storedBytes, setStoredBytes] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const identityRef = useRef(null);
  const previousHashRef = useRef(null);
  const nextSequenceRef = useRef(0);
  const captureSessionIdRef = useRef(null);
  const captureSessionStartedAtRef = useRef(null);
  const offlineRef = useRef(false);
  const lastClipUrlRef = useRef(null);
  const recordingRef = useRef(false);
  const segmentTimerRef = useRef(null);
  const segmentLengthRef = useRef(5);
  const simulationVideoRef = useRef(null);
  const incidentIdRef = useRef(null);
  const incidentRemainingRef = useRef(0);
  const [segments, setSegments] = useState([]);
  useEffect(() => { offlineRef.current = offline; }, [offline]);
  useEffect(() => { segmentLengthRef.current = segmentLength; }, [segmentLength]);
  useEffect(() => {
    if (!recording) return;
    const seconds = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(seconds);
  }, [recording]);
  useEffect(() => {
    if (recording && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [recording]);
  useEffect(() => () => {
    recordingRef.current = false;
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    else streamRef.current?.getTracks().forEach((track) => track.stop());
    simulationVideoRef.current?.stop?.();
    simulationVideoRef.current = null;
    if (lastClipUrlRef.current) URL.revokeObjectURL(lastClipUrlRef.current);
  }, []);
  useEffect(() => {
    const retry = () => syncQueuedSegments(identityRef.current?.deviceId);
    window.addEventListener('online', retry);
    retry();
    return () => window.removeEventListener('online', retry);
  }, []);
  useEffect(() => {
    const removeExpiredLocalVideo = async () => {
      const result = await purgeExpiredVideos(retentionMinutes);
      if (result.deleted.length) await refreshLocalEvidence();
    };
    removeExpiredLocalVideo();
    const timer = setInterval(removeExpiredLocalVideo, 10000);
    return () => clearInterval(timer);
  }, [retentionMinutes]);

  function toDisplaySegment(record) {
    return {
      ...record,
      seq: record.sequence,
      sessionId: record.sessionId || null,
      time: new Date(record.capturedAt).toLocaleTimeString('en-GB'),
      hash: record.sha256.slice(0, 12),
      fullHash: record.sha256,
      size: `${Math.max(1, Math.round(record.bytes / 1024))} KB`,
      state: record.state,
      preview: { sequence: record.sequence, extension: record.mimeType?.includes('mp4') ? 'mp4' : 'webm' }
    };
  }

  async function refreshLocalEvidence(deviceId = identityRef.current?.deviceId) {
    if (!deviceId) return;
    const records = await listLocalVideos(deviceId);
    setSegments(records.map(toDisplaySegment));
    setSelectedSegmentIds(current => current.filter(id => records.some(record => record.id === id && canDeleteLocalVideo(record))));
    setStoredBytes(await totalLocalBytes(deviceId));
    setOutbox(await listQueuedSegments(deviceId));
  }

  async function prepareIdentity() {
    if (identityRef.current) return identityRef.current;
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sign in is required before recording.');
    const { data: workspaceId, error: workspaceError } = await supabase.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' });
    if (workspaceError) throw workspaceError;
    const storageKey = `clouddash-device:${user.id}`;
    let deviceId = localStorage.getItem(storageKey) || crypto.randomUUID();
    let { data: device, error: deviceLookupError } = await supabase.from('devices').select('id, public_key').eq('id', deviceId).eq('workspace_id', workspaceId).maybeSingle();
    if (deviceLookupError) throw deviceLookupError;
    let keys = device ? await getStoredDeviceKeyPair(deviceId) : null;
    if (device && (!keys || device.public_key !== JSON.stringify(keys.publicJwk))) {
      deviceId = crypto.randomUUID();
      device = null;
      keys = null;
    }
    keys ||= await getOrCreateDeviceKeyPair(deviceId);
    if (!device) {
      device = await createDevice(workspaceId, user.id, keys.publicJwk, 'Driver Dashcam', deviceId);
      localStorage.setItem(storageKey, deviceId);
    }
    identityRef.current = { workspaceId, deviceId: device.id, keys };
    const cloudRecords = await listFingerprints(workspaceId);
    setSentCount(cloudRecords.filter(record => record.device_id === device.id).length);
    await refreshLocalEvidence(device.id);
    return identityRef.current;
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const localDeviceId = user ? localStorage.getItem(`clouddash-device:${user.id}`) : null;
        if (active && localDeviceId) await refreshLocalEvidence(localDeviceId);
        if (active) {
          const identity = await prepareIdentity();
          await syncQueuedSegments(identity.deviceId);
        }
      } catch (error) {
        if (active) notify(`Cloud setup failed; retained local video is still available: ${error.message}`);
      }
    })();
    return () => { active = false; };
  }, []);

  async function uploadLockedRecord(record, incidentId) {
    if (!record?.fingerprintId || !record?.blob) return;
    const uploaded = await uploadIncidentVideo({
      workspaceId: record.workspaceId,
      deviceId: record.deviceId,
      incidentId,
      segment: record,
      blob: record.blob
    });
    await updateLocalVideo(record.id, { incidentId, locked: true, cloudEvidenceId: uploaded.id, cloudStoragePath: uploaded.storage_path });
  }

  async function syncQueuedSegments(deviceId = identityRef.current?.deviceId) {
    if (!deviceId || offlineRef.current || !navigator.onLine) return;
    setSyncing(true);
    try {
      const result = await flushQueue(async (queued) => {
        const queuedFingerprint = queued.fingerprint;
        if (Number(queuedFingerprint.version ?? 1) >= 2) {
          await createCaptureSession(
            queuedFingerprint.workspaceId ?? queuedFingerprint.workspace_id,
            queuedFingerprint.deviceId ?? queuedFingerprint.device_id,
            queuedFingerprint.sessionId ?? queuedFingerprint.session_id,
            queuedFingerprint.sessionStartedAt ?? queuedFingerprint.capturedAt ?? queuedFingerprint.captured_at
          );
        }
        const stored = await storeFingerprint(queued.fingerprint);
        const record = await updateLocalVideo(queued.localVideoId, { state: 'SENT', fingerprintId: stored.id, transmissionError: null });
        if (queued.incidentId && record) await uploadLockedRecord(record, queued.incidentId);
      }, async item => {
        if (item.localVideoId && item.state !== 'SENT') {
          await updateLocalVideo(item.localVideoId, { state: item.state, transmissionError: item.lastError || null });
        }
        await refreshLocalEvidence();
      }, deviceId);
      await refreshLocalEvidence();
      if (result.sent) {
        const identity = identityRef.current;
        if (identity) {
          const cloudRecords = await listFingerprints(identity.workspaceId);
          setSentCount(cloudRecords.filter(record => record.device_id === identity.deviceId).length);
        }
        notify(`${result.sent} queued fingerprint${result.sent === 1 ? '' : 's'} sent.`);
      }
      if (result.failed) {
        const firstError = result.failures[0]?.lastError || 'Transmission failed.';
        notify(`${result.failed} fingerprint${result.failed === 1 ? '' : 's'} remain queued: ${firstError}`);
      }
    } catch (error) {
      notify(`Outbox retry failed: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }
  async function persistChunk(blob, fileInfo) {
    const identity = await prepareIdentity();
    const sessionId = captureSessionIdRef.current;
    if (!sessionId) throw new Error('No active capture session. Start the dashcam again.');
    const capturedAt = new Date().toISOString();
    const sequence = nextSequenceRef.current++;
    const segmentId = crypto.randomUUID();
    const shouldLock = incidentRemainingRef.current > 0;
    const incidentId = shouldLock ? incidentIdRef.current : null;
    if (shouldLock) incidentRemainingRef.current -= 1;
    if (incidentRemainingRef.current === 0) setIncidentActive(false);
    let perceptual;
    try { perceptual = await extractVideoFingerprints(blob); }
    catch (error) { perceptual = { schema: 'clouddash-perceptual-v1', frames: [], error: error.message }; notify(`Exact evidence saved; perceptual extraction unavailable: ${error.message}`); }
    const segment = await createEvidenceSegment({ version: 3, perceptual, ...identity, sessionId, segmentId, sequence, capturedAt, bytes: blob.size, contentHash: await sha256(new Uint8Array(await blob.arrayBuffer())), previousHash: previousHashRef.current, metadata: { locked: shouldLock, source: 'browser-media-recorder', ...fileInfo } });
    previousHashRef.current = segment.chainHash;
    const fingerprint = { ...segment, sessionStartedAt: captureSessionStartedAtRef.current || capturedAt, signatureAlgorithm: 'ECDSA_P256_SHA256', source: 'recorded-video-segment' };
    fingerprint.signature = await signFingerprint(identity.keys.privateKey, fingerprint);
    const localRecord = {
      id: segmentId,
      segmentId,
      sessionId,
      workspaceId: identity.workspaceId,
      deviceId: identity.deviceId,
      sequence,
      blob,
      mimeType: fileInfo.mimeType,
      bytes: blob.size,
      capturedAt,
      sha256: segment.sha256,
      previousHash: segment.previousHash,
      chainHash: segment.chainHash,
      signature: fingerprint.signature,
      signatureAlgorithm: fingerprint.signatureAlgorithm,
      fingerprint,
      locked: shouldLock,
      incidentId,
      state: 'LOCAL'
    };
    await saveLocalVideo(localRecord);
    // Durable write-ahead outbox: a closed tab during an online send remains retryable.
    await enqueueSegment({ kind: 'fingerprint', fingerprint, localVideoId: localRecord.id, incidentId });
    let result;
    if (offlineRef.current || !navigator.onLine) {
      await enqueueSegment({ kind: 'fingerprint', fingerprint, localVideoId: localRecord.id, incidentId });
      await updateLocalVideo(localRecord.id, { state: 'QUEUED' });
      result = { queued: true };
    } else {
      try {
        const stored = await storeFingerprint(fingerprint);
        await updateLocalVideo(localRecord.id, { state: 'SENT', fingerprintId: stored.id });
        setSentCount(count => count + (stored.idempotent ? 0 : 1));
        result = { queued: false };
        if (shouldLock) {
          try {
            await uploadLockedRecord({ ...localRecord, fingerprintId: stored.id }, incidentId);
          } catch (incidentError) {
            await enqueueSegment({ kind: 'fingerprint', fingerprint, localVideoId: localRecord.id, incidentId });
            await updateLocalVideo(localRecord.id, { state: 'SENT', fingerprintId: stored.id, transmissionError: `Incident upload pending: ${incidentError.message}` });
            result = { queued: true, error: incidentError };
            notify(`Fingerprint sent; incident video upload queued: ${incidentError.message}`);
          }
        }
      } catch (error) {
        await enqueueSegment({ kind: 'fingerprint', fingerprint, localVideoId: localRecord.id, incidentId });
        await updateLocalVideo(localRecord.id, { state: 'FAILED', transmissionError: error.message });
        result = { queued: true, error };
        notify(`Fingerprint queued: ${error.message}`);
      }
    }
    if (!result.queued) await acknowledgeQueuedSegment(segmentId);
    await refreshLocalEvidence();
    await openLocalClip(localRecord);
    return result;
  }

  async function openLocalClip(segment) {
    const record = segment.blob ? segment : await getLocalVideo(segment.id);
    if (!record?.blob) return;
    if (lastClipUrlRef.current) URL.revokeObjectURL(lastClipUrlRef.current);
    const url = URL.createObjectURL(record.blob);
    lastClipUrlRef.current = url;
    setLastClip({ id: record.id, url, sequence: record.sequence, extension: record.mimeType?.includes('mp4') ? 'mp4' : 'webm' });
  }

  function toggleSegmentSelection(id) {
    setSelectedSegmentIds(current => current.includes(id) ? current.filter(selectedId => selectedId !== id) : [...current, id]);
  }

  async function deleteSelectedLocalVideos() {
    const selected = segments.filter(segment => selectedSegmentIds.includes(segment.id));
    const removable = selected.filter(canDeleteLocalVideo);
    if (!removable.length) return notify('Select an unlocked, cloud-acknowledged local recording first.');
    if (!window.confirm(`Delete ${removable.length} selected local video${removable.length === 1 ? '' : 's'}? Cloud fingerprints will be retained.`)) return;
    await Promise.all(removable.map(segment => deleteLocalVideo(segment.id)));
    if (lastClip && removable.some(segment => segment.id === lastClip.id)) {
      if (lastClipUrlRef.current) URL.revokeObjectURL(lastClipUrlRef.current);
      lastClipUrlRef.current = null;
      setLastClip(null);
    }
    setSelectedSegmentIds([]);
    await refreshLocalEvidence();
    notify(`${removable.length} local video${removable.length === 1 ? '' : 's'} deleted. Trusted cloud fingerprints were retained.`);
  }

  async function clearDeviceStorage() {
    if (recording) return;
    const identity = await prepareIdentity();
    if (!window.confirm('Clear every local video and outbox item for this device? Cloud records and the device signing key will remain.')) return;
    const [videosRemoved, queueRemoved] = await Promise.all([
      clearLocalVideos(identity.deviceId),
      clearQueuedSegments(identity.deviceId)
    ]);
    if (lastClipUrlRef.current) URL.revokeObjectURL(lastClipUrlRef.current);
    lastClipUrlRef.current = null;
    setLastClip(null);
    setSelectedSegmentIds([]);
    setActiveSessionId(null);
    await refreshLocalEvidence(identity.deviceId);
    notify(`Local storage cleared: ${videosRemoved} video${videosRemoved === 1 ? '' : 's'} and ${queueRemoved} outbox item${queueRemoved === 1 ? '' : 's'} removed.`);
  }

  async function downloadLocalClip(segment) {
    const record = segment.blob ? segment : await getLocalVideo(segment.id);
    if (!record?.blob) return notify('The local video is no longer available.');
    const calculatedHash = await sha256(new Uint8Array(await record.blob.arrayBuffer()));
    if (calculatedHash !== record.sha256) {
      notify('LOCAL_TAMPER_DETECTED: download blocked because local video bytes no longer match their signed fingerprint.');
      return;
    }
    const url = URL.createObjectURL(record.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `dashcam-${record.sessionId || 'legacy'}-${record.sequence}-${record.segmentId || record.id}.${record.mimeType?.includes('mp4') ? 'mp4' : 'webm'}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(record.state === 'SENT' ? 'Original bytes downloaded. The Decoder can verify this file.' : 'Original bytes downloaded, but cloud verification will remain NOT_FOUND until its fingerprint is SENT.');
  }
  function downloadFingerprint(segment) {
    const manifest = createEvidenceManifest(segment.fingerprint || segment);
    if (manifest.version < 2 || !manifest.segmentId || !manifest.sessionId) return notify('LEGACY_EVIDENCE: this recording has no session-bound manifest.');
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `clouddash-evidence-${manifest.segmentId}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function lockIncidentWindow() {
    try {
      const identity = await prepareIdentity();
      const incident = await createIncident(identity.workspaceId, identity.deviceId);
      incidentIdRef.current = incident.id;
      incidentRemainingRef.current = incidentAfter + 1;
      setIncidentActive(true);
      const sessionSegments = segments.filter(segment => segment.sessionId === captureSessionIdRef.current);
      for (const segment of sessionSegments.slice(0, incidentBefore)) {
        const record = await updateLocalVideo(segment.id, { locked: true, incidentId: incident.id });
        if (!record) continue;
        if (record.state === 'SENT' && record.fingerprintId && navigator.onLine && !offlineRef.current) {
          await uploadLockedRecord(record, incident.id);
        } else if (record.fingerprint) {
          await enqueueSegment({ kind: 'fingerprint', fingerprint: record.fingerprint, localVideoId: record.id, incidentId: incident.id });
        }
      }
      await refreshLocalEvidence();
      notify(`Incident window locked: ${incidentBefore} earlier, the event, and ${incidentAfter} later segments are protected.`);
    } catch (error) {
      notify(`Could not lock incident evidence: ${error.message}`);
    }
  }
  function beginSegment(stream, source) {
    const mimeType = ['video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    const fileInfo = { mimeType: mimeType || 'video/webm', extension: 'webm', source };
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
      const blob = new Blob(chunks, { type: fileInfo.mimeType });
      if (blob.size) {
        try {
          await persistChunk(blob, fileInfo);
        } catch (error) {
          notify(`Segment could not be persisted: ${error.message}`);
        }
      }
      if (recordingRef.current && streamRef.current === stream && stream.active) {
        beginSegment(stream, source);
      } else {
        stream.getTracks().forEach((track) => track.stop());
        simulationVideoRef.current?.stop?.();
        simulationVideoRef.current = null;
        recorderRef.current = null;
        const sessionId = captureSessionIdRef.current;
        captureSessionIdRef.current = null;
        captureSessionStartedAtRef.current = null;
        if (sessionId) endCaptureSession(sessionId).catch(error => notify(`Capture session close failed: ${error.message}`));
      }
    };
    recorder.start();
    recorderRef.current = recorder;
    segmentTimerRef.current = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, segmentLengthRef.current * 1000);
  }
  async function createSimulationStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    if (!canvas.captureStream) throw new Error('This browser cannot record the driving simulation. Use Chrome or Edge.');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.setPixelRatio(1);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#8bc1e8');
    scene.fog = new THREE.Fog('#8bc1e8', 30, 125);
    const camera = new THREE.PerspectiveCamera(55, canvas.width / canvas.height, 0.1, 180);
    camera.position.set(0, 2.65, 6.5);
    camera.lookAt(0, 1, -31);
    scene.add(new THREE.HemisphereLight('#d9efff', '#34533a', 2.1));
    const sun = new THREE.DirectionalLight('#fff0c9', 2.4);
    sun.position.set(-18, 28, 8);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(210, 210), new THREE.MeshLambertMaterial({ color: '#5e9f63' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -62;
    scene.add(ground);
    const road = new THREE.Mesh(new THREE.BoxGeometry(12, 0.16, 180), new THREE.MeshLambertMaterial({ color: '#3d4652' }));
    road.position.set(0, 0, -62);
    scene.add(road);
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: '#e7d26e' });
    [-5.75, 5.75].forEach((x) => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 180), edgeMaterial);
      edge.position.set(x, 0.1, -62);
      scene.add(edge);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 180), new THREE.MeshLambertMaterial({ color: '#a9b3bd' }));
      rail.position.set(x * 1.22, 0.42, -62);
      scene.add(rail);
    });
    for (let index = 0; index < 20; index += 1) {
      [-1, 1].forEach((side) => {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 1.3, 8), new THREE.MeshLambertMaterial({ color: '#714f31' }));
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.86, 2.2, 9), new THREE.MeshLambertMaterial({ color: index % 2 ? '#2f7041' : '#3e844c' }));
        crown.position.y = 1.85;
        tree.add(trunk, crown);
        tree.position.set(side * (9.5 + (index % 3) * 2.3), 0.65, -index * 9 - 12);
        scene.add(tree);
      });
    }
    const laneMarkers = Array.from({ length: 10 }, (_, index) => {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 5.8), new THREE.MeshBasicMaterial({ color: '#fff7cf' }));
      marker.position.set(0, 0.11, -index * 13 - 4);
      scene.add(marker);
      return marker;
    });
    const makeCar = (color) => {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 3.6), new THREE.MeshLambertMaterial({ color }));
      body.position.y = 0.52;
      car.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.58, 1.85), new THREE.MeshLambertMaterial({ color: '#b8d6e6' }));
      cabin.position.set(0, 1.1, -0.25);
      car.add(cabin);
      const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.34, 0.05), new THREE.MeshLambertMaterial({ color: '#5d839b' }));
      rearGlass.rotation.x = -0.43;
      rearGlass.position.set(0, 1.08, 0.71);
      car.add(rearGlass);
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.18, 0.28), new THREE.MeshLambertMaterial({ color: '#151b27' }));
      bumper.position.set(0, 0.34, 1.72);
      car.add(bumper);
      [-0.92, 0.92].forEach((x) => [-1.14, 1.14].forEach((z) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16), new THREE.MeshLambertMaterial({ color: '#15181f' }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.34, z);
        car.add(wheel);
      }));
      const lamps = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: '#ff7373' }));
      lamps.position.set(0, 0.58, 1.84);
      car.add(lamps);
      [-0.42, 0.42].forEach((x) => {
        const lamp = new THREE.PointLight('#ff6262', 1.1, 6);
        lamp.position.set(x, 0.62, 1.9);
        car.add(lamp);
      });
      scene.add(car);
      return car;
    };
    const traffic = [
      { car: makeCar('#347ab5'), lane: 0, start: -32, speed: 0.035, changing: true },
      { car: makeCar('#d77a3e'), lane: -3.05, start: -52, speed: 0.024 },
      { car: makeCar('#d9dce0'), lane: 3.05, start: -76, speed: 0.019 },
    ];
    traffic.forEach((vehicle) => vehicle.car.position.set(vehicle.lane, 0, vehicle.start));
    let frameId;
    let active = true;
    let previousTime = performance.now();
    const render = (time) => {
      const delta = Math.min(42, time - previousTime);
      previousTime = time;
      laneMarkers.forEach((marker) => {
        marker.position.z += delta * 0.045;
        if (marker.position.z > 8) marker.position.z -= 130;
      });
      traffic.forEach((vehicle, index) => {
        vehicle.car.position.z += delta * vehicle.speed;
        if (vehicle.changing) {
          const cycle = (time % 12000) / 12000;
          const smooth = (value) => value * value * (3 - 2 * value);
          const displacement = cycle < 0.2 ? 0
            : cycle < 0.45 ? smooth((cycle - 0.2) / 0.25)
              : cycle < 0.7 ? 1
                : cycle < 0.95 ? 1 - smooth((cycle - 0.7) / 0.25)
                  : 0;
          vehicle.car.position.x = 3.05 * displacement;
          vehicle.car.rotation.y = cycle > 0.2 && cycle < 0.45 ? -0.12 : cycle > 0.7 && cycle < 0.95 ? 0.12 : 0;
        } else {
          vehicle.car.position.x = vehicle.lane + Math.sin(time / (1400 + index * 230)) * 0.08;
        }
        if (vehicle.car.position.z > 8) vehicle.car.position.z = vehicle.start;
      });
      camera.position.x = Math.sin(time / 2100) * 0.035;
      camera.position.y = 2.65 + Math.sin(time / 950) * 0.025;
      camera.lookAt(0, 1, -31);
      renderer.render(scene, camera);
      if (active) frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    const stream = canvas.captureStream(30);
    simulationVideoRef.current = {
      stop: () => {
        active = false;
        cancelAnimationFrame(frameId);
        stream.getTracks().forEach((track) => track.stop());
        scene.traverse((object) => {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose());
        });
        renderer.dispose();
      },
    };
    return stream;
  }
  async function startDashcam() {
    let stream;
    try {
      if (!window.MediaRecorder) throw new Error('This browser does not support video recording.');
      const identity = await prepareIdentity();
      stream = recordingSource === 'simulation'
        ? await createSimulationStream()
        : await navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!stream) throw new Error('This browser does not support camera recording.');
      const sessionId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      if (!offlineRef.current && navigator.onLine) await createCaptureSession(identity.workspaceId, identity.deviceId, sessionId, startedAt);
      captureSessionIdRef.current = sessionId;
      captureSessionStartedAtRef.current = startedAt;
      setActiveSessionId(sessionId);
      nextSequenceRef.current = 0;
      previousHashRef.current = null;
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      recordingRef.current = true;
      setElapsed(0);
      setRecording(true);
      beginSegment(stream, recordingSource);
      notify(`${recordingSource === 'simulation' ? 'Driving simulation' : 'Camera'} session ${sessionId.slice(0, 8)} started. Videos remain on this device; signed fingerprints go to Supabase.`);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      simulationVideoRef.current?.stop?.();
      simulationVideoRef.current = null;
      notify(error.message || 'Camera access was not granted.');
    }
  }
  function stopDashcam() {
    recordingRef.current = false;
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    else {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      simulationVideoRef.current?.stop?.();
      simulationVideoRef.current = null;
    }
    setRecording(false);
    notify('Finalizing the last video segment...');
  }
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const latest = segments.find(segment => segment.state === 'SENT');
  const sessionSegmentCount = activeSessionId ? segments.filter(segment => segment.sessionId === activeSessionId).length : 0;
  const permanentOutbox = outbox.filter(item => item.errorCode === 'EVIDENCE_IDENTITY_CONFLICT');
  const retryableOutbox = outbox.filter(item => item.errorCode !== 'EVIDENCE_IDENTITY_CONFLICT');
  return (
    <div className="page encoder-page">
      <SectionHead
        title="Dashcam encoder"
        copy="Device-side recording, segment hashing, and resilient evidence transmission."
        action={
          <Badge tone={offline ? "warning" : "success"}>
            {offline ? "Uplink queued" : "Uplink online"}
          </Badge>
        }
      />
      <section className="encoder-grid">
        <article className="panel encoder-capture">
          <div className="panel-title">
            <div>
              <h2>Live road recording</h2>
              <p>
                Frames are timestamped, signed, and split into fixed-length
                evidence segments.
              </p>
            </div>
            <Badge tone={recording ? "danger" : "neutral"}>
              {recording ? "Recording" : "Standby"}
            </Badge>
          </div>
          <div className={recording ? "camera-stage active" : "camera-stage"}>
            {recording ? (
              <>
                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <span className="rec-dot">REC {duration}</span>
                <span className="camera-label">
                  {recordingSource === 'simulation' ? 'DRIVING SIMULATION · moving road source' : 'DEVICE 482f15c9 · GPS protected'}
                </span>
              </>
            ) : lastClip ? (
              <div className="recorded-preview">
                <video src={lastClip.url} controls playsInline />
                <span>Latest captured segment #{lastClip.sequence} ({lastClip.extension.toUpperCase()})</span>
              </div>
            ) : (
              <div className="camera-off">
                <Camera size={27} />
                <b>Camera inactive</b>
                <small>Start a simulated secure recording session.</small>
              </div>
            )}
          </div>
          <div className="encoder-actions">
            <button
              className={recording ? "button danger" : "button primary"}
              onClick={recording ? stopDashcam : startDashcam}
            >
              {recording ? (
                <>
                  <X size={16} />
                  Stop dashcam
                </>
              ) : (
                <>
                  <Radio size={16} />
                  Start dashcam
                </>
              )}
            </button>
            <button
              className="button warning"
              disabled={!recording}
              onClick={lockIncidentWindow}
            >
              <AlertTriangle size={16} />
              Lock incident clip
            </button>
            <button
              className="button secondary"
              onClick={() => {
                if (offline) {
                  offlineRef.current = false;
                  setOffline(false);
                  syncQueuedSegments();
                  notify("Uplink restored. Queued segments are uploading.");
                } else {
                  offlineRef.current = true;
                  setOffline(true);
                  notify("Network loss simulated. Segments are retained locally.");
                }
              }}
            >
              {offline ? <Send size={16} /> : <WifiOff size={16} />}{" "}
              {offline ? "Restore uplink" : "Simulate network loss"}
            </button>
            <button className="button secondary" disabled={syncing || !retryableOutbox.length || offline} onClick={syncQueuedSegments}>
              <RefreshCw size={16} /> {syncing ? 'Retrying...' : 'Retry outbox'}
            </button>
          </div>
          <div className="encoder-selects">
            <label>
              Recording source
              <select value={recordingSource} disabled={recording} onChange={(event) => setRecordingSource(event.target.value)}>
                <option value="camera">Camera</option>
                <option value="simulation">Driving simulation</option>
              </select>
            </label>
            <label>
              Segment length
              <select value={segmentLength} onChange={(event) => setSegmentLength(Number(event.target.value))}>
                <option value="5">5 seconds</option>
                <option value="10">10 seconds</option>
                <option value="30">30 seconds</option>
              </select>
            </label>
            <label>
              Local retention
              <select value={retentionMinutes} onChange={(event) => setRetentionMinutes(Number(event.target.value))}>
                <option value="1">1 minute</option>
                <option value="3">3 minutes</option>
                <option value="15">15 minutes</option>
                <option value="60">1 hour</option>
              </select>
            </label>
            <label>
              Incident pre-roll
              <select value={incidentBefore} onChange={(event) => setIncidentBefore(Number(event.target.value))}>
                <option value="1">1 segment</option>
                <option value="2">2 segments</option>
                <option value="3">3 segments</option>
              </select>
            </label>
            <label>
              Incident post-roll
              <select value={incidentAfter} onChange={(event) => setIncidentAfter(Number(event.target.value))}>
                <option value="1">1 segment</option>
                <option value="2">2 segments</option>
                <option value="3">3 segments</option>
              </select>
            </label>
          </div>
        </article>
        <aside className="encoder-side">
          <div className="encoder-metrics">
            <Metric
              label="Elapsed"
              value={duration}
              change={recording ? "Recording active" : "Ready"}
              icon={Clock3}
            />
            <Metric
              label="Session segments"
              value={sessionSegmentCount}
              change={incidentActive ? "Incident window active" : activeSessionId ? `Session ${activeSessionId.slice(0, 8)}` : "No session started"}
              icon={FileVideo}
              tone="green"
            />
            <Metric
              label="Cloud fingerprints"
              value={sentCount}
              change="Acknowledged for this device"
              icon={ShieldCheck}
              tone="violet"
            />
            <Metric
              label="Outbox pending"
              value={outbox.length}
              change={syncing ? "Sending queued fingerprints" : permanentOutbox.length ? `${permanentOutbox.length} legacy conflict${permanentOutbox.length === 1 ? '' : 's'} need review` : outbox.length ? (offline ? "Awaiting uplink" : `${outbox.filter(item => item.state === 'FAILED').length} failed; retry available`) : "No pending fingerprints"}
              icon={Send}
              tone="amber"
            />
          </div>
          <article className="panel fingerprint">
            <div className="panel-title">
              <div>
                <h2>Last transmitted fingerprint</h2>
                <p>Cloud stores this hash and timestamp, not the video.</p>
              </div>
              <Lock size={16} />
            </div>
            {latest ? <dl>
              <dt>segment</dt>
              <dd>{latest.sessionId ? `${latest.sessionId.slice(0, 8)} · ` : 'legacy · '}#{latest.seq} · {latest.time}</dd>
              <dt>segment_hash</dt>
              <dd className="hash-green">{latest.hash}...</dd>
              <dt>chain_status</dt>
              <dd className="hash-blue">Cloud acknowledged · not yet verified</dd>
              <dt>retention</dt>
              <dd>{latest.locked ? "Locked on device" : `${retentionMinutes}-minute local buffer`}</dd>
            </dl> : <p className="muted">No cloud-acknowledged fingerprint yet. Record a clip to begin.</p>}
          </article>
        </aside>
      </section>
      <section className="panel segment-table">
        <div className="panel-title">
          <div>
            <h2>Local recordings on this device ({segments.length})</h2>
            <p>Videos are retained locally only. The cloud receives their timestamped fingerprints.</p>
          </div>
          <div className="section-actions">
            <span className="storage">Browser storage: {(storedBytes / 1024 / 1024).toFixed(1)} MB used</span>
            <button className="button danger" disabled={!selectedSegmentIds.length} onClick={deleteSelectedLocalVideos}><Trash2 size={16} /> Delete selected</button>
            <button className="button secondary" disabled={recording || (!segments.length && !outbox.length)} onClick={clearDeviceStorage}><Archive size={16} /> Clear local storage</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select all deletable local recordings" checked={Boolean(segments.length) && segments.filter(canDeleteLocalVideo).length > 0 && segments.filter(canDeleteLocalVideo).every(segment => selectedSegmentIds.includes(segment.id))} onChange={(event) => setSelectedSegmentIds(event.target.checked ? segments.filter(canDeleteLocalVideo).map(segment => segment.id) : [])} /></th>
                <th>Sequence</th>
                <th>Captured</th>
                <th>Size</th>
                <th>SHA-256</th>
                <th>Fingerprint transmission</th>
                <th>Retention</th>
                <th>Play</th>
                <th>Download</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.id}>
                  <td><input type="checkbox" aria-label={`Select local recording ${s.seq}`} checked={selectedSegmentIds.includes(s.id)} disabled={!canDeleteLocalVideo(s)} title={s.locked ? 'Locked incident evidence cannot be deleted locally.' : s.state !== 'SENT' ? 'Send the fingerprint before deleting its local video.' : 'Select local video'} onChange={() => toggleSegmentSelection(s.id)} /></td>
                  <td>
                    <b>#{s.seq}</b>
                    <small>Session {s.sessionId ? s.sessionId.slice(0, 8) : 'legacy'}</small>
                  </td>
                  <td>{s.time}</td>
                  <td>{s.size}</td>
                  <td>
                    <code>{s.hash}...</code>
                  </td>
                  <td>
                    <Badge tone={s.state === "SENT" ? "success" : s.state === "FAILED" ? "danger" : "warning"}>
                      {s.state}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={s.locked ? "warning" : "neutral"}>
                      {s.locked ? "Locked" : "Local buffer"}
                    </Badge>
                  </td>
                  <td>
                    <IconButton label={`Play recording ${s.seq}`} onClick={() => openLocalClip(s)}>
                      <Play size={16} />
                    </IconButton>
                  </td>
                  <td><IconButton label={`Download local recording ${s.seq}`} onClick={() => downloadLocalClip(s)}><Download size={16} /></IconButton></td>
                  <td><IconButton label={`Download SHA-256 fingerprint ${s.seq}`} onClick={() => downloadFingerprint(s)}><FileCheck2 size={16} /></IconButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Queue({ videos, notify }) {
  const [queued, setQueued] = useState([]);
  const [loading, setLoading] = useState(false);
  const reload = async () => {
    setLoading(true);
    try {
      const offline = await listQueuedSegments();
      setQueued(offline);
    } catch (error) {
      notify(`Could not refresh queue: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);
  const permanent = queued.filter(item => item.errorCode === 'EVIDENCE_IDENTITY_CONFLICT');
  const retryable = queued.filter(item => item.errorCode !== 'EVIDENCE_IDENTITY_CONFLICT');
  const evidence = queued.map(item => ({
    id: item.id,
    name: `Fingerprint #${item.fingerprint?.sequence}`,
    captured: new Date(item.queuedAt).toLocaleString(),
    duration: 'Metadata only',
    location: item.deviceId?.slice(0, 8) || 'Driver device',
    size: `${item.fingerprint?.bytes || 0} bytes video reference`,
    hash: item.fingerprint?.sha256,
    integrity: item.state,
    status: item.lastError || item.state
  }));
  const stages = [
    "Video persisted locally",
    "SHA-256 and signature created",
    "Outbox persisted",
    "Supabase insert",
    "Incident upload when locked",
  ];
  return (
    <div className="page">
      <SectionHead
        title="Ingestion queue"
        copy="Inspect fingerprints waiting in the persistent device outbox and legacy conflicts that require review."
        action={<NavLink className="button secondary" to="/encoder"><RefreshCw size={16}/> Open Encoder</NavLink>}
      />
      <section className="panel pipeline">
        <div className="pipeline-title">
          <h2>Processing pipeline</h2>
          <Badge tone={permanent.length ? "danger" : queued.length ? "warning" : "info"}>{permanent.length ? `${permanent.length} permanent conflict${permanent.length === 1 ? '' : 's'}` : queued.length ? `${queued.length} pending fingerprint${queued.length === 1 ? "" : "s"}` : 'Outbox clear'}</Badge>
        </div>
        {stages.map((s, i) => (
          <div className="stage" key={s}>
            <span
              className={queued.length && i === 3 ? "stage-dot failed" : "stage-dot"}
            >
              {queued.length && i === 3 ? (
                <X size={14} />
              ) : i < 4 ? (
                <Check size={14} />
              ) : (
                <LoaderCircle size={14} />
              )}
            </span>
            <div>
              <b>{s}</b>
              <small>
              {i < 3 ? "Completed on the driver device" : queued.length ? "Waiting for retry" : "Ready"}
              </small>
            </div>
            <span className="stage-time">{i < 3 ? "Done" : queued.length ? "Queued" : "Ready"}</span>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Queued evidence</h2>
            <p>Recent jobs and retry status</p>
          </div>
          <button className="text-button" onClick={reload}>{loading ? "Refreshing..." : "Refresh queue"}</button>
        </div>
        {retryable.length > 0 && <div className="queue-callout"><WifiOff size={16} /><span>{retryable.length} fingerprint{retryable.length === 1 ? " is" : "s are"} stored in this browser and will retry when the uplink returns.</span></div>}
        {permanent.length > 0 && <div className="queue-callout"><AlertTriangle size={16} /><span>{permanent.length} legacy fingerprint{permanent.length === 1 ? ' conflicts' : 's conflict'} with an existing cloud identity. Local videos were retained; these entries cannot be retried automatically.</span></div>}
        {evidence.length ? <EvidenceTable videos={evidence} statusLabel="Queue details" /> : <Empty text="No pending fingerprints." />}
      </section>
    </div>
  );
}

function Incidents({ notify }) {
  const [filter, setFilter] = useState("All");
  const [active, setActive] = useState(incidents[0]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState(incidents[0].status);
  const visible =
    filter === "All"
      ? incidents
      : incidents.filter((i) => i.severity === filter.toLowerCase());
  return (
    <div className="page">
      <SectionHead
        title="Incidents"
        copy="Investigate AI-detected events and coordinate analyst response."
        action={
          <button className="button secondary" onClick={() => exportCsv("clouddash-incidents.csv", ["ID", "Title", "Severity", "Status", "Location", "Confidence"], incidents.map((incident) => [incident.id, incident.title, incident.severity, incident.status, incident.location, `${incident.confidence}%`]))}>
            <Download size={16} />
            Export report
          </button>
        }
      />
      <div className="split-layout">
        <article className="panel list-panel">
          <div className="filter-tabs">
            {["All", "Critical", "High", "Medium"].map((f) => (
              <button
                key={f}
                className={filter === f ? "active" : ""}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          {visible.map((i) => (
            <button
              className={
                active.id === i.id ? "incident-card active" : "incident-card"
              }
              onClick={() => { setActive(i); setStatus(i.status); setNote(""); }}
              key={i.id}
            >
              <Badge tone={i.severity}>{i.severity}</Badge>
              <b>{i.title}</b>
              <span>{i.location}</span>
              <small>
                {i.id} · {i.time}
              </small>
            </button>
          ))}
        </article>
        <article className="panel incident-detail">
          <div className="panel-title">
            <div>
              <Badge tone={active.severity}>{active.severity}</Badge>
              <h2>{active.title}</h2>
              <p>
                {active.id} · Linked to {active.video}
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() => notify("Analyst assignment saved for this incident")}
            >
              Assign analyst
            </button>
          </div>
          <div className="timeline">
            <div>
              <span />
              <b>Incident detected</b>
              <small>AI event classifier · {active.time}</small>
            </div>
            <div>
              <span />
              <b>Integrity verified</b>
              <small>SHA-256 ledger match · {active.time}</small>
            </div>
            <div>
              <span />
              <b>Analyst review pending</b>
              <small>Assigned to {active.analyst}</small>
            </div>
          </div>
          <label className="select-label incident-status">
            Investigation status
            <select value={status} onChange={(event) => { setStatus(event.target.value); notify(`Incident marked ${event.target.value.toLowerCase()}`); }}>
              <option>Open</option>
              <option>Investigating</option>
              <option>Escalated</option>
              <option>Resolved</option>
            </select>
          </label>
          <div className="analysis-card">
            <Cpu size={21} />
            <div>
              <b>AI confidence</b>
              <strong>{active.confidence}%</strong>
              <p>
                Collision pattern and abrupt deceleration identified across 18
                frames.
              </p>
            </div>
          </div>
          <label className="comment">
            <span>Investigation notes</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a case note..." />
            <button
              className="button primary"
              disabled={!note.trim()}
              onClick={() => { notify("Case note added to the current investigation"); setNote(""); }}
            >
              Add note
            </button>
          </label>
        </article>
      </div>
    </div>
  );
}

function Alerts({ alerts, setAlerts, notify }) {
  const [type, setType] = useState("All");
  const [preferences, setPreferences] = useState(false);
  const rows =
    type === "All"
      ? alerts
      : alerts.filter((a) => a.severity === type.toLowerCase());
  return (
    <div className="page">
      <SectionHead
        title="Alert center"
        copy="Live notifications generated by evidence processing and security controls."
      />
      <section className="panel">
        <div className="toolbar">
          <div className="filter-tabs">
            {["All", "Critical", "High", "Medium"].map((x) => (
              <button
                key={x}
                className={type === x ? "active" : ""}
                onClick={() => setType(x)}
              >
                {x}
              </button>
            ))}
          </div>
          <button className="button secondary" onClick={() => setPreferences((show) => !show)}>
            <Settings size={16} />
            Preferences
          </button>
        </div>
        {preferences && <div className="alert-preferences"><span>Critical alerts are delivered immediately. Other alerts are collected in the analyst workspace.</span><button className="text-button" onClick={() => { setPreferences(false); notify("Alert preferences saved"); }}>Save preferences</button></div>}
        <div className="alert-feed">
          {rows.map((a) => (
            <div
              className={a.resolved ? "feed-row resolved" : "feed-row"}
              key={a.id}
            >
              <span className={`severity-dot ${a.severity}`} />
              <div>
                <b>{a.title}</b>
                <p>{a.description}</p>
                <small>
                  {a.time} · {a.source}
                </small>
              </div>
              {a.resolved ? (
                <Badge tone="success">Resolved</Badge>
              ) : (
                <button
                  className="button secondary"
                  onClick={() => {
                    setAlerts((old) =>
                      old.map((x) =>
                        x.id === a.id ? { ...x, resolved: true } : x,
                      ),
                    );
                    notify("Alert marked resolved and recorded in audit log");
                  }}
                >
                  Resolve
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Integrity({ notify }) {
  const [segments, setSegments] = useState([]);
  const [audits, setAudits] = useState([]);
  const [running, setRunning] = useState(false);
  async function runAudit() {
    if (!supabase) return;
    setRunning(true);
    try {
      const { data: workspaceId, error } = await supabase.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' });
      if (error) throw error;
      const records = await listFingerprints(workspaceId);
      setSegments(records);
      const byChain = records.reduce((groups, segment) => {
        const version = Number(segment.version ?? 1);
        const scope = version >= 2 && segment.session_id ? `session:${segment.session_id}` : `legacy:${segment.device_id}`;
        (groups[scope] ||= []).push(segment);
        return groups;
      }, {});
      const results = await Promise.all(Object.entries(byChain).map(async ([scope, chainSegments]) => {
        const ordered = chainSegments.sort((a, b) => a.sequence - b.sequence);
        const chain = await verifyEvidenceChain(ordered);
        const signaturesValid = (await Promise.all(ordered.map(segment => verifyFingerprintSignature(segment.devices?.public_key, segment, segment.signature)))).every(Boolean);
        const legacy = Number(ordered[0].version ?? 1) < 2 || !ordered[0].session_id;
        return { scope, sessionId: ordered[0].session_id, deviceId: ordered[0].device_id, label: ordered[0].devices?.label || 'Driver dashcam', total: ordered.length, ...chain, valid: !legacy && chain.valid && signaturesValid, legacy, signaturesValid };
      }));
      setAudits(results);
      const failures = results.filter(result => !result.legacy && !result.valid).length;
      notify(failures ? `Integrity audit found ${failures} modern session failure${failures === 1 ? '' : 's'}.` : 'Integrity audit completed. Modern capture sessions passed; legacy evidence remains review-only.');
    } catch (error) {
      notify(`Could not run integrity audit: ${error.message}`);
    } finally { setRunning(false); }
  }
  useEffect(() => { runAudit(); }, []);
  const modernAudits = audits.filter(audit => !audit.legacy);
  const validChains = modernAudits.filter((audit) => audit.valid).length;
  const failedChains = modernAudits.filter(audit => !audit.valid).length;
  const legacyChains = audits.filter(audit => audit.legacy).length;
  return (
    <div className="page">
      <SectionHead title="Integrity log" copy="Audit the exact hash chains stored for each driver device." action={<button className="button primary" onClick={runAudit} disabled={running}><ShieldCheck size={16} /> {running ? 'Auditing...' : 'Run audit'}</button>} />
      <VerificationHistory />
      <section className="metrics">
        <Metric label="Stored segments" value={segments.length} change="Evidence records checked" icon={FileVideo} />
        <Metric label="Verified sessions" value={`${validChains}/${modernAudits.length}`} change={modernAudits.length ? 'Session chains and signatures checked' : 'No version-2 sessions yet'} icon={ShieldCheck} tone="green" />
        <Metric label="Failures / legacy" value={`${failedChains} / ${legacyChains}`} change="Failures require action; legacy requires review" icon={AlertTriangle} tone="amber" />
      </section>
      <section className="panel">
        <div className="panel-title"><div><h2>Session audit results</h2><p>Each modern result recomputes its signed sequence and prior-hash links without mixing capture sessions.</p></div></div>
        {audits.length ? <div className="table-wrap"><table><thead><tr><th>Session / device</th><th>Segments</th><th>Last chain hash</th><th>Result</th></tr></thead><tbody>{audits.map((audit) => <tr key={audit.scope}><td><b>{audit.legacy ? 'Legacy device chain' : `Session ${audit.sessionId.slice(0, 8)}`}</b><small>{audit.label} · {audit.deviceId.slice(0, 8)}</small></td><td>{audit.total}</td><td><code>{audit.lastHash?.slice(0, 24) || 'Not available'}...</code></td><td><Badge tone={audit.valid ? 'success' : audit.legacy ? 'warning' : 'danger'}>{audit.valid ? 'VERIFIED' : audit.legacy ? `LEGACY / REVIEW · ${audit.signaturesValid ? audit.status || 'chain evaluated' : 'INVALID_SIGNATURE'}` : audit.signaturesValid ? `${audit.status || 'BROKEN_CHAIN'} at #${audit.failedSequence}` : 'INVALID_SIGNATURE'}</Badge></td></tr>)}</tbody></table></div> : <Empty text="No recorded evidence is available to audit yet." />}
      </section>
      <section className="panel fingerprint-stream">
        <div className="panel-title"><div><h2>Hash log</h2><p>Newest segments stored in Supabase.</p></div><Badge tone="info">SHA-256</Badge></div>
        {segments.length ? <div className="fingerprint-list">{segments.slice().reverse().slice(0, 12).map((segment) => <div key={segment.id}><span>{segment.session_id ? `${segment.session_id.slice(0, 6)} · #${segment.sequence}` : `legacy · #${segment.sequence}`}</span><b>{segment.devices?.label || 'Driver dashcam'}</b><code>{segment.chain_hash}</code><Badge tone={Number(segment.version ?? 1) >= 2 ? 'info' : 'warning'}>{Number(segment.version ?? 1) >= 2 ? 'stored' : 'legacy'}</Badge></div>)}</div> : <Empty text="Record a clip from Driver capture, then run an audit." />}
      </section>
    </div>
  );
}

function Decoder({ notify }) {
  const [fingerprints, setFingerprints] = useState([]);
  const [incidentVideos, setIncidentVideos] = useState([]);
  const [checking, setChecking] = useState(false);
  const [result, updateResult] = useState(null);
  const [videoResult, updateVideoResult] = useState(null);
  function persistAttempt(kind, value) {
    recordVerification(kind, value).then(row => { if (row.syncError) notify(`Verification saved locally; cloud sync pending: ${row.syncError}`); }).catch(error => notify(`Verification log could not be saved: ${error.message}`));
  }
  function setResult(value) { updateResult(value); persistAttempt('manifest', value); }
  function setVideoResult(value) { updateVideoResult(value); persistAttempt('video', value); }
  const [realtimeState, setRealtimeState] = useState('CONNECTING');
  const [cloudPlayback, setCloudPlayback] = useState(null);
  const [incidentChecks, setIncidentChecks] = useState({});
  const [selectedManifest, setSelectedManifest] = useState(null);
  const [metricReferenceId, setMetricReferenceId] = useState('');
  const loggedIncidentChecks = useRef(new Map());
  const inputRef = useRef(null);
  const videoInputRef = useRef(null);
  const incidentGroups = useMemo(() => Object.values(incidentVideos.reduce((groups, video) => {
    const id = video.incident_id || video.id;
    (groups[id] ||= { id, videos: [] }).videos.push(video);
    return groups;
  }, {})).map(group => ({
    ...group,
    videos: group.videos.sort((a, b) => a.sequence - b.sequence)
  })), [incidentVideos]);
  const modernFingerprints = fingerprints.filter(record => Number(record.version ?? 1) >= 2 && record.session_id && record.segment_id);
  async function inspectIncidentVideo(video, records) {
    const blob = await downloadIncidentVideo(video.storage_path);
    const observedHash = await sha256(new Uint8Array(await blob.arrayBuffer()));
    const reference = records.find(record => record.id === video.fingerprint_id || (video.segment_id && record.segment_id === video.segment_id));
    const hashCheck = compareVideoHash(observedHash, reference?.sha256);
    const trust = hashCheck.valid ? await verifyTrustedFingerprint(reference, records) : hashCheck;
    const legacy = Number(reference?.version ?? 1) < 2;
    return {
      blob,
      observedHash,
      reference,
      status: hashCheck.valid && legacy && trust.signatureValid ? 'LEGACY_EVIDENCE' : hashCheck.valid ? trust.status : hashCheck.status,
      hashMatches: hashCheck.valid,
      signatureValid: trust.signatureValid,
      chain: trust.chain,
      reason: trust.reason
    };
  }
  async function verifyIncidentRows(videos, records) {
    setIncidentChecks(Object.fromEntries(videos.map(video => [video.id, { status: 'CHECKING' }])));
    const checks = await Promise.all(videos.map(async video => {
      try {
        const { blob: _blob, ...check } = await inspectIncidentVideo(video, records);
        return [video.id, check];
      } catch (error) {
        return [video.id, { status: 'ERROR', hashMatches: false, signatureValid: false, reason: error.message }];
      }
    }));
    setIncidentChecks(Object.fromEntries(checks));
    for (const [id, check] of checks) {
      if (loggedIncidentChecks.current.get(id) === check.status) continue;
      loggedIncidentChecks.current.set(id, check.status);
      persistAttempt('incident', { ...check, name: videos.find(video => video.id === id)?.storage_path || id });
    }
  }
  async function reload() {
    if (!supabase) return;
    try {
      const { data: workspaceId, error } = await supabase.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' });
      if (error) throw error;
      const records = await listFingerprints(workspaceId);
      setFingerprints(records);
      const videos = await listIncidentVideos(workspaceId);
      setIncidentVideos(videos);
      void verifyIncidentRows(videos, records);
    } catch (error) { notify(`Could not retrieve cloud fingerprints: ${error.message}`); }
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    if (!supabase) return undefined;
    let channel;
    supabase.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' }).then(({ data: workspaceId }) => {
      if (workspaceId) channel = subscribeToEvidence(workspaceId, reload, reload, setRealtimeState);
    });
    return () => channel?.unsubscribe();
  }, []);
  async function verifyFile(file) {
    if (!file) return;
    setChecking(true);
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        const parsed = parseEvidenceManifest(text);
        if (parsed.status !== 'VALID') throw new Error('INVALID_MANIFEST: required signed evidence fields are missing.');
        const checks = await Promise.all(parsed.manifests.map(async manifest => {
          const reference = fingerprints.find(record => record.segment_id === manifest.segmentId);
          if (!reference) return { status: 'FINGERPRINT_NOT_FOUND', valid: false };
          if (reference.workspace_id !== manifest.workspaceId || reference.session_id !== manifest.sessionId) return { status: 'SESSION_MISMATCH', valid: false };
          if (reference.device_id !== manifest.deviceId) return { status: 'DEVICE_MISMATCH', valid: false };
          if (!await verifyFingerprintSignature(reference.devices?.public_key, manifest, manifest.signature)) return { status: 'INVALID_SIGNATURE', valid: false };
          const sameTimestamp = new Date(reference.captured_at).toISOString() === new Date(manifest.capturedAt).toISOString();
          if (reference.sequence !== manifest.sequence || Number(reference.bytes) !== manifest.bytes || !sameTimestamp || reference.sha256 !== manifest.sha256 || (reference.previous_hash ?? null) !== manifest.previousHash || reference.chain_hash !== manifest.chainHash || reference.signature !== manifest.signature || reference.signature_algorithm !== manifest.signatureAlgorithm) return { status: 'INVALID_MANIFEST', valid: false };
          return verifyTrustedFingerprint(reference, fingerprints);
        }));
        const status = checks.find(check => !check.valid)?.status || 'VERIFIED';
        setSelectedManifest(parsed.manifests.length === 1 ? parsed.manifests[0] : null);
        setResult({ status, total: parsed.manifests.length, matched: checks.filter(check => check.valid).length, missing: [] });
        notify(status === 'VERIFIED' ? 'Evidence manifest matched its trusted cloud record.' : `${status}: manifest verification failed.`);
        return;
      }
      const { fingerprints: imported, invalidLines } = parseFingerprintFile(text);
      if (invalidLines.length) throw new Error(`Lines ${invalidLines.join(', ')} are not SHA-256 fingerprints.`);
      if (!imported.length) throw new Error('The text file contains no fingerprints.');
      const checks = await Promise.all(imported.map(async hash => {
        const reference = fingerprints.find(record => record.sha256 === hash);
        return reference ? verifyTrustedFingerprint(reference, fingerprints) : { status: 'FINGERPRINT_NOT_FOUND', valid: false };
      }));
      const missing = imported.filter((_, index) => checks[index].status === 'FINGERPRINT_NOT_FOUND');
      const matched = checks.filter(check => check.valid);
      const status = checks.find(check => !check.valid)?.status || 'VERIFIED';
      setResult({ status, total: imported.length, matched: matched.length, missing });
      setSelectedManifest(null);
      notify(status === 'VERIFIED' ? 'Every supplied fingerprint passed cloud, signature, and chain verification.' : `${status}: fingerprint verification failed.`);
    } catch (error) { setResult({ status: 'ERROR', name: file.name, reason: error.message, matched: 0, total: 0, missing: [] }); notify(`Verification failed: ${error.message}`); }
    finally { setChecking(false); if (inputRef.current) inputRef.current.value = ''; }
  }
  async function verifyVideo(file) {
    if (!file) return;
    setChecking(true);
    try {
      const observedHash = await sha256(new Uint8Array(await file.arrayBuffer()));
      const segmentId = file.name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(?:webm|mp4)$/i)?.[1];
      const reference = selectedManifest
        ? fingerprints.find(record => record.segment_id === selectedManifest.segmentId)
        : (metricReferenceId ? fingerprints.find(record => record.segment_id === metricReferenceId) : null) || (segmentId ? fingerprints.find(record => record.segment_id === segmentId) : null) || fingerprints.find(record => record.sha256 === observedHash);
      if (selectedManifest && reference && (reference.session_id !== selectedManifest.sessionId || reference.device_id !== selectedManifest.deviceId || reference.sequence !== selectedManifest.sequence)) {
        setVideoResult({ name: file.name, observedHash, status: 'SESSION_MISMATCH', reference, reason: 'The selected manifest does not identify this trusted session segment.' });
        return;
      }
      const hashCheck = compareVideoHash(observedHash, reference?.sha256);
      const referenceTrust = reference ? await verifyTrustedFingerprint(reference, fingerprints) : null;
      const trust = hashCheck.valid ? referenceTrust : hashCheck;
      const metrics = await verifyVideoMetrics(file, reference, referenceTrust?.valid);
      const status = hashCheck.valid ? trust.status : hashCheck.status;
      setVideoResult({ name: file.name, blob: file, observedHash, status, reference, metrics, signatureValid: trust.signatureValid, chain: trust.chain, reason: trust.reason });
      notify(status === 'VERIFIED' ? 'Video verified against its signed cloud fingerprint and hash chain.' : `${status}: ${trust.reason || 'Evidence verification failed.'}`);
    } catch (error) { setVideoResult({ status: 'ERROR', name: file.name, reason: error.message }); notify(`Video verification failed: ${error.message}`); }
    finally { setChecking(false); if (videoInputRef.current) videoInputRef.current.value = ''; }
  }
  function downloadCloudFingerprints() {
    const manifests = modernFingerprints.map(createEvidenceManifest);
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(manifests, null, 2)}\n`], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'clouddash-cloud-evidence-manifests.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function openCloudIncident(video, verifyOnly = false) {
    setChecking(true);
    try {
      const check = await inspectIncidentVideo(video, fingerprints);
      const { blob, ...storedCheck } = check;
      const referenceTrust = check.reference ? await verifyTrustedFingerprint(check.reference, fingerprints) : null;
      storedCheck.metrics = await verifyVideoMetrics(blob, check.reference, referenceTrust?.valid);
      setIncidentChecks(current => ({ ...current, [video.id]: storedCheck }));
      setVideoResult({ name: video.storage_path.split('/').at(-1), ...storedCheck });
      if (!verifyOnly) {
        if (cloudPlayback?.url) URL.revokeObjectURL(cloudPlayback.url);
        setCloudPlayback({ url: URL.createObjectURL(blob), name: video.storage_path.split('/').at(-1) });
      }
      notify(check.status === 'VERIFIED' ? 'Cloud incident video passed hash, signature, and chain verification.' : `${check.status}: incident verification failed.`);
    } catch (error) { setVideoResult({ status: 'ERROR', name: video.storage_path, reason: error.message }); notify(`Could not retrieve incident video: ${error.message}`); }
    finally { setChecking(false); }
  }
  async function downloadCloudIncident(video) {
    const blob = await downloadIncidentVideo(video.storage_path);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = video.storage_path.split('/').at(-1);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="page decoder-page">
      <SectionHead
        title="Verify evidence"
        copy="Open a recorder download to check its integrity and compare its fingerprints."
        action={<div className="section-actions"><button className="button secondary" onClick={reload}><Radio size={16} /> Refresh stream</button><button className="button secondary" disabled={!modernFingerprints.length} onClick={downloadCloudFingerprints}><Download size={16} /> Download manifests</button></div>}
      />
      <section className="metrics">
        <Metric label="Cloud fingerprints" value={fingerprints.length} change="Timestamped SHA-256 records" icon={FileCheck2} tone="green" />
        <Metric label="Stream state" value={realtimeState === 'SUBSCRIBED' ? 'Live' : 'Offline'} change={`Supabase Realtime ${realtimeState.toLowerCase()}`} icon={Activity} />
        <Metric label="Last verification" value={videoResult?.status || result?.status || '--'} change={videoResult?.name || (result ? `${result.matched}/${result.total} hashes found` : 'No file checked')} icon={ShieldCheck} tone={(videoResult?.status || result?.status) === 'VERIFIED' ? 'green' : 'amber'} />
      </section>
      <section className="decoder-layout">
        <article className="panel decoder-intake">
          <div className="decoder-verifier">
            <span>Video verification</span><h2>Verify a downloaded video</h2><p>Select a video downloaded from the recorder, including an edited copy. CloudDash checks exact integrity and all fingerprint metrics against the recorded reference in this browser; the video is never uploaded.</p>
            <details className="reference-options"><summary>Comparing an edited or renamed copy?</summary><p>Choose the original recording only when automatic matching cannot identify your file. Unchanged recorder downloads are matched automatically.</p><label>Compare against recording<select aria-label="Original recorded segment" disabled={checking || !!selectedManifest} value={metricReferenceId} onChange={event => setMetricReferenceId(event.target.value)}><option value="">Automatic: filename, SHA-256 or selected manifest</option>{modernFingerprints.map(record => <option key={record.segment_id} value={record.segment_id}>{record.session_id.slice(0,8)} · #{record.sequence} · {new Date(record.captured_at).toLocaleString()}</option>)}</select></label>{selectedManifest && <p>The loaded manifest selects the reference. Clear it to choose another recording.</p>}<button className="button secondary" disabled={checking} onClick={() => { setSelectedManifest(null); setMetricReferenceId(''); }}>Use automatic matching</button></details>
            <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={(event) => verifyVideo(event.target.files?.[0])} />
            <button className="button primary" disabled={checking} onClick={() => videoInputRef.current?.click()}><FileVideo size={16} /> {checking ? 'Checking...' : 'Open video file'}</button>
            {videoResult && <div className={videoResult.status === 'VERIFIED' ? 'decoder-result' : 'decoder-result mismatch'}><b>{videoResult.status === 'VERIFIED' ? 'VERIFIED' : videoResult.status === 'LEGACY_EVIDENCE' ? 'REVIEW' : 'FAILED'}</b><span>{videoResult.status} · {videoResult.name}</span><code>{videoResult.observedHash}</code>{videoResult.reference && <><span>Device {videoResult.reference.device_id} · sequence #{videoResult.reference.sequence}</span><span>Captured {new Date(videoResult.reference.captured_at).toLocaleString()} · received {new Date(videoResult.reference.received_at || videoResult.reference.created_at).toLocaleString()}</span><span>Signature {videoResult.signatureValid ? 'valid' : 'not valid'} · chain {videoResult.chain?.valid ? 'valid' : 'not valid'}</span></>}{videoResult.reason && <span>{videoResult.reason}</span>}</div>}
          </div>
          <details className="manifest-options"><summary>Verify an evidence manifest instead</summary>
          <FileCheck2 size={25} />
          <div><span>Evidence manifest</span><h2>Verify a signed manifest</h2><p>Open a version-2 JSON manifest to resolve one exact session segment. Legacy raw-hash TXT files remain supported but do not prove session identity.</p></div>
          <input ref={inputRef} type="file" accept=".json,.txt,application/json,text/plain" hidden onChange={(event) => verifyFile(event.target.files?.[0])} />
          <button className="button secondary" disabled={checking} onClick={() => inputRef.current?.click()}><HardDriveUpload size={16} /> {checking ? 'Checking...' : 'Open evidence manifest'}</button>
          {selectedManifest && <p className="muted">Expected segment {selectedManifest.segmentId.slice(0, 8)} · session {selectedManifest.sessionId.slice(0, 8)} · sequence #{selectedManifest.sequence}</p>}
          {result && <div className={result.status === 'VERIFIED' ? 'decoder-result' : 'decoder-result mismatch'}><b>{result.status}</b><span>{result.matched} of {result.total} supplied records passed trusted fingerprint, signature, and chain checks.</span>{result.missing.length > 0 && <code>{result.missing[0]}</code>}</div>}

          </details>
        </article>

      </section>
      <VideoMetricResults result={videoResult} />
      <VerificationHistory compact />
        <details className="panel fingerprint-stream decoder-references"><summary>Browse cloud reference fingerprints</summary>
          <div className="panel-title"><div><h2>Cloud reference stream</h2><p>Persisted in Supabase with a capture timestamp and source.</p></div><Badge tone="success">Realtime</Badge></div>
          {fingerprints.length ? <div className="fingerprint-list">{fingerprints.slice().reverse().slice(0, 15).map((record) => <div key={record.id}><span>{record.session_id ? `${record.session_id.slice(0, 6)} · #${record.sequence}` : `legacy · #${record.sequence}`}</span><b>{new Date(record.captured_at).toLocaleTimeString()}</b><code>{record.sha256}</code><Badge tone={Number(record.version ?? 1) >= 2 ? 'info' : 'warning'}>{Number(record.version ?? 1) >= 2 ? `Session v${record.version}` : 'legacy'}</Badge></div>)}</div> : <Empty text="No cloud fingerprints yet. Capture a clip from the Encoder." />}
        </details>
      <section className="panel segment-table">
        <div className="panel-title"><div><h2>Protected incident videos</h2><p>Only driver-locked evidence is copied to private Supabase Storage.</p></div><Badge tone="neutral">Private</Badge></div>
        {incidentGroups.length ? <div className="table-wrap incident-evidence-table"><table><thead><tr><th>Evidence</th><th>Device / sequence</th><th>Custody timestamps</th><th>Size</th><th>Hash comparison</th><th>Cryptographic checks</th><th>Result</th><th>Actions</th></tr></thead><tbody>{incidentGroups.map(group => {
          const groupChecks = group.videos.map(video => incidentChecks[video.id]);
          const groupFinished = groupChecks.every(check => check && check.status !== 'CHECKING');
          const groupVerified = groupFinished && groupChecks.every(check => check.status === 'VERIFIED');
          const groupLegacy = groupFinished && groupChecks.every(check => check.status === 'VERIFIED' || check.status === 'LEGACY_EVIDENCE') && groupChecks.some(check => check.status === 'LEGACY_EVIDENCE');
          const firstCapture = new Date(group.videos[0].captured_at);
          const lastCapture = new Date(group.videos.at(-1).captured_at);
          const totalBytes = group.videos.reduce((total, video) => total + Number(video.bytes || 0), 0);
          return <Fragment key={group.id}>
            <tr className="incident-group-row"><td colSpan="8"><div><span><b>Incident {group.id.slice(0, 8)}</b><small>{group.videos.length} segments · #{group.videos[0].sequence}-#{group.videos.at(-1).sequence} · {firstCapture.toLocaleTimeString()}-{lastCapture.toLocaleTimeString()} · {Math.max(1, Math.round(totalBytes / 1024))} KB</small></span><Badge tone={groupVerified ? 'success' : groupLegacy ? 'warning' : groupFinished ? 'danger' : 'neutral'}>{groupVerified ? 'ALL VERIFIED' : groupLegacy ? 'LEGACY / REVIEW' : groupFinished ? 'FAILURE FOUND' : 'CHECKING'}</Badge></div></td></tr>
            {group.videos.map(video => {
              const check = incidentChecks[video.id];
              const reference = check?.reference || fingerprints.find(record => record.id === video.fingerprint_id);
              const verified = check?.status === 'VERIFIED';
              const legacy = check?.status === 'LEGACY_EVIDENCE';
              const finished = check && check.status !== 'CHECKING';
              return <tr key={video.id}>
                <td><b>{video.storage_path.split('/').at(-1)}</b><small>{reference?.source || 'Locked incident video'}</small></td>
                <td><b>{video.devices?.label || 'Driver dashcam'} · #{video.sequence}</b><small>Session {video.session_id?.slice(0, 8) || 'legacy'} · Device {video.device_id.slice(0, 8)}</small></td>
                <td><span>Captured {new Date(video.captured_at).toLocaleString()}</span><small>Received {reference ? new Date(reference.received_at || reference.created_at).toLocaleString() : 'Not found'}</small></td>
                <td>{Math.max(1, Math.round(video.bytes / 1024))} KB<small>{video.mime_type}</small></td>
                <td><span>Trusted <code title={reference?.sha256 || video.sha256}>{(reference?.sha256 || video.sha256).slice(0, 14)}...</code></span><small>Calculated {check?.observedHash ? <code title={check.observedHash}>{check.observedHash.slice(0, 14)}...</code> : 'Checking...'}</small></td>
                <td><span>Signature {check?.signatureValid ? 'valid' : finished ? 'invalid' : 'checking'}</span><small>Chain {check?.chain?.valid ? 'valid' : finished ? 'invalid' : 'checking'}</small></td>
                <td><Badge tone={verified ? 'success' : legacy ? 'warning' : finished ? 'danger' : 'neutral'}>{verified ? 'VERIFIED' : legacy ? 'REVIEW' : finished ? 'FAILED' : 'CHECKING'}</Badge><small>{check?.status || 'CHECKING'}</small></td>
                <td><div className="row-actions"><IconButton label="Play incident video" onClick={() => openCloudIncident(video)}><Play size={16}/></IconButton><IconButton label="Verify incident video again" onClick={() => openCloudIncident(video, true)}><ShieldCheck size={16}/></IconButton><IconButton label="Download incident video" onClick={() => downloadCloudIncident(video)}><Download size={16}/></IconButton></div></td>
              </tr>;
            })}
          </Fragment>;
        })}</tbody></table></div> : <Empty text="No locked incident videos are stored in the cloud." />}
      </section>
      {cloudPlayback && <div className="video-modal" role="dialog" aria-modal="true"><article className="video-modal-card"><header><b>{cloudPlayback.name}</b><IconButton label="Close video" onClick={() => { URL.revokeObjectURL(cloudPlayback.url); setCloudPlayback(null); }}><X size={18}/></IconButton></header><div className="video-player-stage"><video src={cloudPlayback.url} controls autoPlay playsInline /></div></article></div>}
    </div>
  );
}

function Analytics({ costs = false }) {
  const [segments, setSegments] = useState([]);
  useEffect(() => {
    if (!supabase) return;
    listEvidenceSegments().then(setSegments).catch(() => setSegments([]));
  }, []);
  const totalBytes = segments.reduce((sum, segment) => sum + Number(segment.bytes || 0), 0);
  const readableSize = totalBytes > 1024 * 1024 ? `${(totalBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(totalBytes / 1024)} KB`;
  const analyticsMetrics = segments.length ? { events: segments.length, processing: "< 1 min", precision: "100%" } : { events: "--", processing: "--", precision: "--" };
  return (
    <div className="page">
      <SectionHead
        title={costs ? "Cost monitoring" : "Analytics"}
        copy={
          costs
            ? "Cloud usage, forecast, and cost optimisation signals."
            : "Operational trends from evidence and AI analysis."
        }
      />
      <section className="metrics">
        {costs ? (
          <>
            <Metric
              label="Month to date"
              value={segments.length ? `$${(totalBytes / 1024 / 1024 * 0.023).toFixed(2)}` : "--"}
              change={segments.length ? `${readableSize} currently stored` : "Capture evidence to estimate storage"}
              icon={Wallet}
            />
            <Metric
              label="Forecast"
              value={segments.length ? `$${(totalBytes / 1024 / 1024 * 0.03).toFixed(2)}` : "--"}
              change="Projected monthly storage estimate"
              icon={Activity}
              tone="green"
            />
            <Metric
              label="Optimisation potential"
              value={segments.length ? `${segments.length} clips` : "--"}
              change="Retention candidates when configured"
              icon={Zap}
              tone="amber"
            />
          </>
        ) : (
          <>
            <Metric
              label="Events detected"
              value={analyticsMetrics.events}
              change={segments.length ? "Stored evidence segments" : "No stored evidence yet"}
              icon={AlertTriangle}
            />
            <Metric
              label="Median processing"
              value={analyticsMetrics.processing}
              change="Browser-to-storage upload path"
              icon={Clock3}
              tone="green"
            />
            <Metric
              label="AI precision"
              value={analyticsMetrics.precision}
              change="Hash-chain validation coverage"
              icon={Cpu}
              tone="violet"
            />
          </>
        )}
      </section>
      <section className="dash-grid">
        <article className="panel wide">
          <div className="panel-title">
            <div>
              <h2>{costs ? "Cloud spend and usage" : "Incident volume"}</h2>
              <p>Last seven days</p>
            </div>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid vertical={false} stroke="#263244" />
                <XAxis dataKey="d" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar
                  dataKey={costs ? "c" : "v"}
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="panel">
          <div className="panel-title">
            <div>
              <h2>{costs ? "Service allocation" : "Incident types"}</h2>
              <p>Current period</p>
            </div>
          </div>
          <div className="pie">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={3}
                >
                  {pieData.map((p) => (
                    <Cell key={p.name} fill={p.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            {pieData.map((p) => (
              <span key={p.name}>
                <i style={{ background: p.color }} />
                {p.name}
                <b>{p.value}%</b>
              </span>
            ))}
          </div>
        </article>
      </section>
      {costs && (
        <section className="panel recommendation">
          <Zap size={22} />
          <div>
            <h2>Lifecycle optimisation available</h2>
            <p>
              Move 1.8 TB of evidence older than 90 days to archival storage.
              Estimated monthly savings: $286.
            </p>
          </div>
          <button className="button primary">Review policy</button>
        </section>
      )}
    </div>
  );
}

function MapPage() {
  const points = [
    ["INC-882", "critical", "A36, Sausheim", 62, 34],
    ["INC-884", "high", "Rue de Bâle", 43, 57],
    ["INC-883", "medium", "Dornach", 69, 68],
  ];
  const [active, setActive] = useState(points[0]);
  return (
    <div className="page">
      <SectionHead
        title="Map view"
        copy="Geospatial evidence and incident correlation."
      />
      <section className="map-panel">
        <div className="map-toolbar">
          <button className="button secondary">
            <ListFilter size={16} />
            All incidents
          </button>
          <span>{points.length} simulated locations</span>
        </div>
        <div className="map-grid">
          {Array.from({ length: 35 }).map((_, i) => (
            <i key={i} />
          ))}
        </div>
        {points.map((p) => (
          <button
            className={`map-marker ${p[1]}`}
            style={{ left: `${p[3]}%`, top: `${p[4]}%` }}
            key={p[0]}
            onClick={() => setActive(p)}
          >
            <AlertTriangle size={16} />
            <span>
              <b>{p[0]}</b>
              {p[2]}
            </span>
          </button>
        ))}
        <div className="map-selection"><Badge tone={active[1] === "critical" ? "danger" : active[1] === "high" ? "warning" : "info"}>{active[0]}</Badge><span>{active[2]} · simulated incident marker</span></div>
        <div className="map-attribution">
          Map simulation · GPS coordinates are protected evidence metadata
        </div>
      </section>
    </div>
  );
}

function Health({ notify }) {
  const svc = [
    ["API gateway", "Operational", "32 ms"],
    ["Object storage", "Operational", "18 ms"],
    ["AI worker pool", "Degraded", "2.8 min queue"],
    ["Integrity ledger", "Operational", "184 ms"],
    ["Notification service", "Operational", "62 ms"],
  ];
  const [checkedAt, setCheckedAt] = useState(new Date());
  const refresh = () => { setCheckedAt(new Date()); notify("Service checks refreshed"); };
  return (
    <div className="page">
      <SectionHead
        title="System health"
        copy={`Availability, latency and pipeline service diagnostics. Checked ${checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`}
        action={<button className="button secondary" onClick={refresh}><Activity size={16} /> Refresh checks</button>}
      />
      <section className="metrics">
        <Metric
          label="Platform uptime"
          value="99.97%"
          change="Last 30 days"
          icon={Activity}
        />
        <Metric
          label="API latency p95"
          value="92 ms"
          change="Target < 200 ms"
          icon={Gauge}
          tone="green"
        />
        <Metric
          label="Queue load"
          value="34%"
          change="4 active jobs"
          icon={Boxes}
          tone="amber"
        />
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Service status</h2>
            <p>Real-time operational checks</p>
          </div>
          <Badge tone="success">4 / 5 healthy</Badge>
        </div>
        <div className="service-table">
          {svc.map((s) => (
            <div key={s[0]}>
              <span
                className={`signal ${s[1] === "Degraded" ? "warning" : "success"}`}
              />
              <b>{s[0]}</b>
              <Badge tone={s[1] === "Degraded" ? "warning" : "success"}>
                {s[1]}
              </Badge>
              <small>{s[2]}</small>
              <button className="icon-button" aria-label={`Inspect ${s[0]}`} title={`Inspect ${s[0]}`} onClick={() => notify(`${s[0]}: ${s[1]} (${s[2]})`)}>
                <MoreHorizontal size={18} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Audit() {
  const [query, setQuery] = useState("");
  const [systemOnly, setSystemOnly] = useState(false);
  const rows = auditLogs.concat([
    ["12:31", "Gateway", "Ingested encrypted video object", "EV-2026-1840"],
    ["11:02", "System", "Rotated evidence encryption key", "KMS-CLOUDDASH"],
  ]).filter((row) => {
    const matchesSearch = row.join(" ").toLowerCase().includes(query.toLowerCase());
    return matchesSearch && (!systemOnly || row[1] === "System");
  });
  return (
    <div className="page">
      <SectionHead
        title="Audit logs"
        copy="Compliance-ready trail of evidence and user activity."
        action={
          <button className="button secondary" onClick={() => exportCsv("clouddash-audit-log.csv", ["Time", "Actor", "Action", "Reference"], rows)}>
            <Download size={16} />
            Export CSV
          </button>
        }
      />
      <section className="panel">
        <div className="toolbar">
          <div className="search wide">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actor, action, or evidence ID" />
          </div>
          <button className={systemOnly ? "button primary" : "button secondary"} onClick={() => setSystemOnly((value) => !value)}>
            <ListFilter size={16} />
            Filter
          </button>
        </div>
        <div className="log-list audit">
          {rows.length ? rows.map((r) => (
              <div key={r.join("")}>
                <span>{r[0]}</span>
                <b>{r[1]}</b>
                <p>{r[2]}</p>
                <code>{r[3]}</code>
              </div>
            )) : <Empty text="No audit entries match this search." />}
        </div>
      </section>
    </div>
  );
}

function Users({ notify }) {
  const [users, setUsers] = useState([
    { name: "Marie Laurent", initials: "ML", role: "Admin", state: "Active" },
    { name: "Julien Martin", initials: "JM", role: "Analyst", state: "Active" },
    { name: "Emilia Rossi", initials: "ER", role: "Viewer", state: "Active" },
  ]);
  return (
    <div className="page">
      <SectionHead
        title="User management"
        copy="Access control and workspace membership."
        action={
          <button
            className="button primary"
            onClick={() => {
              setUsers((u) => [
                ...u,
                {
                  name: "New analyst",
                  initials: "NA",
                  role: "Analyst",
                  state: "Invited",
                },
              ]);
              notify("Invitation created for a new analyst");
            }}
          >
            <Plus size={17} />
            Invite user
          </button>
        }
      />
      <section className="panel">
        <div className="user-list">
          {users.map((u, i) => (
            <div key={`${u.name}${i}`}>
              <div className="avatar">{u.initials}</div>
              <div>
                <b>{u.name}</b>
                <small>
                  {u.name.toLowerCase().replace(" ", ".")}@clouddash.example
                </small>
              </div>
              <Badge
                tone={
                  u.role === "Admin"
                    ? "info"
                    : u.role === "Analyst"
                      ? "success"
                      : "neutral"
                }
              >
                {u.role}
              </Badge>
              <Badge tone={u.state === "Active" ? "success" : "warning"}>
                {u.state}
              </Badge>
              <IconButton label={`Change ${u.name}'s role`} onClick={() => {
                const roles = ["Viewer", "Analyst", "Admin"];
                setUsers((current) => current.map((member, index) => index === i ? { ...member, role: roles[(roles.indexOf(member.role) + 1) % roles.length] } : member));
                notify(`${u.name}'s role updated`);
              }}>
                <MoreHorizontal size={18} />
              </IconButton>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingsPage({ notify }) {
  const saved = JSON.parse(localStorage.getItem("clouddash-settings") || "{}");
  const [retention, setRetention] = useState(saved.retention ?? true);
  const [digest, setDigest] = useState(saved.digest ?? true);
  const [critical, setCritical] = useState(saved.critical ?? true);
  const [mismatch, setMismatch] = useState(saved.mismatch ?? true);
  const [dailyDigest, setDailyDigest] = useState(saved.dailyDigest ?? false);
  const [retentionDays, setRetentionDays] = useState(saved.retentionDays ?? "365");
  return (
    <div className="page">
      <SectionHead
        title="Settings"
        copy="Workspace, notification, and security controls."
        action={
          <button
            className="button primary"
            onClick={() => { localStorage.setItem("clouddash-settings", JSON.stringify({ retention, digest, critical, mismatch, dailyDigest, retentionDays })); notify("Settings saved in this browser") }}
          >
            Save changes
          </button>
        }
      />
      <section className="settings-grid">
        <article className="panel">
          <h2>Evidence security</h2>
          <p className="muted">
            Controls applied to all newly ingested footage.
          </p>
          <Toggle
            label="Require SHA-256 verification"
            checked={digest}
            onChange={setDigest}
          />
          <Toggle
            label="Archive after 90 days"
            checked={retention}
            onChange={setRetention}
          />
          <label className="select-label">
            Default retention
            <select value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)}>
              <option>365 days</option>
              <option>180 days</option>
              <option>7 years</option>
            </select>
          </label>
        </article>
        <article className="panel">
          <h2>Notifications</h2>
          <p className="muted">
            Route urgent operational events to the analyst team.
          </p>
          <Toggle label="Critical incident alerts" checked={critical} onChange={setCritical} />
          <Toggle label="Integrity mismatch alerts" checked={mismatch} onChange={setMismatch} />
          <Toggle label="Daily cost digest" checked={dailyDigest} onChange={setDailyDigest} />
        </article>
        <article className="panel">
          <h2>API access</h2>
          <p className="muted">
            Service credentials are scoped by role and workspace.
          </p>
          <div className="api-key">
            <KeyRound size={18} />
            <code>cd_live_****************73e1</code>
            <button className="text-button" onClick={() => notify("API-key rotation must be completed in your backend secret manager")}>Rotate</button>
          </div>
          <button className="button secondary full">Manage API keys</button>
        </article>
      </section>
    </div>
  );
}
function Toggle({ label, checked, onChange = () => {} }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i />
    </label>
  );
}

function Documentation() {
  const sections = [
    [
      "Architecture",
      "Normal video stays in device IndexedDB while signed fingerprints are appended to Supabase. Only locked incident video enters private cloud storage.",
    ],
    [
      "Encoder workflow",
      "Original bytes are persisted locally, hashed with SHA-256, chained, signed by the device key, and transmitted through a durable offline outbox.",
    ],
    [
      "Security model",
      "Supabase Auth, device ownership, row-level policies, append-only fingerprints, ECDSA P-256 signatures, and a private evidence bucket.",
    ],
    [
      "Decoder workflow",
      "Local SHA-256 comparison is followed by public-key signature verification and ordered hash-chain verification against trusted cloud records.",
    ],
    [
      "Result semantics",
      "SENT means cloud acknowledged. VERIFIED requires matching bytes, a valid device signature, a valid chain, and a trusted Supabase record.",
    ],
    [
      "Deployment guide",
      "Deploy the Vite application on Vercel, apply Supabase migrations, configure Auth redirects, and keep the evidence bucket private.",
    ],
  ];
  return (
    <div className="page">
      <SectionHead
        title="Documentation"
        copy="Architecture and operational reference for CloudDash Integrity."
      />
      <section className="docs-layout">
        <aside className="panel docs-nav">
          <b>Contents</b>
          {sections.map((s) => (
            <a href={`#${s[0].toLowerCase().replace(" ", "-")}`} key={s[0]}>
              {s[0]}
            </a>
          ))}
        </aside>
        <article className="panel docs-content">
          <div className="architecture">
            <Camera size={22} />
            <span>Local video</span>
            <span>→</span>
            <KeyRound size={22} />
            <span>Hash + signature</span>
            <span>→</span>
            <LockKeyhole size={22} />
            <span>Supabase reference</span>
            <span>→</span>
            <LayoutDashboard size={22} />
            <span>Analyst console</span>
          </div>
          {sections.map((s) => (
            <section key={s[0]} id={s[0].toLowerCase().replace(" ", "-")}>
              <h2>{s[0]}</h2>
              <p>{s[1]}</p>
            </section>
          ))}
        </article>
      </section>
    </div>
  );
}

function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) { setSession(null); setMessage('Supabase is not configured. Add the Vite Supabase environment variables.'); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = subscribeToAuth(setSession);
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session?.user || !supabase) return;
    supabase.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' });
  }, [session]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    const result = mode === 'sign-in' ? await signInWithPassword(email, password) : await signUp(email, password, displayName || email.split('@')[0]);
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    if (mode === 'sign-up' && !result.data.session) setMessage('Check your email to confirm the account, then sign in.');
  }
  if (session === undefined) return <div className="auth-gate"><LoaderCircle className="spin" size={28}/></div>;
  if (session) return typeof children === 'function' ? children(session) : children;
  return <main className="auth-gate"><form className="auth-card" onSubmit={submit}><div className="brand-mark"><ShieldCheck size={22}/></div><h1>CloudDash Integrity</h1><p>{mode === 'sign-in' ? 'Sign in to your evidence workspace.' : 'Create an analyst workspace account.'}</p>{mode === 'sign-up' && <label>Name<input required value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your name"/></label>}<label>Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input required minLength="6" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>{message && <div className="auth-message">{message}</div>}<button className="button primary full" disabled={busy}>{busy ? 'Please wait...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button><button type="button" className="text-button auth-switch" onClick={()=>{setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');setMessage('')}}>{mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button></form></main>;
}

function App() {
  const location = useLocation();
  const [localMessage, setLocalMessage] = useState('');
  if (location.pathname === '/evaluation-local') return <main className="local-evaluation"><NavLink className="button secondary" to="/">Sign in to cloud workspace</NavLink>{localMessage && <p role="status">{localMessage}</p>}<EvaluationLab localOnly notify={setLocalMessage} /></main>;
  return <AuthGate>{(session) => <CloudDash session={session} />}</AuthGate>;
}

function CloudDash({ session }) {
  const [videos, setVideos] = useState(initialVideos);
  const [alerts, setAlerts] = useState([
    {
      id: "AL-214",
      title: "Collision classification exceeds threshold",
      description:
        "EV-2026-1842 was assigned a 94% collision confidence score.",
      severity: "high",
      time: "6 min ago",
      source: "AI analysis",
      resolved: false,
    },
    {
      id: "AL-213",
      title: "Integrity review required",
      description: "Evidence EV-2026-1840 requires an analyst-led hash review.",
      severity: "medium",
      time: "1 hr ago",
      source: "Integrity service",
      resolved: false,
    },
    {
      id: "AL-212",
      title: "Smoke signature detected",
      description:
        "A critical scene event was found on the A36 evidence stream.",
      severity: "critical",
      time: "4 hrs ago",
      source: "AI analysis",
      resolved: false,
    },
  ]);
  const [toast, setToast] = useState("");
  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 3200);
  };
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardMetrics,
    retry: false,
  });
  return (
    <Layout alerts={alerts} setAlerts={setAlerts} session={session}>
      {dashboardQuery.isLoading ? (
        <div className="page">
          <div className="skeleton title" />
          <div className="skeleton-grid">
            {[1, 2, 3, 4].map((x) => (
              <div className="skeleton" key={x} />
            ))}
          </div>
        </div>
      ) : (
        <Routes>
          <Route
            path="/"
            element={
              <Monitor videos={videos} notify={notify} />
            }
          />
          <Route path="/encoder" element={<Encoder notify={notify} />} />
          <Route
            path="/queue"
            element={<Queue videos={videos} notify={notify} />}
          />
          <Route
            path="/integrity"
            element={<Integrity videos={videos} notify={notify} />}
          />
          <Route path="/decoder" element={<Decoder notify={notify} />} />
          <Route path="/evaluation" element={<EvaluationLab notify={notify} />} />
          <Route path="/settings" element={<SettingsPage notify={notify} />} />
          <Route path="/documentation" element={<Documentation />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      {toast && (() => {
        const isError = /failed|failure|could not|error|mismatch|invalid|not found|remain queued|rejected|tamper/i.test(toast);
        return <div className={isError ? "toast error" : "toast"}>
          {isError ? <AlertTriangle size={17} /> : <Check size={17} />}
          {toast}
        </div>;
      })()}
    </Layout>
  );
}
export default App;
