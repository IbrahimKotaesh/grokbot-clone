import { ShieldCheck, Eye, Hand, Zap } from 'lucide-react';
import { t } from './i18n';

/** What a Bot may do on its own: shown in the Bot's settings. */
export const permissionChoices = [
  { id: 'read_only', name: t('Read only'), icon: Eye, description: t('Read connected data and screenshots. No commands or changes.') },
  { id: 'balanced', name: t('Balanced'), icon: ShieldCheck, description: t('Use the computer freely; ask before connected app changes.') },
  { id: 'ask', name: t('Ask first'), icon: Hand, description: t('Ask before commands, computer actions or app changes.') },
  { id: 'autonomous', name: t('Autonomous'), icon: Zap, description: t('Run computer actions and connected app changes without asking.') },
] as const;
