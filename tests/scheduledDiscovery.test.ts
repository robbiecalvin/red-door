import { selectScheduledDiscovery } from "../backend/src/services/scheduledDiscovery";

test("retains up to 20 online profiles and the 30 latest departures", () => {
  const ids = Array.from({ length: 60 }, (_, index) => String(index));
  const visible = new Set(ids);
  const initial = selectScheduledDiscovery(visible, visible, { online: [], recent: [] });
  expect(initial.online).toEqual(ids.slice(0, 20));
  expect(initial.recent).toEqual([]);
  const next = selectScheduledDiscovery(new Set(ids.slice(20)), visible, initial);
  expect(next.online).toEqual(ids.slice(20, 40));
  expect(next.recent).toEqual(ids.slice(0, 20));
  const last = selectScheduledDiscovery(new Set(ids.slice(40)), visible, next);
  expect(last.online).toEqual(ids.slice(40));
  expect(last.recent).toEqual([...ids.slice(20, 40), ...ids.slice(0, 10)]);
  visible.delete("20");
  const filtered = selectScheduledDiscovery(new Set(ids.slice(40)), visible, last);
  expect(filtered.recent).not.toContain("20");
});
