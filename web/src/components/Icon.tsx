import type { CSSProperties } from 'react';

export type IconName =
  | 'apps' | 'arrow_down' | 'chat_filled' | 'check' | 'chev_down' | 'chev_right' | 'clock' | 'close'
  | 'composer_plus' | 'copy' | 'edit' | 'file' | 'mic' | 'paperclip' | 'plus' | 'record' | 'save'
  | 'search' | 'share' | 'sidebar' | 'slack' | 'star' | 'voice_a' | 'voice_b'
  // inline extras not in the icon font export
  | 'arrow_up' | 'stop' | 'more' | 'monitor' | 'refresh';

const INLINE: Partial<Record<IconName, string>> = {
  arrow_up: 'M12 4.5a1 1 0 0 1 .7.3l6 6a1 1 0 0 1-1.4 1.4L13 7.9V19a1 1 0 1 1-2 0V7.9l-4.3 4.3a1 1 0 1 1-1.4-1.4l6-6a1 1 0 0 1 .7-.3Z',
  stop: 'M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  more: 'M5 10.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Zm7 0a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Zm7 0a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Z',
  monitor: 'M4.5 4h15A2.5 2.5 0 0 1 22 6.5v9a2.5 2.5 0 0 1-2.5 2.5H13v1.5h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3V18H4.5A2.5 2.5 0 0 1 2 15.5v-9A2.5 2.5 0 0 1 4.5 4Zm0 2a.5.5 0 0 0-.5.5v9c0 .28.22.5.5.5h15a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-15Z',
  refresh: 'M12 4a8 8 0 0 1 7.2 4.5V6a1 1 0 1 1 2 0v5a1 1 0 0 1-1 1h-5a1 1 0 1 1 0-2h2.6A6 6 0 1 0 18 14.4a1 1 0 1 1 1.9.6A8 8 0 1 1 12 4Z',
};

// Fino's rounded line icons share one stroke weight and generous spacing.
const LINES: Partial<Record<IconName, string>> = {
  apps: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13 M16 16l5 5',
  sidebar: 'M4 6h16 M4 12h16 M4 18h11',
  plus: 'M12 5v14 M5 12h14', composer_plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12 M18 6 6 18', check: 'm5 12 4 4L19 6',
  chev_down: 'm6 9 6 6 6-6', chev_right: 'm9 6 6 6-6 6', arrow_down: 'M12 4v16 m-7-7 7 7 7-7',
  arrow_up: 'M12 20V4 m-7 7 7-7 7 7',
  chat_filled: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z M7 9h10 M7 13h6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  edit: 'm14 5 5 5 M4 20l1-6L16 3l5 5-11 11-6 1Z',
  file: 'M14 3H5v18h14V8l-5-5Z M14 3v5h5 M8 13h8 M8 17h5',
  mic: 'M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V6Z M5 11v1a7 7 0 0 0 14 0v-1 M12 19v3 M8 22h8',
  copy: 'M8 8h12v13H8z M16 4V2H3v14h2',
  monitor: 'M3 4h18v13H3z M12 17v4 M8 21h8',
  share: 'M12 15V3 m-4 4 4-4 4 4 M5 11v10h14V11',
  paperclip: 'm8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7L13 2',
  voice_a: 'M4 10v4 M8 6v12 M12 3v18 M16 6v12 M20 10v4',
  voice_b: 'M4 10v4 M8 6v12 M12 3v18 M16 6v12 M20 10v4',
  save: 'M5 3h12l4 4v14H3V3h2 M7 3v6h10V3 M7 21v-8h10v8',
};

interface Props { name: IconName; size?: number; opacity?: number; className?: string; style?: CSSProperties; color?: string }

/** Single-color glyph from /assets/icons drawn as a CSS mask so it takes `currentColor`. */
export function Icon({ name, size = 16, opacity, className, style, color }: Props) {
  if (LINES[name]) return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity, color, flexShrink: 0, ...style }}><path d={LINES[name]} /></svg>;
  const inline = INLINE[name];
  if (inline) {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ opacity, color, flexShrink: 0, ...style }}>
        <path d={inline} fill="currentColor" />
      </svg>
    );
  }
  const url = `url(/assets/icons/${name}.svg)`;
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: 'inline-block', flexShrink: 0, width: size, height: size, opacity, color,
        backgroundColor: 'currentColor', WebkitMask: `${url} center / 100% 100% no-repeat`, mask: `${url} center / 100% 100% no-repeat`,
        ...style,
      }}
    />
  );
}
