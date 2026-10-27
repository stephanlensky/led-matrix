import { Daemon } from "./Daemon.tsx";

export function App() {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <h1 className="text-sm font-medium">Mixxx Sync</h1>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <Daemon />
      </main>
    </div>
  );
}
