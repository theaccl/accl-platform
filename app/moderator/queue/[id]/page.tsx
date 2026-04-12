import { ModeratorQueueDetail } from '@/components/moderator/ModeratorQueueDetail';

type PageProps = { params: Promise<{ id: string }> };

export default async function ModeratorQueueDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ModeratorQueueDetail queueId={id} />;
}
