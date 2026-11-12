import assert from "node:assert/strict";
import { test } from "node:test";
import {
  forwardedFor,
  parseTrustedProxies,
} from "../../apps/web/forwarding.mjs";

const none = parseTrustedProxies("");
const edge = parseTrustedProxies("172.30.0.1, fd00::/64");

test("without trusted edge proxies the peer address replaces client-supplied values", () => {
  assert.equal(forwardedFor(undefined, "198.51.100.7", none), "198.51.100.7");
  assert.equal(
    forwardedFor("203.0.113.66", "198.51.100.7", none),
    "198.51.100.7",
  );
  assert.equal(
    forwardedFor(["203.0.113.1", "203.0.113.2"], "::ffff:198.51.100.7", none),
    "198.51.100.7",
  );
});

test("an untrusted peer cannot extend the chain even when an edge is configured", () => {
  assert.equal(
    forwardedFor("203.0.113.66", "198.51.100.7", edge),
    "198.51.100.7",
  );
});

test("a trusted edge keeps its chain and is appended as the last hop", () => {
  assert.equal(
    forwardedFor("203.0.113.66, 198.51.100.7", "172.30.0.1", edge),
    "203.0.113.66, 198.51.100.7, 172.30.0.1",
  );
  assert.equal(forwardedFor(undefined, "172.30.0.1", edge), "172.30.0.1");
  assert.equal(
    forwardedFor("198.51.100.7", "fd00::5", edge),
    "198.51.100.7, fd00::5",
  );
});

test("catch-all or invalid trust settings are refused", () => {
  for (const value of ["0.0.0.0/0", "::/0", "10.0.0.0/7", "*", "true", "x"])
    assert.throws(() => parseTrustedProxies(value), /WEB_TRUSTED_PROXIES/);
});

test("a missing peer address yields no header", () => {
  assert.equal(forwardedFor("203.0.113.66", undefined, none), undefined);
});
