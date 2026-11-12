// Client-address forwarding for the Next.js server in front of the API.
//
// Next's /api rewrites pass incoming headers through verbatim and do not add
// the peer address to X-Forwarded-For, so a client could forge it. The web
// server therefore rewrites the header before Next sees the request:
//  - peer is a configured edge proxy (WEB_TRUSTED_PROXIES): keep the chain the
//    edge built and append the edge address;
//  - any other peer: discard client-supplied values and use the peer address.
// The API then trusts only this server's address (TRUSTED_PROXIES).
import { BlockList, isIP } from "node:net";

/** Parses a comma list of IPs/CIDRs; refuses catch-all or overly broad ranges. */
export function parseTrustedProxies(value = "") {
  const list = new BlockList();
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    const [address, prefix, ...rest] = entry.split("/");
    const family = isIP(address ?? "");
    if (rest.length || !family)
      throw new Error(`WEB_TRUSTED_PROXIES: invalid entry ${entry}`);
    const type = family === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) list.addAddress(address, type);
    else {
      const bits = Number(prefix);
      const min = family === 4 ? 8 : 16;
      const max = family === 4 ? 32 : 128;
      if (!/^\d{1,3}$/.test(prefix) || bits < min || bits > max)
        throw new Error(
          `WEB_TRUSTED_PROXIES: ${entry} must be no broader than /${min}`,
        );
      list.addSubnet(address, bits, type);
    }
  }
  return { size: entries.length, list };
}

function normalize(address) {
  // IPv4-mapped IPv6 sockets (::ffff:127.0.0.1) are reported as IPv4.
  return address?.startsWith("::ffff:") && isIP(address.slice(7)) === 4
    ? address.slice(7)
    : address;
}

function isTrusted(trusted, address) {
  if (!trusted.size || !address) return false;
  const family = isIP(address);
  return (
    family !== 0 && trusted.list.check(address, family === 4 ? "ipv4" : "ipv6")
  );
}

/** Returns the X-Forwarded-For value to send upstream for this peer. */
export function forwardedFor(existing, peerAddress, trusted) {
  const peer = normalize(peerAddress);
  if (!peer) return undefined;
  const incoming = (
    Array.isArray(existing) ? existing.join(",") : (existing ?? "")
  )
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (isTrusted(trusted, peer) && incoming.length)
    return [...incoming, peer].join(", ");
  return peer;
}
