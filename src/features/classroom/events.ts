import type { ClassroomEvent } from "./types";

export function shouldNotify(event: ClassroomEvent): boolean {
  return ["early_exit", "unauthorized_entry", "alert_created"].includes(
    event.kind,
  );
}
export function shouldSound(event: ClassroomEvent): boolean {
  // Explicit EARLY_EXIT override: these alerts must always be silent.
  return (
    shouldNotify(event) &&
    event.kind !== "early_exit" &&
    event.alertType?.toUpperCase() !== "EARLY_EXIT" &&
    event.soundRequired === true
  );
}
export function notificationKey(event: ClassroomEvent): string {
  return event.alertId
    ? `alert:${event.alertId}:${event.alertType || ""}:${event.revision === "escalated" ? "escalated" : "initial"}`
    : `${event.kind}:${event.id}`;
}

/** Bounded replay protection; event kinds keep resolve separate from create. */
export class EventMemory {
  private seen = new Set<string>();
  accept(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (this.seen.size > 500)
      this.seen.delete(this.seen.values().next().value!);
    return true;
  }
}
