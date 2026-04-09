import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..", "..", "..");

describe("Project Structure", () => {
  it("has required app directory files", () => {
    expect(existsSync(resolve(ROOT, "app/layout.tsx"))).toBe(true);
    expect(existsSync(resolve(ROOT, "app/page.tsx"))).toBe(true);
    expect(existsSync(resolve(ROOT, "app/globals.css"))).toBe(true);
  });

  it("has required config files", () => {
    expect(existsSync(resolve(ROOT, "next.config.js"))).toBe(true);
    expect(existsSync(resolve(ROOT, "tsconfig.json"))).toBe(true);
    expect(existsSync(resolve(ROOT, "package.json"))).toBe(true);
  });

  it("has component and hook directories", () => {
    expect(existsSync(resolve(ROOT, "components"))).toBe(true);
    expect(existsSync(resolve(ROOT, "hooks"))).toBe(true);
  });

  it("has lib and types directories", () => {
    expect(existsSync(resolve(ROOT, "lib/config.ts"))).toBe(true);
    expect(existsSync(resolve(ROOT, "types/config.ts"))).toBe(true);
  });
});

describe("AppConfig", () => {
  it("getAppConfig returns valid configuration object", async () => {
    const { getAppConfig } = await import("../../../lib/config");
    const config = getAppConfig();

    expect(config.apiBaseUrl).toBeDefined();
    expect(typeof config.apiBaseUrl).toBe("string");
    expect(["development", "production", "test"]).toContain(
      config.environment
    );
    expect(typeof config.version).toBe("string");
  });
});
