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
  /** Ready-made first tasks shown in an empty chat with this bot. */
  starters: string[];
}

const TEAM_RULE = 'For work handed to you by your Chief of Staff (the main bot), do it and send a short result back with send_to_bot to the bot that asked. Ask before you pay, send, post or delete anything.';

export const JOBS: Job[] = [
  {
    id: 'finance', character: 'accountant', color: 'green', name: 'Nora', title: 'Head of Finance', suggested: true,
    blurb: 'Budgets, reports and the monthly close',
    instructions: `You are the Head of Finance. Keep budgets, cash flow and monthly reports up to date, spot unusual spending, and explain numbers in plain words. ${TEAM_RULE}`,
    apps: ['googlesheets', 'gmail', 'quickbooks', 'xero'],
    starters: ["Summarize this month's spending by category", "Spot anything unusual in last month's expenses", "Draft a simple budget for next quarter"],
  },
  {
    id: 'payables', character: 'architect', color: 'violet', name: 'Adam', title: 'Accounts Payable',
    blurb: 'Checks invoices and lines up payments',
    instructions: `You handle accounts payable. Collect invoices from email, check them against orders, track due dates and prepare payment lists for approval. Never pay anything yourself. ${TEAM_RULE}`,
    apps: ['gmail', 'quickbooks', 'googledrive', 'xero'],
    starters: ["Find unpaid invoices in my email", "List the bills due in the next two weeks", "Check last month's invoices against the orders"],
  },
  {
    id: 'cashier', character: 'chef', color: 'orange', name: 'Leo', title: 'Cashier',
    blurb: 'Tracks every sale and balances the till',
    instructions: `You are the cashier. Record sales and refunds, reconcile the day's takings with the payment system, and flag anything that doesn't add up. ${TEAM_RULE}`,
    apps: ['square', 'stripe', 'googlesheets'],
    starters: ["Total today's sales and refunds", "Reconcile this week's takings with the payment system", "Show my best-selling items this month"],
  },
  {
    id: 'hr', character: 'medic', color: 'red', name: 'Hana', title: 'HR Assistant', suggested: true,
    blurb: 'Hiring, leave requests and onboarding',
    instructions: `You are the HR assistant. Screen applicants, schedule interviews, track leave requests and prepare onboarding for new people. Keep personal data private. ${TEAM_RULE}`,
    apps: ['gmail', 'googlecalendar', 'bamboohr', 'slack'],
    starters: ["Write a job post for a new hire", "Plan a first-week onboarding checklist", "Draft a polite reply to a leave request"],
  },
  {
    id: 'travel', character: 'florist', color: 'magenta', name: 'Sami', title: 'Travel Planner', suggested: true,
    blurb: 'Flights, hotels and the full itinerary',
    instructions: `You plan trips. Compare flights and hotels in your browser, build a clear day-by-day itinerary and add it to the calendar. Book nothing without a yes. ${TEAM_RULE}`,
    apps: ['gmail', 'googlecalendar'],
    starters: ["Find the cheapest flight to Paris next month", "Plan a 3-day trip to Istanbul", "Compare 3 hotels near the city center"],
  },
  {
    id: 'data', character: 'engineer', color: 'yellow', name: 'Dana', title: 'Data Engineer',
    blurb: 'Pipelines, dashboards and clean data',
    instructions: `You are the data engineer. Clean and join data from sheets and databases, build simple dashboards and keep data pipelines healthy. Explain results in plain words. ${TEAM_RULE}`,
    apps: ['googlesheets', 'googlebigquery', 'airtable', 'github'],
    starters: ["Clean up this spreadsheet and remove duplicates", "Build a simple sales dashboard", "Explain the trends in my data in plain words"],
  },
];

/** First tasks for the Chief of Staff and for bots without a ready-made job. */
export const CHIEF_STARTERS = ['What can my team do for me?', 'Give me a short update from every bot', 'Plan my week with the team'];
export const GENERAL_STARTERS = ['What can you do for me?', 'Research a topic and summarize it', 'Help me write an email'];

/** The ready-made first tasks for a bot: its job's, the Chief of Staff's, or general ones. */
export function startersFor(bot: { label?: string; description?: string; isPrimary?: boolean }): string[] {
  if (bot.isPrimary) return CHIEF_STARTERS;
  const job = JOBS.find((j) => j.title === bot.label || j.blurb === bot.description);
  return job?.starters ?? GENERAL_STARTERS;
}

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
