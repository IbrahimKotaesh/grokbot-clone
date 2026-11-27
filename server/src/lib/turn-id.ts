// The id of each Bot's running turn, so every model call in it is counted as one message on the Usage page
// (a message that takes ten steps is still one message) and its working time runs from first call to last.
import { newId } from './ids.js';
const turns = new Map<string, { id: string; startedAt: number }>();
export const beginTurn = (botId: string) => { const t = { id: newId('turn'), startedAt: Date.now() }; turns.set(botId, t); return t; };
export const currentTurn = (botId: string) => turns.get(botId);
export const endTurn = (botId: string, id: string) => { if (turns.get(botId)?.id === id) turns.delete(botId); };
