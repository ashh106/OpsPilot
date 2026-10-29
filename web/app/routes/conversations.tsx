import { ComingSoon } from "@/components/coming-soon";

export function meta() {
  return [{ title: "AI conversations · OpsPilot" }];
}

export default function ConversationsRoute() {
  return (
    <ComingSoon
      title="AI conversations"
      description="Customer message threads and AI replies will appear here. Until then, the assistant panel can check and change your schedule."
    />
  );
}
