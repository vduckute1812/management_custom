import { afterEach, describe, expect, it } from "vitest";
import { resolveRedisUrl } from "../server/utils/redisUrl";

describe("resolveRedisUrl", () => {
  const prev = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in prev)) delete process.env[key];
    }
    Object.assign(process.env, prev);
  });

  it("encodes special characters in REDIS_PASSWORD", () => {
    process.env.REDIS_PASSWORD = "rj68/foo+bar=baz@qux";
    process.env.LAN_IP = "192.168.1.4";
    delete process.env.REDIS_URL;
    expect(resolveRedisUrl()).toBe(
      "redis://:rj68%2Ffoo%2Bbar%3Dbaz%40qux@192.168.1.4:6379/0",
    );
  });

  it("prefers REDIS_PASSWORD over a broken REDIS_URL", () => {
    process.env.REDIS_PASSWORD = "abc/def";
    process.env.LAN_IP = "10.0.0.2";
    process.env.REDIS_URL = "redis://:abc/def@10.0.0.2:6379/0";
    expect(resolveRedisUrl()).toBe("redis://:abc%2Fdef@10.0.0.2:6379/0");
  });

  it("accepts a valid explicit REDIS_URL when no password is set", () => {
    delete process.env.REDIS_PASSWORD;
    process.env.REDIS_URL = "redis://:plain@127.0.0.1:6379/1";
    expect(resolveRedisUrl()).toBe("redis://:plain@127.0.0.1:6379/1");
  });

  it("returns undefined for an invalid REDIS_URL without password", () => {
    delete process.env.REDIS_PASSWORD;
    process.env.REDIS_URL = "redis://:abc/def@127.0.0.1:6379/0";
    expect(resolveRedisUrl()).toBeUndefined();
  });
});
