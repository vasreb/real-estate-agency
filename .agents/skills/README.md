# Optional Agent Skills

Skills are reusable task-specific procedures and domain guidance. They are
optional; begin with repository instructions and add a skill only when it
improves a recurring workflow.

## Installation policy

- Check the target agent runtime's current skill discovery and installation
  conventions before choosing a location.
- Prefer installing a skill from its maintained, trusted source rather than
  copying an unknown fork.
- Review its scope, instructions, dependencies, attribution, and license before
  enabling it.
- Pin or record the source revision/version and owner for reproducibility.
- Keep project-specific rules in `AGENTS.md`; keep reusable procedures in
  skills. If they conflict, explicit user/project requirements take precedence.
- Load only skills relevant to the current task.

## Optional skill categories

- Architecture/design review
- Frontend architecture and framework practices
- Backend framework architecture
- Language/type-system conventions
- Testing and visual QA

The required stack is supported by `architecture-and-design`,
`feature-sliced-design`, and `core-typescript`. Enable suitable reviewed skills
for relevant tasks through the chosen agent runtime. Consult Fastify's official
documentation for backend framework guidance.

Create a small inventory here after selecting skills:

| Skill | Source/version | Purpose | License reviewed |
| ----- | -------------- | ------- | ---------------- |
| TODO  | TODO           | TODO    | TODO             |
