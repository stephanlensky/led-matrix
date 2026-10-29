export const volumePage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#000000">
<title>Mixxx Volume</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #000; color: #f5f5f5; font-family: system-ui, sans-serif; }
  body { display: flex; flex-direction: column; align-items: center; padding: 16px; gap: 16px; user-select: none; -webkit-user-select: none; touch-action: none; }
  h1 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #a3a3a3; }
  #db { font-size: 56px; font-weight: 700; font-variant-numeric: tabular-nums; }
  #status { font-size: 14px; color: #a3a3a3; min-height: 1.2em; }
  #status.error { color: #f87171; }
  #fader { position: relative; flex: 1; width: 120px; max-height: 640px; border-radius: 24px; background: #262626; overflow: hidden; cursor: ns-resize; }
  #fader.disabled { opacity: 0.4; }
  #fill { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(to top, #2563eb, #a855f7 50%, #f43f5e); }
  #unity { position: absolute; left: 0; right: 0; top: 50%; height: 2px; background: #f5f5f5; opacity: 0.6; }
  #thumb { position: absolute; left: 8px; right: 8px; height: 12px; margin-bottom: -6px; border-radius: 6px; background: #fff; }
  button { font: inherit; font-size: 16px; padding: 12px 24px; border-radius: 12px; border: 1px solid #404040; background: #171717; color: inherit; }
</style>
</head>
<body>
<h1>Main gain</h1>
<div id="db">–</div>
<div id="status">Connecting…</div>
<div id="fader" role="slider" aria-label="Main gain" aria-valuemin="0" aria-valuemax="1" tabindex="0">
  <div id="fill"></div>
  <div id="unity"></div>
  <div id="thumb"></div>
</div>
<button id="reset" type="button">0 dB</button>
<script>
  const MIN_DB = -14;
  const MAX_DB = 14;
  const OFFSET = 10 ** (MIN_DB / 20);
  const POLL_INTERVAL = 1000;
  const SEND_INTERVAL = 100;
  const HOLD_TIME = 1500;
  const SNAP = 0.015;

  const fader = document.getElementById("fader");
  const fill = document.getElementById("fill");
  const thumb = document.getElementById("thumb");
  const dbText = document.getElementById("db");
  const status = document.getElementById("status");

  let parameter = null;
  let isConnected = false;
  let isDragging = false;
  let lastSendTime = 0;
  let sendTimer;
  let pendingParameter = null;

  function getValue(p) {
    if (p <= 0) return 0;
    if (p < 0.5) return (10 ** ((MIN_DB + p * -MIN_DB * 2) / 20) - OFFSET) / (1 - OFFSET);
    return 10 ** (((p - 0.5) * MAX_DB * 2) / 20);
  }

  function formatDb(p) {
    const value = getValue(p);
    if (value <= 0) return "−∞ dB";
    const db = 20 * Math.log10(value);
    const rounded = Math.abs(db) < 0.05 ? 0 : db;
    return (rounded > 0 ? "+" : rounded < 0 ? "−" : "") + Math.abs(rounded).toFixed(1) + " dB";
  }

  function render() {
    fader.classList.toggle("disabled", !isConnected);
    if (parameter === null) {
      dbText.textContent = "–";
      return;
    }
    const percent = parameter * 100 + "%";
    fill.style.height = percent;
    thumb.style.bottom = percent;
    dbText.textContent = formatDb(parameter);
    fader.setAttribute("aria-valuenow", parameter.toFixed(3));
  }

  function setStatus(text, isError) {
    status.textContent = text;
    status.classList.toggle("error", isError);
  }

  async function post(p) {
    lastSendTime = Date.now();
    try {
      const response = await fetch("api/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameter: p }),
      });
      if (response.status === 503) {
        isConnected = false;
        setStatus("Mixxx is not connected", true);
        render();
      } else if (!response.ok) {
        setStatus("Error " + response.status, true);
      }
    } catch {
      setStatus("Lost connection to the laptop", true);
    }
  }

  function send(p) {
    pendingParameter = p;
    const wait = SEND_INTERVAL - (Date.now() - lastSendTime);
    clearTimeout(sendTimer);
    const flush = () => {
      const next = pendingParameter;
      pendingParameter = null;
      if (next !== null) void post(next);
    };
    if (wait <= 0) flush();
    else sendTimer = setTimeout(flush, wait);
  }

  function setParameter(p) {
    let next = Math.min(1, Math.max(0, p));
    if (Math.abs(next - 0.5) < SNAP) next = 0.5;
    parameter = next;
    render();
    send(next);
  }

  function getPointerParameter(event) {
    const rect = fader.getBoundingClientRect();
    return 1 - (event.clientY - rect.top) / rect.height;
  }

  fader.addEventListener("pointerdown", (event) => {
    if (!isConnected) return;
    isDragging = true;
    fader.setPointerCapture(event.pointerId);
    setParameter(getPointerParameter(event));
  });
  fader.addEventListener("pointermove", (event) => {
    if (isDragging) setParameter(getPointerParameter(event));
  });
  const stopDragging = () => { isDragging = false; };
  fader.addEventListener("pointerup", stopDragging);
  fader.addEventListener("pointercancel", stopDragging);
  fader.addEventListener("keydown", (event) => {
    if (!isConnected || parameter === null) return;
    if (event.key === "ArrowUp") setParameter(parameter + 0.01);
    else if (event.key === "ArrowDown") setParameter(parameter - 0.01);
    else return;
    event.preventDefault();
  });
  document.getElementById("reset").addEventListener("click", () => {
    if (isConnected) setParameter(0.5);
  });

  async function poll() {
    try {
      const response = await fetch("api/volume", { cache: "no-store" });
      const volume = await response.json();
      isConnected = volume.connected;
      const isHolding = isDragging || pendingParameter !== null || Date.now() - lastSendTime < HOLD_TIME;
      if (!isHolding && volume.parameter !== null) parameter = volume.parameter;
      if (isConnected) setStatus("Connected to Mixxx", false);
      else setStatus("Mixxx is not connected", true);
    } catch {
      isConnected = false;
      setStatus("Lost connection to the laptop", true);
    }
    render();
  }

  void poll();
  setInterval(poll, POLL_INTERVAL);
</script>
</body>
</html>
`;
