// Small deterministic guard complementing FSD and backend module boundaries.
// Reads only import specifiers; no filesystem or package imports required.
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const norm = (s) => s.replaceAll("\\", "/");
function segments(filename) {
  return norm(path.relative(root, filename)).split("/");
}
function resolveTarget(from, spec) {
  spec = spec.replace(/\.(?:js|mjs|ts|tsx)$/, "");
  if (spec.startsWith("."))
    return norm(
      path.relative(root, path.resolve(path.dirname(from), spec)),
    ).split("/");
  if (spec.startsWith("@/"))
    return ["apps", "web", "src", ...spec.slice(2).split("/")];
  if (spec.startsWith("@modules/"))
    return ["apps", "api", "src", "modules", ...spec.slice(9).split("/")];
  if (spec.startsWith("@api/"))
    return ["apps", "api", "src", ...spec.slice(5).split("/")];
  return null;
}
function check(from, spec) {
  const source = segments(from),
    target = resolveTarget(from, spec);
  if (
    source.slice(0, 4).join("/") === "apps/api/src/modules" &&
    source.includes("domain") &&
    /^(?:@nestjs\/|@prisma\/|express(?:\/|$)|fastify(?:\/|$)|@fastify\/)/.test(
      spec,
    )
  )
    return "Domain cannot import Prisma or HTTP infrastructure.";
  if (!target) return null;
  if (
    source.slice(0, 4).join("/") === "apps/api/src/modules" &&
    target.slice(0, 4).join("/") === "apps/api/src/modules"
  ) {
    const a = source[4],
      b = target[4];
    if (
      a !== b &&
      !(target.length === 5 || (target.length === 6 && target[5] === "index"))
    )
      return "Cross-module backend import must use the other module public index.ts, not its internals.";
  }
  if (
    source.slice(0, 4).join("/") === "apps/api/src/modules" &&
    source.includes("domain") &&
    (target.includes("infrastructure") || target.includes("generated"))
  )
    return "Domain cannot import infrastructure.";
  if (
    source[0] === "apps" &&
    source[1] === "web" &&
    target[0] === "apps" &&
    target[1] === "api"
  )
    return "Frontend may not import API implementation.";
  if (
    source[0] === "apps" &&
    source[1] === "api" &&
    target[0] === "apps" &&
    target[1] === "web"
  )
    return "Backend may not import frontend implementation.";
  return null;
}
export default {
  rules: {
    ownership: {
      meta: {
        type: "problem",
        docs: {
          description: "Monorepo backend module and app import boundaries",
        },
        schema: [],
        messages: { violation: "{{details}}" },
      },
      create(context) {
        const visit = (node) => {
          const spec = node.source?.value;
          if (typeof spec !== "string") return;
          const details = check(context.filename, spec);
          if (details)
            context.report({ node, messageId: "violation", data: { details } });
        };
        return {
          ImportDeclaration: visit,
          ImportExpression: visit,
          ExportNamedDeclaration: visit,
          ExportAllDeclaration: visit,
        };
      },
    },
  },
};
