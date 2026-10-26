import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { loadCanvasFonts } from "./browserCanvas.ts";
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
