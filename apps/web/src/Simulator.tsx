import type { StoredAnimation } from "@led-matrix/core";
import { LiveTimeline } from "./LiveTimeline.tsx";
import { MatrixFrame } from "@led-matrix/ui/components/matrix-frame";
import { TIMELINE_HEIGHT } from "@led-matrix/ui/components/timeline";
import { PlaybackControls } from "./PlaybackControls.tsx";
import type { Stream } from "@led-matrix/ui/lib/stream";
import { Badge } from "@led-matrix/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@led-matrix/ui/components/card";

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
        footerHeight={TIMELINE_HEIGHT}
        footer={<LiveTimeline output="simulator" state={state} animations={animations} />}
      />
    </>
  );
}
