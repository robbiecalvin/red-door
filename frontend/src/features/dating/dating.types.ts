export type DistanceBucket = "<500m" | "<1km" | "<5km" | ">5km";

export type DatingProfile = Readonly<{
  id: string;
  displayName: string;
  age?: number;
  race?: string;
  heightInches?: number;
  weightLbs?: number;
  cockSizeInches?: number;
  cutStatus?: "cut" | "uncut";
  distanceBucket?: DistanceBucket;
}>;

export type SwipeDirection = "like" | "pass";

export type ServiceError = Readonly<{
  code: string;
  message: string;
  context?: Record<string, unknown>;
}>;

export type RecordSwipeResponse = Readonly<{
  matchCreated: boolean;
  matchId?: string;
}>;
