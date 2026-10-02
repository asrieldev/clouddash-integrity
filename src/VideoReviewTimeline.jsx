import { modificationFindings } from './matching/modificationFindings.js';

const LABELS = {
  consistent: ['Appears consistent', 'Frames in this section align with the trusted recording.'],
  review: ['Needs review', 'These frames did not align with the trusted recording and may have been edited, replaced, or obscured.'],
  inconclusive: ['Not enough visual detail', 'This section is too visually uniform to make a reliable similarity decision.']
};

function clock(seconds = 0) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds - minutes * 60);
  return `${minutes}:${remainder.toFixed(1).padStart(4, '0')}`;
}

export default function VideoReviewTimeline({ sections = [], duration, anomalies = [], onSeek }) {
  if (!sections.length || !duration) return null;
  const review = sections.filter(section => section.state === 'review');
  const findings = modificationFindings(anomalies);
  return <div className="video-review">
    <div className="video-review-heading"><div><h3>Section review</h3><p>{review.length ? `${review.length} time range${review.length === 1 ? '' : 's'} need attention.` : 'No suspicious time ranges were detected by this comparison.'}</p></div><div className="video-review-legend"><span className="consistent">Appears consistent</span><span className="review">Needs review</span><span className="inconclusive">Not enough detail</span></div></div>
    <div className="video-review-track" aria-label="Video section review timeline">{sections.map((section, index) => {
      const [label, explanation] = LABELS[section.state];
      const width = Math.max(1, 100 * (section.end - section.start) / duration);
      return <button key={`${section.start}-${index}`} type="button" className={section.state} style={{ width: `${width}%` }} title={`${label}: ${clock(section.start)}–${clock(section.end)}. ${explanation}`} aria-label={`${label}, ${clock(section.start)} to ${clock(section.end)}`} onClick={() => onSeek?.(section.start)} />;
    })}</div>
    <div className="video-review-times"><span>0:00.0</span><span>{clock(duration)}</span></div>
    <div className="video-review-list">{sections.map((section, index) => {
      const [label, explanation] = LABELS[section.state];
      return <button key={`${section.state}-${section.start}-${index}`} type="button" onClick={() => onSeek?.(section.start)}><span className={section.state} /> <b>{clock(section.start)}–{clock(section.end)} · {label}</b><small>{explanation}</small></button>;
    })}</div>
    {findings.length > 0 && <div className="modification-findings"><h4>Possible modification types</h4>{findings.map((finding, index) => {
      const seekable = finding.type !== 'REFERENCE_GAP' && finding.start != null && onSeek;
      return <button type="button" key={`${finding.type}-${finding.start ?? index}`} onClick={() => seekable && onSeek(finding.start)}><b>{finding.label}{finding.start != null ? ` · ${finding.type === 'REFERENCE_GAP' ? 'trusted recording ' : ''}${clock(finding.start)}${finding.end != null ? `–${clock(finding.end)}` : ''}` : ''}</b><small>{finding.explanation}</small></button>;
    })}</div>}
    <p className="video-review-caution">This timeline identifies sections for human review. Similarity analysis cannot prove the exact editing method or replace the exact SHA-256 integrity result.</p>
  </div>;
}
