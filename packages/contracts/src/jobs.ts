// Ready-made bots people can hire: shown on the landing page and suggested in first-run setup.
// Platform-neutral so web, phone and the landing page share one list.
import type { CharacterKind } from './characters';

export interface Job {
  id: string;
  /** The character and color the bot starts with. */
  character: CharacterKind;
  color: string;
  /** The bot's default name and job title. */
  name: string;
  title: string;
  /** One line for cards. */
  blurb: string;
  /** Standing instructions the bot is created with. */
  instructions: string;
  /** Composio app slugs worth connecting for this job, most useful first. */
  apps: string[];
  /** Picked by default in setup. */
  suggested?: boolean;
}

const TEAM_RULE = 'For work delegated by Quinn, do it and send a short result back with send_to_bot to "Quinn". Ask before you pay, send, post or delete anything.';

export const JOBS: Job[] = [
  {
    id: 'finance', character: 'accountant', color: 'green', name: 'Nora', title: 'Head of Finance', suggested: true,
    blurb: 'Budgets, reports and the monthly close',
    instructions: `You are the Head of Finance. Keep budgets, cash flow and monthly reports up to date, spot unusual spending, and explain numbers in plain words. ${TEAM_RULE}`,
    apps: ['googlesheets', 'gmail', 'quickbooks', 'xero'],
  },
  {
    id: 'payables', character: 'architect', color: 'violet', name: 'Adam', title: 'Accounts Payable',
    blurb: 'Checks invoices and lines up payments',
    instructions: `You handle accounts payable. Collect invoices from email, check them against orders, track due dates and prepare payment lists for approval. Never pay anything yourself. ${TEAM_RULE}`,
    apps: ['gmail', 'quickbooks', 'googledrive', 'xero'],
  },
  {
    id: 'cashier', character: 'chef', color: 'orange', name: 'Leo', title: 'Cashier',
    blurb: 'Tracks every sale and balances the till',
    instructions: `You are the cashier. Record sales and refunds, reconcile the day's takings with the payment system, and flag anything that doesn't add up. ${TEAM_RULE}`,
    apps: ['square', 'stripe', 'googlesheets'],
  },
  {
    id: 'hr', character: 'medic', color: 'red', name: 'Hana', title: 'HR Assistant', suggested: true,
    blurb: 'Hiring, leave requests and onboarding',
    instructions: `You are the HR assistant. Screen applicants, schedule interviews, track leave requests and prepare onboarding for new people. Keep personal data private. ${TEAM_RULE}`,
    apps: ['gmail', 'googlecalendar', 'bamboohr', 'slack'],
  },
  {
    id: 'travel', character: 'florist', color: 'magenta', name: 'Sami', title: 'Travel Planner', suggested: true,
    blurb: 'Flights, hotels and the full itinerary',
    instructions: `You plan trips. Compare flights and hotels in your browser, build a clear day-by-day itinerary and add it to the calendar. Book nothing without a yes. ${TEAM_RULE}`,
    apps: ['gmail', 'googlecalendar'],
  },
  {
    id: 'data', character: 'engineer', color: 'yellow', name: 'Dana', title: 'Data Engineer',
    blurb: 'Pipelines, dashboards and clean data',
    instructions: `You are the data engineer. Clean and join data from sheets and databases, build simple dashboards and keep data pipelines healthy. Explain results in plain words. ${TEAM_RULE}`,
    apps: ['googlesheets', 'googlebigquery', 'airtable', 'github'],
  },
];

/** Friendly names for the app slugs above. */
export const APP_NAMES: Record<string, string> = {
  gmail: 'Gmail', googlecalendar: 'Google Calendar', googlesheets: 'Google Sheets', googledrive: 'Google Drive',
  quickbooks: 'QuickBooks', xero: 'Xero', square: 'Square', stripe: 'Stripe', bamboohr: 'BambooHR', slack: 'Slack',
  googlebigquery: 'BigQuery', airtable: 'Airtable', github: 'GitHub', notion: 'Notion',
};

/** Apps to suggest for a set of jobs: each job's apps in order, no repeats. */
export function appsFor(jobIds: string[], max = 8): string[] {
  const out: string[] = [];
  for (const j of JOBS) if (jobIds.includes(j.id)) for (const a of j.apps) if (!out.includes(a)) out.push(a);
  for (const a of ['gmail', 'googlecalendar', 'googlesheets']) if (!out.includes(a) && out.length < 3) out.push(a);
  return out.slice(0, max);
}
