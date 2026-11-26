// Dev only (npm run dev, then /?badr-preview): Badr's six moods side by side, to check the motion.
import { Badr, type BadrMood } from '../components/Badr';

const MOODS: BadrMood[] = ['hop', 'wave', 'think', 'celebrate', 'sleep', 'peek'];

export function BadrPreview() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, padding: 48, background: 'var(--p-bg)', minHeight: '100vh', color: 'var(--p-text)' }}>
      {MOODS.map((m) => (
        <figure key={m} style={{ margin: 0, display: 'grid', justifyItems: 'center', gap: 12 }}>
          <Badr mood={m} size={120} />
          <figcaption style={{ fontWeight: 800 }}>{m}</figcaption>
        </figure>
      ))}
    </div>
  );
}
