# Example Project Tree

This is the required application/package skeleton for projects using this
template. Keep the technology choices; adapt module names and product details.

```text
repository/
├── AGENTS.md
├── apps/
│   ├── web/
│   │   ├── AGENTS.md
│   │   ├── tsconfig.json
│   │   ├── app/                      # framework route entries
│   │   └── src/
│   │       ├── _app/                 # providers and app initialization
│   │       ├── _pages/               # route-level screen implementations
│   │       ├── widgets/              # optional composed UI blocks
│   │       ├── features/             # reusable user actions
│   │       ├── entities/             # shared domain representations
│   │       └── shared/               # UI, API adapters, utilities
│   └── api/
│       ├── AGENTS.md
│       ├── tsconfig.json
│       └── src/
│           ├── app.ts                # composition root (createApp)
│           ├── server.ts             # process lifecycle, Prisma client
│           ├── modules/              # auth, deals, documents
│           │   └── <capability>/
│           │       ├── index.ts      # deliberate public API
│           │       ├── presentation/
│           │       ├── application/
│           │       ├── domain/
│           │       ├── infrastructure/
│           │       └── tests/
│           └── infrastructure/       # cross-cutting technical adapters
├── packages/
│   ├── contracts/                    # approved API/schema contracts
│   ├── ui/                           # shared UI primitives
│   └── config/                       # shared strict TypeScript config
│       └── tsconfig.json
├── docs/
│   ├── architecture/
│   │   ├── decisions/
│   │   └── references/
│   └── templates/
├── tooling/
│   └── architecture-tests/
├── .agents/
│   └── skills/
├── .dependency-cruiser.cjs
└── package.json                      # package-manager scripts, if applicable
```

## Profile notes

- The frontend tree is the required Next.js/FSD layout.
- Backend modules are organized by capability. Remove layers that do not provide
  meaningful ownership, policy isolation, or testability.
- The FSD `widgets` layer is optional. The shared `packages/ui` package is
  included in the baseline; all other listed technologies are implemented.
- Keep generated code in a clearly marked location and out of manual-edit paths.
