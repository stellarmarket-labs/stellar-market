import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",

  // ✅ Only look inside src
  roots: ["<rootDir>/src"],

  // ✅ Match your tests
  testMatch: ["**/__tests__/**/*.test.ts"],

  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // ✅ Your setup file (with Redis + Prisma fixes)
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],

  clearMocks: true,

  // ✅ Prevent hanging CI (important)
  detectOpenHandles: true,

  transform: {
    "^.+\\.[tj]sx?$": [
      "ts-jest",
      {
        diagnostics: false,
        allowJs: true,
        isolatedModules: true, // ✅ speeds up + stabilizes CI
      },
    ],
  },

  transformIgnorePatterns: [
    "/node_modules/(?!(@scure|@otplib|otplib)/)",
  ],
};

export default config;
