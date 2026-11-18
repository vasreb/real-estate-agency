"use client";

import { Alert, Select } from "@agency/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage, queryKeys, useApiClient } from "@/shared/api";
import { AssistantThread } from "./thread";

/**
 * Chat with a team selector. The assistant always searches every deal of the
 * selected team; the same component serves the side widget and the /chat
 * page. Changing the team starts a new conversation.
 */
export function AssistantChat() {
  const api = useApiClient();
  const teams = useQuery({
    queryKey: queryKeys.teams(),
    queryFn: ({ signal }) => api.listTeams(signal),
  });
  const [teamChoice, setTeamChoice] = useState<string | null>(null);

  if (teams.isError) return <Alert>{errorMessage(teams.error)}</Alert>;
  if (!teams.data)
    return (
      <p className="muted" role="status">
        Loading…
      </p>
    );
  if (teams.data.items.length === 0)
    return <p className="empty">You are not a member of any team.</p>;

  const teamId = teamChoice ?? teams.data.items[0]!.id;

  return (
    <div className="chat">
      <div className="chat-scope">
        <div className="field">
          <label htmlFor="chat-team">Team</label>
          <Select
            id="chat-team"
            value={teamId}
            onChange={(event) => setTeamChoice(event.target.value)}
          >
            {teams.data.items.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <AssistantThread key={teamId} scope={{ teamId }} />
    </div>
  );
}
