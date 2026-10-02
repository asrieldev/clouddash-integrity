const FINDING_LABELS = {
  UNMATCHED_SECTION: ['Changed or replaced section', 'Frames in this time range differ from the trusted recording. This may be an edit, replacement, overlay, crop, blur, or another visual change.'],
  REFERENCE_GAP: ['Possible deleted section', 'The trusted recording contains material that is absent from the submitted video.'],
  POSSIBLE_REORDER: ['Possible reordered footage', 'Similar frames appear in a different order from the trusted recording.'],
  POSSIBLE_DUPLICATE_OR_STATIC_SCENE: ['Possible repeated footage', 'A frame sequence may be duplicated, although a genuinely static scene can look the same.'],
  TIME_SCALE_CHANGE: ['Possible speed change', 'The submitted footage appears to play at a different rate from the trusted recording.']
};

export function modificationFindings(anomalies = []) {
  const findings = anomalies.map(anomaly => {
    const [label, explanation] = FINDING_LABELS[anomaly.type] || ['Unclassified difference', 'The comparison found a difference that needs human review.'];
    return { ...anomaly, label, explanation };
  });
  return findings.reduce((merged, finding) => {
    const previous = merged.at(-1);
    if (previous?.type === finding.type && previous.start != null && finding.start != null && finding.start <= (previous.end ?? previous.start) + 0.51) {
      previous.end = Math.max(previous.end ?? previous.start, finding.end ?? finding.start);
    } else merged.push({ ...finding });
    return merged;
  }, []);
}
