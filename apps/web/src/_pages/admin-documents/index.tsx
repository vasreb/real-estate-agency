"use client";

import type { TeamList } from "@agency/contracts";
import { Select } from "@agency/ui";
import { useState } from "react";
import { TeamDocumentsPanel } from "@/features/team-documents";
import { AppHeader } from "@/widgets/app-header";

/**
 * Rendering: dynamic server gate (`app/admin/documents/page.tsx`) loads the
 * teams uncached; documents are client state owned by TanStack Query.
 */
export function AdminDocumentsPage({ teams }: { teams: TeamList }) {
  const adminTeams = teams.items.filter((team) => team.role === "admin");
  const [choice, setChoice] = useState<string | null>(null);
  const teamId = choice ?? adminTeams[0]?.id;
  return (
    <>
      <AppHeader />
      <main id="main" className="page">
        <h1>Team documents</h1>
        {!teamId ? (
          <p className="empty">
            You are not an administrator of any team, so there is nothing to
            manage here.
          </p>
        ) : (
          <>
            {adminTeams.length > 1 && (
              <div className="field">
                <label htmlFor="admin-team">Team</label>
                <Select
                  id="admin-team"
                  value={teamId}
                  onChange={(event) => setChoice(event.target.value)}
                >
                  {adminTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <TeamDocumentsPanel key={teamId} teamId={teamId} />
          </>
        )}
      </main>
    </>
  );
}
