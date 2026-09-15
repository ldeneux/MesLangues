export default function FlagIcon({ code }: { code: string }) {
  return <span className={`flag-icon flag-icon-${code}`} aria-hidden="true" />;
}
