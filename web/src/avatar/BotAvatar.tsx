import type { AvatarColor, AvatarShape, Bot } from '@shared/types';
import { Icon } from '../components/Icon';
import { SHAPES, type ShapeDef } from './shapes.gen';

/** Shapes without an exported SVG fall back to the closest silhouette we have. */
const FALLBACK: Partial<Record<AvatarShape, string>> = {
  bean: 'teardrop', squircle: 'square', capsule: 'tablet', cylinder: 'tablet', gem: 'hex', crystal: 'hex',
  shield: 'house', dome: 'house', arch: 'house', leaf: 'teardrop',
};

export function shapeDef(shape: AvatarShape | string): ShapeDef {
  return SHAPES[shape] ?? SHAPES[FALLBACK[shape as AvatarShape] ?? 'blob'] ?? SHAPES.blob;
}

/** Shapes offered in the Create New Bot picker, in the design's order (rows of 5/5/3). */
export const PICKER_SHAPES: AvatarShape[] = ['blob', 'cloud', 'square', 'sparkle', 'clover', 'heart', 'flower', 'teardrop', 'tablet', 'wedge', 'house', 'star', 'hex'];

interface Props {
  shape: AvatarShape | string;
  color: AvatarColor | string;
  /** Slot size in px. The drawing overflows the slot by the design's 1.533x ratio. */
  size: number;
  star?: boolean;
  /** Selected-shape ring (white gap + gray outline following the silhouette). */
  ring?: boolean;
  className?: string;
  title?: string;
}

export function BotAvatar({ shape, color, size, star, ring, className, title }: Props) {
  const hues: Record<string, number> = { black: 0, blue: 45, cyan: 15, green: -35, violet: 100, magenta: 140, red: 180, orange: 200, yellow: 235, brown: 195, gray: 0 };
  return <span className={`fino-avatar ${ring ? 'is-ring' : ''} ${className ?? ''}`} style={{ width: size, height: size }} title={title} role="img" aria-label={title ?? `${color} ${shape} companion`}>
    <img src="/icons/fino-mascot.png" alt="" style={{ filter: `hue-rotate(${hues[color] ?? 0}deg)${color === 'gray' ? ' saturate(0)' : ''}`, borderRadius: shape === 'square' ? '22%' : shape === 'star' ? '50%' : '32%' }} />
    {star && <span className="bot-avatar__star" style={{ width: size * .28, height: size * .28 }}><Icon name="star" size={size * .15} color="#fff" /></span>}
  </span>;
}

export function BotAvatarFor({ bot, size, star, className }: { bot: Pick<Bot, 'avatarShape' | 'avatarColor' | 'name'> & { isPrimary?: boolean }; size: number; star?: boolean; className?: string }) {
  return <BotAvatar shape={bot.avatarShape} color={bot.avatarColor} size={size} star={star} className={className} title={bot.name} />;
}
