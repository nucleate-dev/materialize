import RequireAuth from "@/app/dashboard/RequireAuth";

export default function CanvasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <RequireAuth />
      {children}
    </>
  );
}