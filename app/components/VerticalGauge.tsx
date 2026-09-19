export default function VerticalGauge({
  label,
  percent,
  sublabel,
}: {
  label: string;
  percent: number;
  sublabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="gauge-col">
      <div className="gauge-track">
        <div className="gauge-marker" style={{ bottom: `${clamped}%` }}>
          <span className="gauge-marker-value">{clamped}%</span>
        </div>
      </div>
      <div className="gauge-label">{label}</div>
      {sublabel && <div className="gauge-sublabel">{sublabel}</div>}
    </div>
  );
}
