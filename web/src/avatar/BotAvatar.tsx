import { FinoCharacter } from './FinoCharacter';
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
export const PICKER_SHAPES: AvatarShape[] = ['accountant','chef','medic','architect','engineer','florist'];

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
  return <span className={`fino-avatar ${ring ? 'is-ring' : ''} ${className ?? ''}`} style={{ width: size, height: size }} title={title} role="img" aria-label={title ?? `${color} ${shape} companion`}>
    <FinoCharacter shape={shape} color={color}/>
    {star && <span className="bot-avatar__star" style={{ width: size * .34, height: size * .34 }}><Icon name="star" size={size * .26} color="#f8c74f" /></span>}
  </span>;
}

export function BotAvatarFor({ bot, size, star, className }: { bot: Pick<Bot, 'avatarShape' | 'avatarColor' | 'name'> & { isPrimary?: boolean }; size: number; star?: boolean; className?: string }) {
  return <BotAvatar shape={bot.avatarShape} color={bot.avatarColor} size={size} star={star ?? bot.isPrimary} className={className} title={bot.name} />;
}
