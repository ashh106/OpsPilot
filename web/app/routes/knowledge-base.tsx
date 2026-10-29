import { ComingSoon } from "@/components/coming-soon";

export function meta() {
  return [{ title: "Knowledge base · OpsPilot" }];
}

export default function KnowledgeBaseRoute() {
  return (
    <ComingSoon
      title="Knowledge base"
      description="Upload business documents for the assistant to use. Document upload and ingestion are not connected yet."
    />
  );
}
