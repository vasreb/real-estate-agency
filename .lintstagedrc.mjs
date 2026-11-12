// Fast feedback only; CI runs the full `pnpm verify`.
export default {
  "*.{ts,tsx,mjs,cjs,js}": [
    "prettier --write",
    "eslint --max-warnings 0 --no-warn-ignored",
  ],
  "*.{json,md,css,yaml,yml}": ["prettier --write"],
};
