/** @type {import("jest").Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  watchman: false,
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  collectCoverage: true,
  collectCoverageFrom: [
    "<rootDir>/backend/src/services/modeService.ts",
    "<rootDir>/backend/src/services/authService.ts",
    "<rootDir>/backend/src/realtime/websocketGateway.ts",
    "<rootDir>/backend/src/services/presenceService.ts",
    "<rootDir>/backend/src/services/matchingService.ts",
    "<rootDir>/backend/src/services/chatService.ts",
    "<rootDir>/backend/src/services/blockService.ts",
    "<rootDir>/backend/src/services/reportService.ts",
    "<rootDir>/backend/src/services/datingFeedService.ts"
  ],
  coverageThreshold: {
    "./backend/src/services/modeService.ts": {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    "./backend/src/services/authService.ts": {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    "./backend/src/realtime/websocketGateway.ts": {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    "./backend/src/services/presenceService.ts": {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    "./backend/src/services/matchingService.ts": {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    "./backend/src/services/chatService.ts": {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    "./backend/src/services/blockService.ts": {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    "./backend/src/services/reportService.ts": {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    "./backend/src/services/datingFeedService.ts": {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
