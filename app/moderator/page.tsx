import Link from 'next/link';
import { ModeratorQueueDashboard } from '@/components/moderator/ModeratorQueueDashboard';
import NavigationBar from '@/components/NavigationBar';

export default function ModeratorQueuePage() {
  return (
    <div>
      <NavigationBar />
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <Link href="/moderator/control-center" className="text-sm underline">
          Open Operator Control Center
        </Link>
      </div>
      <ModeratorQueueDashboard />
    </div>
  );
}
