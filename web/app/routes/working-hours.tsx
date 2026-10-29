import { ComingSoon } from "@/components/coming-soon";

export function meta() {
  return [{ title: "Working hours · OpsPilot" }];
}

export default function WorkingHoursRoute() {
  return (
    <ComingSoon
      title="Working hours"
      description="Opening hours and the business timezone will be configured here. Booking availability is not yet limited by these hours."
    />
  );
}
