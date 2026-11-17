"use client";

import type { DealDetail, DealListItem } from "@agency/contracts";
import { Table } from "@agency/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

export const dealTypeLabel: Record<DealListItem["type"], string> = {
  sale: "Sale",
  rental: "Rental",
};

/** Each row opens the deal card; the number cell is the keyboard-accessible link. */
export function DealsTable({ items }: { items: DealListItem[] }) {
  const router = useRouter();
  return (
    <Table aria-label="Available deals">
      <thead>
        <tr>
          <th scope="col">Number</th>
          <th scope="col">Deal type</th>
          <th scope="col">Client</th>
          <th scope="col">Property address</th>
          <th scope="col">Team</th>
        </tr>
      </thead>
      <tbody>
        {items.map((deal) => (
          <tr
            key={deal.id}
            className="row-link"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) return;
              router.push(`/deals/${deal.id}`);
            }}
          >
            <td>
              <Link href={`/deals/${deal.id}`}>{deal.number}</Link>
            </td>
            <td>{dealTypeLabel[deal.type]}</td>
            <td>{deal.client_name}</td>
            <td className="wrap-anywhere">{deal.property_address}</td>
            <td>{deal.team_name}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Read-only deal summary for the card header. */
export function DealSummary({ deal }: { deal: DealDetail }) {
  return (
    <dl className="summary">
      <div>
        <dt>Deal type</dt>
        <dd>{dealTypeLabel[deal.type]}</dd>
      </div>
      <div>
        <dt>Client</dt>
        <dd>{deal.client.name}</dd>
      </div>
      <div>
        <dt>Property address</dt>
        <dd className="wrap-anywhere">{deal.property.address}</dd>
      </div>
      <div>
        <dt>Team</dt>
        <dd>{deal.team.name}</dd>
      </div>
    </dl>
  );
}
