import type { EventRosterPlayer } from "../types/event";
import { EVENT_ROSTER_DATA } from "./eventRosterData";

export async function fetchEventRoster(): Promise<EventRosterPlayer[]> {
  return EVENT_ROSTER_DATA;
}
