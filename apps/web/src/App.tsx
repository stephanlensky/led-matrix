import { HEIGHT, WIDTH, createFrame, setPixel } from "@led-matrix/core";
import { Panel } from "./Panel.tsx";

function createTestPattern() {
  const frame = createFrame();
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      setPixel(frame, x, y, [x * 4, y * 4, 128]);
    }
  }
  return frame;
}

const testPattern = createTestPattern();

export function App() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "#111" }}>
      <Panel frame={testPattern} />
    </main>
  );
}
