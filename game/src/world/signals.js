// Two-phase traffic signal timing shared by traffic, props and red-light checks.
// Group 0 and group 1 alternate; one second of all-red between them.
export const CYCLE = 34;
const GREEN = 13;
const YELLOW = 3;

// 'green' | 'yellow' | 'red' for vehicles arriving at node along edgeId.
export function signalPhase(node, edgeId, time) {
  const sig = node.signal;
  if (!sig) return 'green';
  const k = sig.edges.indexOf(edgeId);
  if (k < 0) return 'green';
  const t = (((time + sig.offset) % CYCLE) + CYCLE) % CYCLE;
  const local = sig.groups[k] === 0 ? t : (t + CYCLE / 2) % CYCLE;
  if (local < GREEN) return 'green';
  if (local < GREEN + YELLOW) return 'yellow';
  return 'red';
}

// Seconds until the approach turns green (0 when already green).
export function secondsToGreen(node, edgeId, time) {
  const sig = node.signal;
  if (!sig) return 0;
  const k = sig.edges.indexOf(edgeId);
  if (k < 0) return 0;
  const t = (((time + sig.offset) % CYCLE) + CYCLE) % CYCLE;
  const local = sig.groups[k] === 0 ? t : (t + CYCLE / 2) % CYCLE;
  return local < GREEN ? 0 : CYCLE - local;
}
