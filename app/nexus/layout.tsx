import NavigationBar from "@/components/NavigationBar";

/**
 * Single column wrapper (same pattern as login/modes shells).
 * A bare Fragment made NavigationBar + page two separate flex children of <body>,
 * which broke layout vs routes that wrap nav + content in one div.
 */
export default function NexusLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <NavigationBar />
      {children}
    </div>
  );
}
