export const cohorts = [
  { key: "completed-sale", count: 24, files: 528, mean: 22 },
  { key: "progressing-sale", count: 10, files: 160, mean: 16 },
  { key: "marketed-sale", count: 8, files: 64, mean: 8 },
  { key: "withdrawn-sale", count: 6, files: 72, mean: 12 },
  { key: "ended-rental", count: 30, files: 900, mean: 30 },
  { key: "active-legacy-rental", count: 18, files: 414, mean: 23 },
  { key: "active-new-rental", count: 10, files: 160, mean: 16 },
  { key: "pre-let", count: 8, files: 72, mean: 9 },
  { key: "withdrawn-rental", count: 6, files: 30, mean: 5 },
] as const;
export type CohortKey = (typeof cohorts)[number]["key"];
export function cohortForIndex(index: number): CohortKey {
  if (index < 30) return "ended-rental";
  if (index < 48) return "active-legacy-rental";
  if (index < 54 || (index >= 96 && index < 100)) return "active-new-rental";
  if (index < 78) return "completed-sale";
  if (index < 88) return "progressing-sale";
  if (index < 96) return "marketed-sale";
  if (index < 108) return "pre-let";
  if (index < 114) return "withdrawn-rental";
  return "withdrawn-sale";
}
export function offsets(key: CohortKey): number[] {
  const cohort = cohorts.find((c) => c.key === key)!;
  const pattern =
    key === "withdrawn-rental"
      ? [-2, -1, 0, 0, 1, 2]
      : cohort.count % 6 === 0
        ? [-3, -2, -1, 1, 2, 3]
        : cohort.count === 10
          ? [-2, -1, 0, 1, 2]
          : [-2, -1, 1, 2];
  return Array.from(
    { length: cohort.count },
    (_, i) => pattern[i % pattern.length]!,
  );
}
