export const initialVideos = [
  { id: 'EV-2026-1842', name: 'dashcam_20260928_1412.mp4', duration: '02:18', size: '284 MB', location: 'Rue de Bâle, Mulhouse', captured: 'Today, 14:12', hash: 'bf9cae31d2f4...8e51d08a', integrity: 'Reference only', status: 'Analysis complete', tags: ['intersection', 'vehicle'], confidence: 94, severity: 'high' },
  { id: 'EV-2026-1841', name: 'fleet_07_traffic.mp4', duration: '05:42', size: '612 MB', location: 'A36, Sausheim', captured: 'Today, 13:48', hash: '6f289cd95a61...2b9e78af', integrity: 'Reference only', status: 'Processing', tags: ['traffic'], confidence: 78, severity: 'medium' },
  { id: 'EV-2026-1840', name: 'patrol_west_021.mp4', duration: '01:06', size: '126 MB', location: 'Dornach, Mulhouse', captured: 'Today, 12:31', hash: 'a71c6fdab289...4b1242d9', integrity: 'Attention', status: 'Integrity review', tags: ['person'], confidence: 67, severity: 'low' }
];

export const incidents = [
  { id: 'INC-884', title: 'Vehicle collision detected', video: 'EV-2026-1842', severity: 'high', status: 'Open', confidence: 94, location: 'Rue de Bâle, Mulhouse', time: '14:12', analyst: 'M. Laurent' },
  { id: 'INC-883', title: 'Unusual roadside activity', video: 'EV-2026-1840', severity: 'medium', status: 'Investigating', confidence: 81, location: 'Dornach, Mulhouse', time: '12:34', analyst: 'J. Martin' },
  { id: 'INC-882', title: 'Smoke signature detected', video: 'EV-2026-1837', severity: 'critical', status: 'Escalated', confidence: 96, location: 'A36, Sausheim', time: '10:08', analyst: 'M. Laurent' }
];

export const auditLogs = [
  ['14:24', 'M. Laurent', 'Reviewed evidence integrity', 'EV-2026-1842'],
  ['14:18', 'System', 'Completed AI scene analysis', 'EV-2026-1842'],
  ['14:12', 'Gateway', 'Ingested encrypted video object', 'EV-2026-1842'],
  ['13:48', 'System', 'Started transcode and metadata extraction', 'EV-2026-1841']
];

export const fmt = new Intl.NumberFormat('en-US');
