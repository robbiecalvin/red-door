import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.reddoor.app",
  appName: "Red Door",
  webDir: "dist",
  server: {
    androidScheme: "https"
  }
};

export default config;
