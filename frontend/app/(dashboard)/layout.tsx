import Navbar from "@/components/Navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="w-full pt-16 flex-1 bg-surface">
        {children}
      </main>
    </>
  );
}
