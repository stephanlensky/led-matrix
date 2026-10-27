import type { StoredAnimation } from "@led-matrix/core";
import { LiveTimeline } from "./LiveTimeline.tsx";
import { MatrixFrame } from "./MatrixFrame.tsx";
import { PlaybackControls } from "./PlaybackControls.tsx";
import type { Stream } from "./useStream.ts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SimulatorProps = {
  stream: Stream;
  animations: readonly StoredAnimation[];
  showGrid: boolean;
  onShowGridChange: (showGrid: boolean) => void;
};

export function Simulator({
  stream: { frame, state, isConnected },
  animations,
  showGrid,
  onShowGridChange,
}: SimulatorProps) {
  return (
    <>
      <Card className="max-h-[calc(100svh-3rem)] self-start md:w-80">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Simulator</CardTitle>
          <Badge variant={isConnected ? "secondary" : "destructive"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-col gap-4">
          <PlaybackControls
            output="simulator"
            state={state}
            animations={animations}
            showGrid={showGrid}
            onShowGridChange={onShowGridChange}
          />
        </CardContent>
      </Card>
      <MatrixFrame
        frame={frame}
        showGrid={showGrid}
        footer={<LiveTimeline output="simulator" state={state} animations={animations} />}
      />
    </>
  );
}
