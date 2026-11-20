export type ScheduledDiscoveryState = { online: string[]; recent: string[] };

export function selectScheduledDiscovery(
  eligible: ReadonlySet<string>, visible: ReadonlySet<string>, previous: ScheduledDiscoveryState,
): ScheduledDiscoveryState {
  const online = [...new Set([...previous.online.filter(id => eligible.has(id)), ...eligible])].slice(0, 20);
  const admitted = new Set(online);
  const recent = [...new Set([...previous.online.filter(id => !admitted.has(id)), ...previous.recent])]
    .filter(id => visible.has(id) && !admitted.has(id)).slice(0, 30);
  return { online, recent };
}
