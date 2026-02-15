export type Mode = "cruise" | "date" | "hybrid";

export type CruisePresenceKey = string;

export type CruisePresenceUpdate = Readonly<{
  key: CruisePresenceKey;
  userType: "guest" | "registered" | "subscriber";
  lat: number;
  lng: number;
  status?: string;
  updatedAtMs: number;
}>;

export type CruisePresenceState = Readonly<{
  byKey: ReadonlyMap<CruisePresenceKey, CruisePresenceUpdate>;
}>;
