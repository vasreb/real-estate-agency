/**
 * Deterministic reference data. Fixed UUIDs make the development seed
 * idempotent (upsert by id) and give tests stable identifiers.
 */
export const ids = {
  teamNorth: "10000000-0000-4000-8000-000000000001",
  teamSouth: "10000000-0000-4000-8000-000000000002",
  userAdmin: "20000000-0000-4000-8000-000000000001",
  userMember: "20000000-0000-4000-8000-000000000002",
  userOther: "20000000-0000-4000-8000-000000000003",
  userMulti: "20000000-0000-4000-8000-000000000004",
  clientCompany: "30000000-0000-4000-8000-000000000001",
  clientPerson: "30000000-0000-4000-8000-000000000002",
  propertyCentral: "40000000-0000-4000-8000-000000000001",
  propertyRiver: "40000000-0000-4000-8000-000000000002",
  dealNorthSale: "50000000-0000-4000-8000-000000000001",
  dealNorthRental: "50000000-0000-4000-8000-000000000002",
  dealSouthSale: "50000000-0000-4000-8000-000000000003",
  docNorthContract: "60000000-0000-4000-8000-000000000001",
  docNorthAmendment: "60000000-0000-4000-8000-000000000002",
  docSouthContract: "60000000-0000-4000-8000-000000000003",
} as const;

export type SeedAccount = {
  id: string;
  email: string;
  passwordKey: "admin" | "member" | "other" | "multi";
  memberships: { teamId: string; role: "admin" | "member" }[];
};

/** Acceptance accounts: admin + member of the first team, member of the second. */
export const baseAccounts: SeedAccount[] = [
  {
    id: ids.userAdmin,
    email: "Admin@Agency.test",
    passwordKey: "admin",
    memberships: [{ teamId: ids.teamNorth, role: "admin" }],
  },
  {
    id: ids.userMember,
    email: "member@agency.test",
    passwordKey: "member",
    memberships: [{ teamId: ids.teamNorth, role: "member" }],
  },
  {
    id: ids.userOther,
    email: "other@agency.test",
    passwordKey: "other",
    memberships: [{ teamId: ids.teamSouth, role: "member" }],
  },
];

/** Test-only: one user with different roles in two teams. */
export const multiTeamAccount: SeedAccount = {
  id: ids.userMulti,
  email: "multi@agency.test",
  passwordKey: "multi",
  memberships: [
    { teamId: ids.teamNorth, role: "member" },
    { teamId: ids.teamSouth, role: "admin" },
  ],
};

export const teams = [
  { id: ids.teamNorth, name: "Команда «Север»" },
  { id: ids.teamSouth, name: "Команда «Юг»" },
];
export const clients = [
  { id: ids.clientCompany, name: "ООО «Ромашка»" },
  { id: ids.clientPerson, name: "Иванова Анна Сергеевна" },
];
export const properties = [
  { id: ids.propertyCentral, address: "г. Москва, ул. Тверская, д. 1, кв. 10" },
  { id: ids.propertyRiver, address: "г. Казань, ул. Набережная, д. 5" },
];
/** One client and one property have two deals; deal number repeats across teams. */
export const deals = [
  {
    id: ids.dealNorthSale,
    number: "2026-001",
    type: "sale" as const,
    clientId: ids.clientCompany,
    propertyId: ids.propertyCentral,
    teamId: ids.teamNorth,
  },
  {
    id: ids.dealNorthRental,
    number: "2026-002",
    type: "rental" as const,
    clientId: ids.clientCompany,
    propertyId: ids.propertyCentral,
    teamId: ids.teamNorth,
  },
  {
    id: ids.dealSouthSale,
    number: "2026-001",
    type: "sale" as const,
    clientId: ids.clientPerson,
    propertyId: ids.propertyRiver,
    teamId: ids.teamSouth,
  },
];
