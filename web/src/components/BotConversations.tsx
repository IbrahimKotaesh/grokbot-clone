import type {ReactNode} from 'react';
import type {Bot} from '@shared/types';

/** Each bot has one conversation, so its row needs no chat list beneath it: this simply shows the row.
 * (Kept as a wrapper so the sidebar's structure stays the same.) */
export function BotConversations({children}:{bot:Bot;collapsed:boolean;children:ReactNode}){
 return <>{children}</>;
}
