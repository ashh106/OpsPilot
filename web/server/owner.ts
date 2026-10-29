import { fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";

export function requireOwnerEmail(): string {
  const ownerEmail = getRequestUserEmail();
  if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
  return ownerEmail;
}
