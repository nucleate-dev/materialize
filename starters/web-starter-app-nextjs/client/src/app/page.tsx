import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-text">Welcome to Nucleate!</h1>
        <p className="text-lg text-text-secondary">
          This is your main screen. You can start building your app here.
        </p>
      </div>
    </div>
  );
}
