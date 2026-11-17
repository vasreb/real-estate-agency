import { dateSchema } from "@agency/contracts";

function pence(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Money must be non-negative integer GBP pence.");
}
export function depositCap(monthly: number): number {
  pence(monthly);
  if (!monthly || monthly * 12 >= 10_000_000)
    throw new Error("Rent outside archive regime.");
  return Math.floor((monthly * 12 * (monthly * 12 < 5_000_000 ? 5 : 6)) / 52);
}
export function holdingCap(monthly: number): number {
  depositCap(monthly);
  return Math.floor((monthly * 12) / 52);
}
function daysBetween(start: string, end: string): number {
  dateSchema.parse(start);
  dateSchema.parse(end);
  return (Date.parse(end) - Date.parse(start)) / 86_400_000;
}
export function assertDepositHistory(value: {
  monthly_pence: number;
  deposit_pence: number;
  holding_pence: number;
  holding_refund_pence: number;
  holding_credit_pence: number;
  receipt: string;
  protected: string;
  information: string;
}): void {
  for (const amount of [
    value.deposit_pence,
    value.holding_pence,
    value.holding_refund_pence,
    value.holding_credit_pence,
  ])
    pence(amount);
  if (
    value.deposit_pence > depositCap(value.monthly_pence) ||
    value.holding_pence > holdingCap(value.monthly_pence)
  )
    throw new Error("Deposit cap exceeded.");
  if (
    value.holding_refund_pence + value.holding_credit_pence !==
    value.holding_pence
  )
    throw new Error("Holding refund/credit ledger does not balance.");
  for (const event of [value.protected, value.information]) {
    const elapsed = daysBetween(value.receipt, event);
    if (elapsed < 0 || elapsed > 30)
      throw new Error("Deposit protection/information outside receipt window.");
  }
}
export function invoice(basisPence: number, feeBps: number, vatBps: number) {
  [basisPence, feeBps, vatBps].forEach(pence);
  if (
    feeBps > 10_000 ||
    vatBps > 10_000 ||
    !Number.isSafeInteger(basisPence * feeBps)
  )
    throw new Error("Invalid invoice rate or arithmetic overflow.");
  const net_pence = Math.round((basisPence * feeBps) / 10_000);
  const vat_pence = Math.round((net_pence * vatBps) / 10_000);
  return { net_pence, vat_pence, total_pence: net_pence + vat_pence };
}
export function apportionLoss(value: {
  replacement_pence: number;
  age_months: number;
  useful_life_months: number;
  responsibility_bps: number;
  baseline_present: boolean;
}): number {
  [
    value.replacement_pence,
    value.age_months,
    value.useful_life_months,
    value.responsibility_bps,
  ].forEach(pence);
  if (
    !value.baseline_present ||
    !value.useful_life_months ||
    value.responsibility_bps > 10_000
  )
    throw new Error(
      "Deduction requires baseline, useful life and proportionate responsibility.",
    );
  return Math.floor(
    (((value.replacement_pence *
      Math.max(0, value.useful_life_months - value.age_months)) /
      value.useful_life_months) *
      value.responsibility_bps) /
      10_000,
  );
}
function addMonths(date: string, months: number): string {
  dateSchema.parse(date);
  const parsed = new Date(`${date}T00:00:00Z`);
  const day = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0),
  ).getUTCDate();
  parsed.setUTCDate(Math.min(day, last));
  return parsed.toISOString().slice(0, 10);
}
export function assertRentIncrease(value: {
  served: string;
  effective: string;
  previous_increase: string;
  process: string;
}): void {
  dateSchema.parse(value.effective);
  dateSchema.parse(value.previous_increase);
  if (
    value.effective < "2026-05-01" ||
    value.process !== "section13-form4a" ||
    value.effective < addMonths(value.served, 2) ||
    value.effective < addMonths(value.previous_increase, 12)
  )
    throw new Error(
      "Current rent increase needs section 13/Form 4A, two months notice and annual interval.",
    );
}
