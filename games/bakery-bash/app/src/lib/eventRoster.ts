import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { EventRosterPlayer } from "../types/event";

interface GetEventRosterResponse {
  players: EventRosterPlayer[];
}

/**
 * Fetches the static event-board participant roster from the
 * `getEventRoster` Cloud Function. Previously this read a bundled
 * `EVENT_ROSTER_DATA` constant — that shipped 90+ real names in the
 * public JS bundle. Server-side delivery requires the caller to be
 * signed in (auto-anonymous-auth still satisfies this) so each fetch
 * is at least logged through Firebase Auth instead of a silent static
 * read of the JS file.
 *
 * Requires the `getEventRoster` callable to be deployed (firebase
 * deploy). Returns an empty list while the deployment is pending so
 * the EventBoard surfaces gracefully degrade to an empty roster
 * rather than throwing.
 */
export async function fetchEventRoster(): Promise<EventRosterPlayer[]> {
  try {
    const callable = httpsCallable<unknown, GetEventRosterResponse>(
      functions,
      "getEventRoster",
    );
    const result = await callable({});
    const players = result.data?.players;
    return Array.isArray(players) ? players : [];
  } catch (err) {
    console.error("fetchEventRoster failed:", err);
    return [];
  }
}
