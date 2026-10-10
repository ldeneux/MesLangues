export default function HighlightText({ text }: { text: string }) {
  const safe = typeof text === 'string' ? text : text == null ? '' : String(text);
  const parts = safe.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <mark key={i} className="highlight-mark">
            {part.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
