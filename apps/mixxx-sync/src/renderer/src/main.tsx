import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadCanvasFonts } from "@led-matrix/ui/lib/browser-canvas";
import { App } from "./App.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

loadCanvasFonts().catch((cause: unknown) => console.error("Failed to load canvas fonts", cause));

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
