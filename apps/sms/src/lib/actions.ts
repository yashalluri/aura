import type { ParsedAction } from "./types.js";
import type { ApiContact, ApiRoutine } from "./apiClient.js";
import { fuzzyMatch } from "./fuzzyMatch.js";
import * as api from "./apiClient.js";

export { fuzzyMatch };

/**
 * Execute a parsed action from the LLM response against the API.
 * Returns a user-facing confirmation string (or null if no action).
 */
export async function executeAction(
  action: ParsedAction,
  userId: string,
  contacts: ApiContact[],
  routines: ApiRoutine[],
): Promise<string | null> {
  switch (action.action) {
    case "add_contact": {
      await api.createContact(userId, {
        name: action.name,
        targetFrequencyDays: action.targetFrequencyDays,
      });
      return null; // LLM already wrote the confirmation text
    }

    case "add_routine": {
      await api.createRoutine(userId, {
        name: action.name,
        frequencyType: action.frequencyType,
        frequencyValue: action.frequencyValue,
      });
      return null;
    }

    case "routine_done": {
      const match = fuzzyMatch(action.routineName, routines.map((r) => ({ id: r.id, name: r.name })));
      if (!match) return `Hmm, I couldn't find a routine called "${action.routineName}". Check your list?`;
      await api.recordRoutineDone(match.id);
      return null;
    }

    case "contact_checkin": {
      const match = fuzzyMatch(action.contactName, contacts.map((c) => ({ id: c.id, name: c.name })));
      if (!match) return `I couldn't find a contact called "${action.contactName}". Want to add them?`;
      await api.recordContactCheckin(match.id);
      return null;
    }

    case "daily_checkin": {
      const { suggestion } = await api.getDailyCheckin(userId);
      const { formatDailyCheckin } = await import("../llm/aura.js");
      const user = await api.getUser(userId);
      return formatDailyCheckin(suggestion, user);
    }

    case "set_tone": {
      await api.updateUser(userId, { toneMode: action.tone });
      return null;
    }

    case "set_name": {
      await api.updateUser(userId, { name: action.name });
      return null;
    }

    case "set_timezone": {
      await api.updateUser(userId, { timezone: action.timezone });
      return null;
    }

    default:
      return null;
  }
}
