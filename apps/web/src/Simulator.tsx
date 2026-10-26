import { type StoredAnimation, effects } from "@led-matrix/core";
import { SearchIcon, SquareIcon } from "lucide-react";
import { useState } from "react";
import { AnimationList } from "./AnimationList.tsx";
import { play, setBpm, stop } from "./api.ts";
import { EffectList } from "./EffectList.tsx";
import { MatrixFrame } from "./MatrixFrame.tsx";
import type { Stream } from "./useStream.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SimulatorProps = {
  stream: Stream;
  animations: readonly StoredAnimation[];
  showGrid: boolean;
  onShowGridChange: (showGrid: boolean) => void;
};

function getMatches<T extends { name: string }>(items: readonly T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
}

export function Simulator({
  stream: { frame, state, isConnected },
  animations,
  showGrid,
  onShowGridChange,
}: SimulatorProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();

  function run(action: () => Promise<unknown>) {
    action()
      .then(() => setError(undefined))
      .catch((cause: unknown) => setError(String(cause)));
  }

  return (
    <>
      <Card className="self-start md:w-80">
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
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="pixel-grid">Pixel grid</Label>
            <Switch id="pixel-grid" checked={showGrid} onCheckedChange={onShowGridChange} />
          </div>
          <Separator />
          <Tabs defaultValue="animations" className="gap-3">
            <TabsList variant="line" className="gap-4">
              <TabsTrigger value="animations" className="flex-none px-0">
                Animations
              </TabsTrigger>
              <TabsTrigger value="effects" className="flex-none px-0">
                Effects
              </TabsTrigger>
            </TabsList>
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-7 pl-8 text-xs"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <TabsContent value="animations" className="-mx-(--card-spacing)">
              <AnimationList
                animations={getMatches(animations, query)}
                activeId={state?.animationId}
                onPlay={(id) => run(() => play(id))}
              />
            </TabsContent>
            <TabsContent value="effects" className="-mx-(--card-spacing)">
              <EffectList effects={getMatches(effects, query)} />
            </TabsContent>
          </Tabs>
          <Button variant="outline" onClick={() => run(stop)} disabled={!state?.animationId}>
            <SquareIcon />
            Stop
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
      <MatrixFrame frame={frame} showGrid={showGrid} />
    </>
  );
}
