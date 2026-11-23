import { characterDataUri, characterKind, CHARACTER_KINDS, type CharacterKind } from '../../../packages/contracts/src/characters';
export { characterKind, CHARACTER_KINDS, type CharacterKind };

/** A bot's clay character, painted in the bot's color. Blinks on its own; CSS adds the breathing. */
export function FinoCharacter({ shape, color }: { shape: string; color: string }) {
  return <span className="fino-character" data-character={characterKind(shape)}>
    <img src={characterDataUri(shape, color)} alt="" aria-hidden="true" draggable={false} decoding="async" width="200" height="200" />
  </span>;
}
