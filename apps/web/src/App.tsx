import type { StoredAnimation } from "@led-matrix/core";
import { SquareIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimationList } from "./AnimationList.tsx";
import { getAnimations, play, setBpm, stop } from "./api.ts";
import { Panel } from "./Panel.tsx";
import { useStream } from "./useStream.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function App() {
  const { frame, state, isConnected } = useStream();
  const [animations, setAnimations] = useState<StoredAnimation[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    getAnimations()
      .then(setAnimations)
      .catch((cause: unknown) => setError(String(cause)));
  }, [isConnected]);

  function run(action: () => Promise<unknown>) {
    action()
      .then(() => setError(undefined))
      .catch((cause: unknown) => setError(String(cause)));
  }

  return (
    <main className="grid min-h-svh grid-cols-1 gap-6 p-6 md:grid-cols-[320px_1fr]">
      <Card className="self-start">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>LED Matrix</CardTitle>
          <Badge variant={isConnected ? "secondary" : "destructive"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="bpm">BPM</Label>
            <Input
              id="bpm"
              key={state?.bpm}
              className="w-24"
              type="number"
              min={20}
              max={300}
              defaultValue={state?.bpm ?? 120}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              onBlur={(event) => {
                const bpm = Number(event.currentTarget.value);
                if (bpm !== state?.bpm) {
                  run(() => setBpm(bpm));
                }
              }}
            />
          </div>
          <Separator />
          <AnimationList
            animations={animations}
            activeId={state?.animationId}
            onPlay={(id) => run(() => play(id))}
          />
          <Button variant="outline" onClick={() => run(stop)} disabled={!state?.animationId}>
            <SquareIcon />
            Stop
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
      <section className="grid place-items-center">
        <div className="rounded-xl border bg-black p-3 shadow-lg">
          <Panel frame={frame} />
        </div>
      </section>
    </main>
  );
}
