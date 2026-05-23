// Registry of supported integration apps + their normalization rules.
//
// Adding a new connector = a row here + a normalize function. Downstream
// consumers (memory extraction, background agents) work against the
// normalized `SignalEvent` shape and never care about the source.

export type AppId =
  | "google_calendar"
  | "apple_calendar"
  | "google_contacts"
  | "apple_contacts"
  | "gmail"
  | "icloud_mail"
  | "spotify"
  | "apple_health"
  | "apple_photos"
  | "apple_notes"
  | "apple_phone_log"
  | "apple_screen_time"
  | "plaid";

export interface AppDefinition {
  id: AppId;
  displayName: string;
  // "composio" = OAuth handled by Composio (cloud SaaS).
  // "shortcut" = iOS Shortcut bridge pushes aggregated payloads to our webhook.
  transport: "composio" | "shortcut";
  // For "composio" transport: the Composio app slug (Composio's identifier).
  composioApp?: string;
  // Default scopes requested on connect.
  defaultScopes?: string[];
  // Whether body content (vs metadata only) is opt-in.
  bodyOptIn?: boolean;
  description: string;
}

export const APPS: Record<AppId, AppDefinition> = {
  google_calendar: {
    id: "google_calendar",
    displayName: "Google Calendar",
    transport: "composio",
    composioApp: "googlecalendar",
    defaultScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    description: "Events, attendees, recurring meetings — fuels relationship graph + hygiene agent.",
  },
  apple_calendar: {
    id: "apple_calendar",
    displayName: "Apple Calendar",
    transport: "shortcut",
    description: "Pushed via the Aura Sync iOS Shortcut. Same shape as Google Calendar.",
  },
  google_contacts: {
    id: "google_contacts",
    displayName: "Google Contacts",
    transport: "composio",
    composioApp: "googlecontacts",
    defaultScopes: ["https://www.googleapis.com/auth/contacts.readonly"],
    description: "Address book → relationship graph cold start.",
  },
  apple_contacts: {
    id: "apple_contacts",
    displayName: "Apple Contacts",
    transport: "shortcut",
    description: "Pushed via the Aura Sync iOS Shortcut.",
  },
  gmail: {
    id: "gmail",
    displayName: "Gmail",
    transport: "composio",
    composioApp: "gmail",
    defaultScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    bodyOptIn: true,
    description: "Email metadata for the triage agent. Bodies are opt-in.",
  },
  icloud_mail: {
    id: "icloud_mail",
    displayName: "iCloud Mail",
    transport: "shortcut",
    bodyOptIn: true,
    description: "Pushed via the Aura Sync iOS Shortcut (uses Mail app).",
  },
  spotify: {
    id: "spotify",
    displayName: "Spotify",
    transport: "composio",
    composioApp: "spotify",
    defaultScopes: ["user-read-recently-played", "user-top-read"],
    description: "Listening taste + mood signal.",
  },
  apple_health: {
    id: "apple_health",
    displayName: "Apple Health",
    transport: "shortcut",
    description: "Workouts, sleep, steps — daily aggregates via iOS Shortcut.",
  },
  apple_photos: {
    id: "apple_photos",
    displayName: "Apple Photos",
    transport: "shortcut",
    description: "Face-cluster metadata + location stamps. Never raw images.",
  },
  apple_notes: {
    id: "apple_notes",
    displayName: "Apple Notes",
    transport: "shortcut",
    description: "Notes tagged #aura — journal-style memory enrichment.",
  },
  apple_phone_log: {
    id: "apple_phone_log",
    displayName: "Apple Phone Log",
    transport: "shortcut",
    description: "Call metadata (who, when, length) for the call-surface agent.",
  },
  apple_screen_time: {
    id: "apple_screen_time",
    displayName: "Screen Time",
    transport: "shortcut",
    description: "App-session signals for escalation nudges (e.g. Instagram timer).",
  },
  plaid: {
    id: "plaid",
    displayName: "Plaid (banking)",
    transport: "composio",
    composioApp: "plaid",
    defaultScopes: ["transactions:read"],
    description: "Spending pulse, subscription audit, friend-owes-you tracker.",
  },
};

export const ALLOWED_APP_IDS = Object.keys(APPS) as AppId[];
export function isAppId(x: string): x is AppId {
  return (ALLOWED_APP_IDS as string[]).includes(x);
}
