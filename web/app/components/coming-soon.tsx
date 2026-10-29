import { IconHourglass } from "@tabler/icons-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={IconHourglass}
        title="Coming soon"
        description={description}
      />
    </>
  );
}
