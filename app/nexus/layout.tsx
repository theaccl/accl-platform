import NavigationBar from "@/components/NavigationBar";

/** Route-level shell so the bar always mounts above NexusShell (same tree as /login, /modes). */
export default function NexusLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavigationBar />
      {children}
    </>
  );
}
