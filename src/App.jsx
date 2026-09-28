import { useEffect, useMemo, useRef, useState } from "react";
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
  MapPinned,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  ShieldCheck,
  UserCog,
  Users as UsersIcon,
  Wallet,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { auditLogs, incidents, initialVideos, fmt } from "./lib";
import { getDashboardMetrics } from "./api";
import { signInWithPassword, signUp, subscribeToAuth } from "./auth";
import { supabase } from "./supabase";
import { createEvidenceSegment, sha256, verifyEvidenceChain } from "./security/chain";
import { createDevice, downloadEvidenceSegment, listEvidenceSegments, uploadQueuedSegment, uploadSegment } from "./evidenceRepository";
import { enqueueSegment, flushQueue } from "./storage/offlineQueue";

const NAV = [
  ["Live monitor", "/", Activity],
  ["Verify evidence", "/evidence", ShieldCheck],
  ["Driver capture", "/encoder", Camera],
  ["Integrity log", "/integrity", FileCheck2],
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

function Layout({ children, alerts, setAlerts }) {
  const loc = useLocation();
  return (
    <div className="focused-shell">
      <header className="app-topbar">
        <NavLink to="/" className="app-identity" aria-label="CloudDash home">
          <span className="brand-mark"><ShieldCheck size={19} /></span>
          <span>
            <small>INTEGRITY RELAY</small>
            <strong>CloudDash</strong>
          </span>
        </NavLink>
        <nav className="top-navigation" aria-label="Primary navigation">
          {NAV.map(([name, path, Icon]) => (
            <NavLink key={path} to={path} end={path === "/"}>
              <Icon size={16} />
              {name}
            </NavLink>
          ))}
        </nav>
        <div className="top-status"><span className="signal" /> Secure sync</div>
      </header>
      <main className="focused-main">
        {children}
      </main>
    </div>
  );
}

function Monitor({ videos, notify }) {
  const [stored, setStored] = useState([]);
  const records = stored.length ? stored : videos;
  const reload = async () => {
    if (!supabase) return;
    try {
      const segments = await listEvidenceSegments();
      setStored(segments.map((segment) => ({
        id: segment.id,
        name: segment.object_path.split('/').pop(),
        captured: new Date(segment.captured_at).toLocaleString(),
        location: segment.devices?.label || 'Driver dashcam',
        hash: segment.sha256,
        integrity: segment.status === 'transmitted' ? 'Verified' : 'Pending',
      })));
    } catch (error) { notify(`Could not refresh live evidence: ${error.message}`); }
  };
  useEffect(() => { reload(); }, []);
  const valid = records.filter((video) => video.integrity === "Verified").length;
  return (
    <div className="page monitor-page">
      <SectionHead
        title="Live monitor"
        copy="A concise view of incoming evidence and chain integrity."
        action={<button className="button secondary" onClick={reload}><Activity size={16} /> Refresh</button>}
      />
      <section className="metrics monitor-metrics">
        <Metric label="Evidence records" value={records.length} change="Stored evidence segments" icon={FileVideo} />
        <Metric label="Chain verified" value={valid} change="Signature and sequence checked" icon={ShieldCheck} tone="green" />
        <Metric label="Needs review" value={records.length - valid} change="Awaiting upload or review" icon={AlertTriangle} tone="amber" />
        <Metric label="Capture devices" value="1" change="Driver device online" icon={Camera} tone="violet" />
      </section>
      <section className="panel monitor-sessions">
        <div className="panel-title">
          <div><h2>Evidence sessions</h2><p>Every session is checked in sequence before it appears here.</p></div>
          <NavLink className="button secondary" to="/encoder"><Camera size={16} /> Open capture</NavLink>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Evidence</th><th>Captured</th><th>Location</th><th>Integrity</th><th /></tr></thead><tbody>
          {records.map((video) => <tr key={video.id}><td><b>{video.id}</b><small>{video.name}</small></td><td>{video.captured}</td><td>{video.location}</td><td><Badge tone={video.integrity === "Verified" ? "success" : "warning"}>{video.integrity}</Badge></td><td><NavLink to="/evidence" className="text-button">Inspect</NavLink></td></tr>)}
        </tbody></table></div>
      </section>
      <section className="panel fingerprint-stream">
        <div className="panel-title"><div><h2>Incoming fingerprints</h2><p>Hashes are checked when a segment reaches the evidence service.</p></div><Badge tone="success">Chain intact</Badge></div>
        <div className="fingerprint-list">{records.map((video, index) => <div key={video.hash}><span>#{String(records.length - index).padStart(2, "0")}</span><b>{video.id}</b><code>{video.hash}</code><Badge tone={video.integrity === "Verified" ? "success" : "warning"}>{video.integrity === "Verified" ? "signed" : "review"}</Badge></div>)}</div>
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

function EvidenceTable({ videos, compact, onSelect, onPlay }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Evidence</th>
            <th>Capture location</th>
            <th>Integrity</th>
            <th>Analysis</th>
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
                  tone={v.integrity === "Verified" ? "success" : "warning"}
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
          integrity: segment.status === "transmitted" ? "Verified" : "Pending",
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
        integrity: serverRecord ? "Verified" : "No matching server record",
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
        setPlayback({ name: video.name, url: video.localUrl });
        return;
      }
      if (!video.objectPath) throw new Error('This sample record has no stored video. Record a new clip first.');
      const blob = await downloadEvidenceSegment(video.objectPath);
      const url = URL.createObjectURL(blob);
      playbackUrlRef.current = url;
      setPlayback({ name: video.name, url });
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
            <div>
              <b>Add an evidence clip</b>
              <p>MP4, MOV, and WebM files are supported.</p>
            </div>
            <label className="button secondary">
              Browse files
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
          <div><b>{playback.name}</b><IconButton label="Close video player" onClick={() => setPlayback(null)}><X size={18} /></IconButton></div>
          <video src={playback.url} controls autoPlay playsInline />
        </article>
      </div>}
    </div>
  );
}

function Encoder({ notify }) {
  const [recording, setRecording] = useState(false);
  const [offline, setOffline] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [locked, setLocked] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastClip, setLastClip] = useState(null);
  const [segmentLength, setSegmentLength] = useState(5);
  const [recordingSource, setRecordingSource] = useState('camera');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const identityRef = useRef(null);
  const previousHashRef = useRef(null);
  const nextSequenceRef = useRef(3);
  const offlineRef = useRef(false);
  const lastClipUrlRef = useRef(null);
  const recordingRef = useRef(false);
  const segmentTimerRef = useRef(null);
  const segmentLengthRef = useRef(5);
  const simulationVideoRef = useRef(null);
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
    const retry = () => syncQueuedSegments();
    window.addEventListener('online', retry);
    retry();
    return () => window.removeEventListener('online', retry);
  }, []);
  async function prepareIdentity() {
    if (identityRef.current) return identityRef.current;
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sign in is required before recording.');
    const { data: workspaceId, error: workspaceError } = await supabase.rpc('bootstrap_workspace', { workspace_name: 'Forensics Lab' });
    if (workspaceError) throw workspaceError;
    let { data: device } = await supabase.from('devices').select('id').eq('workspace_id', workspaceId).limit(1).maybeSingle();
    if (!device) device = await createDevice(workspaceId);
    const { data: latest, error: sequenceError } = await supabase
      .from('evidence_segments')
      .select('sequence, chain_hash')
      .eq('device_id', device.id)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sequenceError) throw sequenceError;
    nextSequenceRef.current = latest ? latest.sequence + 1 : 0;
    previousHashRef.current = latest?.chain_hash || null;
    identityRef.current = { workspaceId, deviceId: device.id };
    return identityRef.current;
  }
  async function syncQueuedSegments() {
    if (offlineRef.current || !navigator.onLine) return;
    setSyncing(true);
    try {
      const synced = await flushQueue((queued) => uploadQueuedSegment({
        workspaceId: queued.workspaceId,
        deviceId: queued.deviceId,
        segment: queued,
        blob: queued.blob,
      }));
      if (synced) notify(`${synced} queued video segment${synced === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      notify(`Queued video is waiting for a connection: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }
  async function persistChunk(blob, fileInfo) {
    const identity = await prepareIdentity();
    const segment = await createEvidenceSegment({ sequence: nextSequenceRef.current++, capturedAt: new Date().toISOString(), bytes: blob.size, contentHash: await sha256(new Uint8Array(await blob.arrayBuffer())), previousHash: previousHashRef.current, metadata: { locked, source: 'browser-media-recorder', ...fileInfo } });
    previousHashRef.current = segment.chainHash;
    const result = offlineRef.current ? (await enqueueSegment({ ...segment, ...identity, blob }), { queued: true }) : await uploadSegment({ ...identity, segment, blob });
    const previewUrl = URL.createObjectURL(blob);
    if (lastClipUrlRef.current) URL.revokeObjectURL(lastClipUrlRef.current);
    lastClipUrlRef.current = previewUrl;
    const recordedClip = { url: previewUrl, sequence: segment.sequence, extension: fileInfo.extension };
    setSegments((rows) => [{ seq: segment.sequence, time: new Date().toLocaleTimeString('en-GB'), hash: segment.sha256.slice(0, 12), size: `${Math.max(1, Math.round(blob.size / 1024))} KB`, state: result.queued ? 'Queued' : 'Sent', preview: recordedClip }, ...rows].slice(0, 12));
    setLastClip(recordedClip);
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
          notify(`Segment is queued locally: ${error.message}`);
        }
      }
      if (recordingRef.current && streamRef.current === stream && stream.active) {
        beginSegment(stream, source);
      } else {
        stream.getTracks().forEach((track) => track.stop());
        simulationVideoRef.current?.stop?.();
        simulationVideoRef.current = null;
        recorderRef.current = null;
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
    try {
      if (!window.MediaRecorder) throw new Error('This browser does not support video recording.');
      await prepareIdentity();
      const stream = recordingSource === 'simulation'
        ? await createSimulationStream()
        : await navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!stream) throw new Error('This browser does not support camera recording.');
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      recordingRef.current = true;
      setElapsed(0);
      setRecording(true);
      beginSegment(stream, recordingSource);
      notify(`${recordingSource === 'simulation' ? 'Driving simulation' : 'Camera'} recording started. Each segment is saved as a complete playable video file.`);
    } catch (error) { notify(error.message || 'Camera access was not granted.'); }
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
  const latest = segments[0];
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
              onClick={() => {
                setLocked(true);
                notify(
                  "Incident clip locked and protected from retention cleanup",
                );
              }}
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
              <select defaultValue="3">
                <option value="3">3 minutes</option>
                <option value="15">15 minutes</option>
                <option value="60">1 hour</option>
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
              label="Segments recorded"
              value={segments.length}
              change={locked ? "Incident clip locked" : "5 second chunks"}
              icon={FileVideo}
              tone="green"
            />
            <Metric
              label="Hashes sent"
              value={segments.filter((x) => x.state === "Sent").length}
              change="SHA-256 chained"
              icon={ShieldCheck}
              tone="violet"
            />
            <Metric
              label="Outbox pending"
              value={segments.filter((x) => x.state === "Queued").length}
              change={syncing ? "Uploading queued clips" : offline ? "Awaiting uplink" : "No pending segments"}
              icon={Send}
              tone="amber"
            />
          </div>
          <article className="panel fingerprint">
            <div className="panel-title">
              <div>
                <h2>Last segment fingerprint</h2>
                <p>Immutable chain-of-custody preview</p>
              </div>
              <Lock size={16} />
            </div>
            {latest ? <dl>
              <dt>segment</dt>
              <dd>#{latest.seq} · {latest.time}</dd>
              <dt>segment_hash</dt>
              <dd className="hash-green">{latest.hash}...</dd>
              <dt>chain_status</dt>
              <dd className="hash-blue">Verified and linked</dd>
              <dt>retention</dt>
              <dd>{locked ? "Locked incident evidence" : "Rolling local buffer"}</dd>
            </dl> : <p className="muted">No recorded segment yet. Start the dashcam to create one.</p>}
          </article>
        </aside>
      </section>
      <section className="panel segment-table">
        <div className="panel-title">
          <div>
            <h2>Recordings on this device ({segments.length})</h2>
            <p>Choose play to review a captured segment before downloading or verifying it.</p>
          </div>
          <span className="storage">
            Browser storage: {(segments.length * 0.38).toFixed(1)} MB used
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sequence</th>
                <th>Captured</th>
                <th>Size</th>
                <th>SHA-256</th>
                <th>Transmission</th>
                <th>Retention</th>
                <th>Play</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.seq}>
                  <td>
                    <b>#{s.seq}</b>
                  </td>
                  <td>{s.time}</td>
                  <td>{s.size}</td>
                  <td>
                    <code>{s.hash}...</code>
                  </td>
                  <td>
                    <Badge tone={s.state === "Sent" ? "success" : "warning"}>
                      {s.state}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={locked ? "warning" : "neutral"}>
                      {locked ? "Locked" : "Rolling"}
                    </Badge>
                  </td>
                  <td>
                    <IconButton label={`Play recording ${s.seq}`} onClick={() => setLastClip(s.preview)}>
                      <Play size={16} />
                    </IconButton>
                  </td>
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
  const [failed, setFailed] = useState(false);
  const stages = [
    "Upload secured",
    "Metadata extracted",
    "SHA-256 recorded",
    "AI inference complete",
    "Alert dispatch",
  ];
  return (
    <div className="page">
      <SectionHead
        title="Ingestion queue"
        copy="Track asynchronous processing from encrypted upload to analyst-ready evidence."
        action={
          <button
            className="button secondary"
            onClick={() => {
              setFailed(!failed);
              notify(
                failed
                  ? "Job restored for processing"
                  : "Failure simulation enabled for next job",
              );
            }}
          >
            <Zap size={16} />
            Simulate {failed ? "recovery" : "failure"}
          </button>
        }
      />
      <section className="panel pipeline">
        <div className="pipeline-title">
          <h2>Processing pipeline</h2>
          <Badge tone="info">4 active jobs</Badge>
        </div>
        {stages.map((s, i) => (
          <div className="stage" key={s}>
            <span
              className={failed && i === 3 ? "stage-dot failed" : "stage-dot"}
            >
              {failed && i === 3 ? (
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
                {i < 4 ? "Completed in 2.4s" : "Queued, starts in 18 seconds"}
              </small>
            </div>
            <span className="stage-time">{i < 4 ? "Done" : "Pending"}</span>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Queued evidence</h2>
            <p>Recent jobs and retry status</p>
          </div>
          <button className="text-button">Refresh queue</button>
        </div>
        <EvidenceTable videos={videos} />
      </section>
    </div>
  );
}

function Incidents({ notify }) {
  const [filter, setFilter] = useState("All");
  const [active, setActive] = useState(incidents[0]);
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
          <button className="button secondary">
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
              onClick={() => setActive(i)}
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
              onClick={() => notify("Incident assignment updated")}
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
            <textarea placeholder="Add a case note..." />
            <button
              className="button primary"
              onClick={() => notify("Case note added to audit log")}
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
          <button className="button secondary">
            <Settings size={16} />
            Preferences
          </button>
        </div>
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
      const records = await listEvidenceSegments();
      setSegments(records);
      const byDevice = records.reduce((groups, segment) => {
        (groups[segment.device_id] ||= []).push(segment);
        return groups;
      }, {});
      const results = await Promise.all(Object.entries(byDevice).map(async ([deviceId, deviceSegments]) => {
        const result = await verifyEvidenceChain(deviceSegments.map((segment) => ({
          sequence: segment.sequence,
          sha256: segment.sha256,
          previousHash: segment.previous_hash,
          chainHash: segment.chain_hash,
        })));
        return { deviceId, label: deviceSegments[0].devices?.label || 'Driver dashcam', total: deviceSegments.length, ...result };
      }));
      setAudits(results);
      notify(results.every((result) => result.valid) ? 'Integrity audit completed: all chains are valid.' : 'Integrity audit found a chain mismatch.');
    } catch (error) {
      notify(`Could not run integrity audit: ${error.message}`);
    } finally { setRunning(false); }
  }
  useEffect(() => { runAudit(); }, []);
  const validChains = audits.filter((audit) => audit.valid).length;
  return (
    <div className="page">
      <SectionHead title="Integrity log" copy="Audit the exact hash chains stored for each driver device." action={<button className="button primary" onClick={runAudit} disabled={running}><ShieldCheck size={16} /> {running ? 'Auditing...' : 'Run audit'}</button>} />
      <section className="metrics">
        <Metric label="Stored segments" value={segments.length} change="Evidence records checked" icon={FileVideo} />
        <Metric label="Valid chains" value={`${validChains}/${audits.length}`} change={audits.length ? 'Device chains verified' : 'No captured chains yet'} icon={ShieldCheck} tone="green" />
        <Metric label="Chain failures" value={audits.filter((audit) => !audit.valid).length} change="Requires analyst review" icon={AlertTriangle} tone="amber" />
      </section>
      <section className="panel">
        <div className="panel-title"><div><h2>Device audit results</h2><p>Each result recomputes the sequence and prior-hash link for every stored segment.</p></div></div>
        {audits.length ? <div className="table-wrap"><table><thead><tr><th>Device</th><th>Segments</th><th>Last chain hash</th><th>Result</th></tr></thead><tbody>{audits.map((audit) => <tr key={audit.deviceId}><td><b>{audit.label}</b><small>{audit.deviceId.slice(0, 8)}</small></td><td>{audit.total}</td><td><code>{audit.lastHash?.slice(0, 24) || 'Not available'}...</code></td><td><Badge tone={audit.valid ? 'success' : 'danger'}>{audit.valid ? 'Chain valid' : `Failed at #${audit.failedSequence}`}</Badge></td></tr>)}</tbody></table></div> : <Empty text="No recorded evidence is available to audit yet." />}
      </section>
      <section className="panel fingerprint-stream">
        <div className="panel-title"><div><h2>Hash log</h2><p>Newest segments stored in Supabase.</p></div><Badge tone="info">SHA-256</Badge></div>
        {segments.length ? <div className="fingerprint-list">{segments.slice(0, 12).map((segment) => <div key={segment.id}><span>#{segment.sequence}</span><b>{segment.devices?.label || 'Driver dashcam'}</b><code>{segment.chain_hash}</code><Badge tone={segment.status === 'transmitted' ? 'success' : 'warning'}>{segment.status}</Badge></div>)}</div> : <Empty text="Record a clip from Driver capture, then run an audit." />}
      </section>
    </div>
  );
}

function Analytics({ costs = false }) {
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
              value="$1,842"
              change="72% of budget"
              icon={Wallet}
            />
            <Metric
              label="Forecast"
              value="$2,213"
              change="Within $2,500 limit"
              icon={Activity}
              tone="green"
            />
            <Metric
              label="Optimisation potential"
              value="$286"
              change="Lifecycle recommendations"
              icon={Zap}
              tone="amber"
            />
          </>
        ) : (
          <>
            <Metric
              label="Events detected"
              value="167"
              change="+18% this week"
              icon={AlertTriangle}
            />
            <Metric
              label="Median processing"
              value="48s"
              change="-9s vs last week"
              icon={Clock3}
              tone="green"
            />
            <Metric
              label="AI precision"
              value="94.2%"
              change="Validated incidents"
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
          <span>3 active locations</span>
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
          >
            <AlertTriangle size={16} />
            <span>
              <b>{p[0]}</b>
              {p[2]}
            </span>
          </button>
        ))}
        <div className="map-attribution">
          Map simulation · GPS coordinates are protected evidence metadata
        </div>
      </section>
    </div>
  );
}

function Health() {
  const svc = [
    ["API gateway", "Operational", "32 ms"],
    ["Object storage", "Operational", "18 ms"],
    ["AI worker pool", "Degraded", "2.8 min queue"],
    ["Integrity ledger", "Operational", "184 ms"],
    ["Notification service", "Operational", "62 ms"],
  ];
  return (
    <div className="page">
      <SectionHead
        title="System health"
        copy="Availability, latency and pipeline service diagnostics."
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
              <button className="icon-button" aria-label={`Inspect ${s[0]}`}>
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
  return (
    <div className="page">
      <SectionHead
        title="Audit logs"
        copy="Compliance-ready trail of evidence and user activity."
        action={
          <button className="button secondary">
            <Download size={16} />
            Export CSV
          </button>
        }
      />
      <section className="panel">
        <div className="toolbar">
          <div className="search wide">
            <Search size={17} />
            <input placeholder="Search actor, action, or evidence ID" />
          </div>
          <button className="button secondary">
            <ListFilter size={16} />
            Filter
          </button>
        </div>
        <div className="log-list audit">
          {auditLogs
            .concat([
              [
                "12:31",
                "Gateway",
                "Ingested encrypted video object",
                "EV-2026-1840",
              ],
              [
                "11:02",
                "System",
                "Rotated evidence encryption key",
                "KMS-CLOUDDASH",
              ],
            ])
            .map((r) => (
              <div key={r.join("")}>
                <span>{r[0]}</span>
                <b>{r[1]}</b>
                <p>{r[2]}</p>
                <code>{r[3]}</code>
              </div>
            ))}
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
              <IconButton label="Manage user">
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
  const [retention, setRetention] = useState(true);
  const [digest, setDigest] = useState(true);
  return (
    <div className="page">
      <SectionHead
        title="Settings"
        copy="Workspace, notification, and security controls."
        action={
          <button
            className="button primary"
            onClick={() => notify("Workspace settings saved")}
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
            <select defaultValue="365">
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
          <Toggle label="Critical incident alerts" checked={true} />
          <Toggle label="Integrity mismatch alerts" checked={true} />
          <Toggle label="Daily cost digest" checked={false} />
        </article>
        <article className="panel">
          <h2>API access</h2>
          <p className="muted">
            Service credentials are scoped by role and workspace.
          </p>
          <div className="api-key">
            <KeyRound size={18} />
            <code>cd_live_****************73e1</code>
            <button className="text-button">Rotate</button>
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
      "Ingress gateway → object storage → async workers → integrity ledger → analyst dashboard",
    ],
    [
      "Ingestion workflow",
      "Upload is encrypted, chunked, scanned, hashed, and dispatched to the AI worker queue.",
    ],
    [
      "Security model",
      "JWT authentication, role-based policies, audit logging, encrypted storage, and least-privilege service roles.",
    ],
    [
      "AI pipeline",
      "Scene classification produces confidence, labels, and an alert severity for analyst review.",
    ],
    [
      "API reference",
      "REST endpoints: /auth/login, /videos, /videos/:id/verify, /incidents, /alerts, /health.",
    ],
    [
      "Deployment guide",
      "Use Docker Compose for Postgres and the API; deploy the stateless web application and workers independently.",
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
            <Cloud size={22} />
            <span>Encrypted object store</span>
            <span>→</span>
            <Cpu size={22} />
            <span>AI workers</span>
            <span>→</span>
            <LockKeyhole size={22} />
            <span>Integrity ledger</span>
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
    if (!supabase) { setSession({ demo: true }); return; }
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
  if (session) return children;
  return <main className="auth-gate"><form className="auth-card" onSubmit={submit}><div className="brand-mark"><ShieldCheck size={22}/></div><h1>CloudDash Integrity</h1><p>{mode === 'sign-in' ? 'Sign in to your evidence workspace.' : 'Create an analyst workspace account.'}</p>{mode === 'sign-up' && <label>Name<input required value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your name"/></label>}<label>Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input required minLength="6" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>{message && <div className="auth-message">{message}</div>}<button className="button primary full" disabled={busy}>{busy ? 'Please wait...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button><button type="button" className="text-button auth-switch" onClick={()=>{setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');setMessage('')}}>{mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button></form></main>;
}

function App() { return <AuthGate><CloudDash /></AuthGate>; }

function CloudDash() {
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
    <Layout alerts={alerts} setAlerts={setAlerts}>
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
          <Route
            path="/evidence"
            element={
              <Evidence videos={videos} setVideos={setVideos} notify={notify} />
            }
          />
          <Route path="/encoder" element={<Encoder notify={notify} />} />
          <Route
            path="/queue"
            element={<Queue videos={videos} notify={notify} />}
          />
          <Route path="/incidents" element={<Incidents notify={notify} />} />
          <Route
            path="/alerts"
            element={
              <Alerts alerts={alerts} setAlerts={setAlerts} notify={notify} />
            }
          />
          <Route
            path="/integrity"
            element={<Integrity videos={videos} notify={notify} />}
          />
          <Route path="/map" element={<MapPage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/costs" element={<Analytics costs />} />
          <Route path="/health" element={<Health />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/users" element={<Users notify={notify} />} />
          <Route path="/settings" element={<SettingsPage notify={notify} />} />
          <Route path="/documentation" element={<Documentation />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      {toast && (
        <div className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
    </Layout>
  );
}
export default App;
