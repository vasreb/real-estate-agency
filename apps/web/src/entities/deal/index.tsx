"use client";

import type { DealDetail, DealListItem } from "@agency/contracts";
import { Table } from "@agency/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

export const dealTypeLabel: Record<DealListItem["type"], string> = {
  sale: "Продажа",
  rental: "Аренда",
};

/** Each row opens the deal card; the number cell is the keyboard-accessible link. */
export function DealsTable({ items }: { items: DealListItem[] }) {
  const router = useRouter();
  return (
    <Table aria-label="Доступные сделки">
      <thead>
        <tr>
          <th scope="col">Номер</th>
          <th scope="col">Тип сделки</th>
          <th scope="col">Клиент</th>
          <th scope="col">Адрес объекта</th>
          <th scope="col">Команда</th>
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
        <dt>Тип сделки</dt>
        <dd>{dealTypeLabel[deal.type]}</dd>
      </div>
      <div>
        <dt>Клиент</dt>
        <dd>{deal.client.name}</dd>
      </div>
      <div>
        <dt>Адрес объекта</dt>
        <dd className="wrap-anywhere">{deal.property.address}</dd>
      </div>
      <div>
        <dt>Команда</dt>
        <dd>{deal.team.name}</dd>
      </div>
    </dl>
  );
}
