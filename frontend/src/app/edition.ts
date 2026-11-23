declare const __DUALMODE_GOOGLE_PLAY__: boolean;

export const googlePlayEdition = typeof __DUALMODE_GOOGLE_PLAY__ !== "undefined" && __DUALMODE_GOOGLE_PLAY__;
