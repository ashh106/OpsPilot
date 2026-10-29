import { ComingSoon } from "@/components/coming-soon";

export function meta() {
  return [{ title: "Settings · OpsPilot" }];
}

export default function SettingsRoute() {
  return (
    <ComingSoon
      title="Settings"
      description="Business profile, account, and integration settings will be managed here. Not available yet."
    />
  );
}
