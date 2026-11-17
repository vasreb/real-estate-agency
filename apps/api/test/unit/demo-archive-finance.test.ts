import {
  depositCap,
  holdingCap,
  assertDepositHistory,
  apportionLoss,
  invoice,
  assertRentIncrease,
} from "../../prisma/demo-archive/scenarios/money.js";
import {
  applyAmendments,
  clauseRegistry,
} from "../../prisma/demo-archive/scenarios/clauses.js";
import {
  makeAmendment,
  amendmentReasons,
  amendmentCount,
  compileAmendmentInstruments,
} from "../../prisma/demo-archive/scenarios/amendments.js";
import { compileCases } from "../../prisma/demo-archive/scenarios/events.js";
import { makeProfiles } from "../../prisma/demo-archive/profiles/agency.js";
import { recordScenario } from "../../prisma/demo-archive/qa/evidence.js";

describe("demo archive finance and operative clauses", () => {
  it("allocates 240 distinct instruments, 238 resolved parents and exact simulated statuses", () => {
    const profiles = makeProfiles();
    const cases = compileCases(profiles);
    const instruments = compileAmendmentInstruments(cases, profiles);
    expect(instruments).toHaveLength(240);
    expect(new Set(instruments.map((a) => a.key)).size).toBe(240);
    expect(instruments.filter((a) => a.contract_key)).toHaveLength(238);
    expect(instruments.filter((a) => a.status === "signed")).toHaveLength(210);
    expect(instruments.filter((a) => a.status === "draft")).toHaveLength(20);
    expect(instruments.filter((a) => a.status === "unknown")).toHaveLength(10);
    expect(new Set(instruments.map((a) => a.clause_key)).size).toBe(12);
    for (const c of cases)
      expect(
        instruments.filter((a) => a.deal_key === c.key).length,
      ).toBeLessThanOrEqual(6);
  });
  it("uses integer pence and floor caps at both annual-rent bands", () => {
    expect(depositCap(200_000)).toBe(230_769);
    expect(depositCap(500_000)).toBe(692_307);
    expect(holdingCap(200_000)).toBe(46_153);
    expect(invoice(61_000_000, 125, 2000)).toEqual({
      net_pence: 762_500,
      vat_pence: 152_500,
      total_pence: 915_000,
    });
    assertDepositHistory({
      monthly_pence: 200_000,
      deposit_pence: 230_769,
      holding_pence: 46_153,
      holding_refund_pence: 30_000,
      holding_credit_pence: 16_153,
      receipt: "2025-04-01",
      protected: "2025-04-30",
      information: "2025-05-01",
    });
    expect(
      apportionLoss({
        replacement_pence: 60_000,
        age_months: 48,
        useful_life_months: 60,
        responsibility_bps: 5000,
        baseline_present: true,
      }),
    ).toBe(6000);
    recordScenario(5, "happy", {
      five_week_cap_pence: 230769,
      six_week_cap_pence: 692307,
      apportioned_loss_pence: 6000,
    });
  });

  it("applies only signed resolved changes in effective-date order and preserves proposed state", () => {
    const first = makeAmendment({
      key: "amendment/one",
      contract_key: "contract/one",
      deal_key: "deal/one",
      reason_index: 0,
      date: "2025-03-01",
      status: "signed",
      old_term: "125",
      new_term: "100",
    });
    const draft = {
      ...first,
      key: "amendment/two",
      status: "draft" as const,
      old_term: "100",
      new_term: "90",
      effective_from: "2025-04-01",
    };
    const unknown = {
      ...draft,
      key: "amendment/three",
      status: "unknown" as const,
    };
    const unresolved = {
      ...first,
      key: "amendment/four",
      contract_key: null,
      unresolved_reason:
        "Historical original identifies DEMO-BASE-004; original not held.",
    };
    const snapshot = applyAmendments(
      {
        key: "contract/one",
        deal_key: "deal/one",
        type: "contract",
        clauses: { "agency-fee": "125" },
      },
      [unknown, draft, first, unresolved],
      "2025-05-01",
    );
    expect(snapshot.operative["agency-fee"]).toBe("100");
    expect(snapshot.applied).toEqual(["amendment/one"]);
    expect(snapshot.proposed).toHaveLength(2);
    expect(clauseRegistry.length).toBeGreaterThanOrEqual(12);
    expect(amendmentReasons).toHaveLength(12);
    expect(amendmentCount("ended-rental", 0)).toBe(4);
    expect(amendmentCount("marketed-sale", 0)).toBe(0);
  });

  it("rejects excess caps, late protection, invented holding balance and new-for-old", () => {
    const history = {
      monthly_pence: 200_000,
      deposit_pence: 230_769,
      holding_pence: 46_153,
      holding_refund_pence: 30_000,
      holding_credit_pence: 16_153,
      receipt: "2025-04-01",
      protected: "2025-04-30",
      information: "2025-05-01",
    };
    for (const mutation of [
      { deposit_pence: 230_770 },
      { protected: "2025-05-02" },
      { holding_credit_pence: 16_154 },
      { holding_pence: 46_154 },
    ])
      expect(() => assertDepositHistory({ ...history, ...mutation })).toThrow();
    expect(() =>
      apportionLoss({
        replacement_pence: 60_000,
        age_months: 48,
        useful_life_months: 60,
        responsibility_bps: 10_000,
        baseline_present: false,
      }),
    ).toThrow();
    expect(() =>
      assertRentIncrease({
        served: "2026-06-01",
        effective: "2026-07-31",
        previous_increase: "2025-01-01",
        process: "section13-form4a",
      }),
    ).toThrow();
    expect(() =>
      assertRentIncrease({
        served: "2026-06-01",
        effective: "2026-08-01",
        previous_increase: "2025-09-01",
        process: "section13-form4a",
      }),
    ).toThrow();
    expect(() =>
      assertRentIncrease({
        served: "2026-06-01",
        effective: "2026-08-01",
        previous_increase: "2025-01-01",
        process: "addendum",
      }),
    ).toThrow();
    assertRentIncrease({
      served: "2026-06-01",
      effective: "2026-08-01",
      previous_increase: "2025-01-01",
      process: "section13-form4a",
    });
    recordScenario(5, "failure", { rejected_money_mutations: 8 });
  });

  it("rejects wrong parents, stale old terms, rent-addendum substitution and missing novation consent", () => {
    const amendment = makeAmendment({
      key: "amendment/one",
      contract_key: "contract/one",
      deal_key: "deal/one",
      reason_index: 0,
      date: "2025-03-01",
      status: "signed",
      old_term: "125",
      new_term: "100",
    });
    const contract = {
      key: "contract/one",
      deal_key: "deal/one",
      type: "contract" as const,
      clauses: { "agency-fee": "125" },
    };
    expect(() =>
      applyAmendments(
        { ...contract, type: "amendment" },
        [amendment],
        "2025-05-01",
      ),
    ).toThrow();
    for (const mutation of [
      { deal_key: "deal/two" },
      { old_term: "200" },
      { clause_key: "rent", effective_from: "2026-06-01" },
      { clause_key: "parties", consent: null },
    ])
      expect(() =>
        applyAmendments(
          contract,
          [{ ...amendment, ...mutation }],
          "2026-07-01",
        ),
      ).toThrow();
    const draft = { ...amendment, status: "draft" as const };
    expect(
      applyAmendments(contract, [draft], "2025-05-01").operative["agency-fee"],
    ).toBe("125");
  });
});
