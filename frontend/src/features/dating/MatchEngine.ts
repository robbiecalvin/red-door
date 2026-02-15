import type { RecordSwipeResponse, ServiceError, SwipeDirection } from "./dating.types";

export type MatchingApiClient = Readonly<{
  recordSwipe(toUserId: string, direction: SwipeDirection): Promise<RecordSwipeResponse>;
}>;

export type MatchEngine = Readonly<{
  swipe(toUserId: string, direction: SwipeDirection): Promise<RecordSwipeResponse>;
}>;

export function createMatchEngine(client: MatchingApiClient): MatchEngine {
  return {
    async swipe(toUserId: string, direction: SwipeDirection): Promise<RecordSwipeResponse> {
      // Frontend is not authoritative. All validations must be server-side.
      // We still do minimal local validation to avoid sending obviously malformed requests.
      if (typeof toUserId !== "string" || toUserId.trim() === "") {
        const error: ServiceError = { code: "UNAUTHORIZED_ACTION", message: "Invalid swipe target." };
        throw error;
      }
      if (direction !== "like" && direction !== "pass") {
        const error: ServiceError = { code: "UNAUTHORIZED_ACTION", message: "Invalid swipe direction." };
        throw error;
      }
      return client.recordSwipe(toUserId.trim(), direction);
    }
  };
}
