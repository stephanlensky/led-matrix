import type { Output } from "@led-matrix/core";
import { FolderOpenIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FileSetting, OutputMode, Settings as SettingsValue } from "../../shared/api.ts";
import { Button } from "@led-matrix/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@led-matrix/ui/components/card";
import { Input } from "@led-matrix/ui/components/input";
import { Label } from "@led-matrix/ui/components/label";
import { Switch } from "@led-matrix/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@led-matrix/ui/components/select";
import { getErrorMessage } from "./errors.ts";
import { useDaemonStatus } from "./useDaemon.ts";
import { useSettings } from "./useSettings.ts";

const SAVE_DELAY = 300;

const outputs: readonly Output[] = ["device", "simulator"];

const outputLabels: Record<Output, string> = {
  device: "Device",
  simulator: "Simulator",
};

const outputModes: readonly OutputMode[] = ["server", "local"];

const outputModeLabels: Record<OutputMode, string> = {
  server: "Server (WiFi)",
  local: "Local (USB)",
};

const AUTO_DETECT = "auto";

function useSerialPorts(isEnabled: boolean): string[] {
  const [ports, setPorts] = useState<string[]>([]);
  useEffect(() => {
    if (isEnabled) {
      void window.api.getSerialPorts().then(setPorts);
    }
  }, [isEnabled]);
  return ports;
}

function getSerialPortLabel(port: string): string {
  return port === AUTO_DETECT ? "Auto-detect" : port;
}

function FileInput({
  id,
  label,
  value,
  isDisabled,
  onChange,
  onShowDialog,
}: {
  id: string;
  label: string;
  value: string;
  isDisabled: boolean;
  onChange: (value: string) => void;
  onShowDialog: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        variant="outline"
        size="icon"
        aria-label={`Choose ${label.toLowerCase()}`}
        disabled={isDisabled}
        onClick={onShowDialog}
      >
        <FolderOpenIcon />
      </Button>
    </div>
  );
}

function PortInput({
  id,
  value,
  isDisabled,
  onChange,
}: {
  id: string;
  value: number | null;
  isDisabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <Input
      id={id}
      type="number"
      min={1}
      max={65535}
      placeholder="Off"
      value={value ?? ""}
      disabled={isDisabled}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.valueAsNumber)}
    />
  );
}

function SettingsForm({
  initialSettings,
  isDaemonRunning,
}: {
  initialSettings: SettingsValue;
  isDaemonRunning: boolean;
}) {
  const id = useId();
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isLocal = settings.outputMode === "local";
  const serialPorts = useSerialPorts(isLocal);
  const serialPortOptions = [
    AUTO_DETECT,
    ...new Set([...serialPorts, ...(settings.serialPort ? [settings.serialPort] : [])]),
  ];

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function update(changes: Partial<SettingsValue>) {
    const next = { ...settings, ...changes };
    setSettings(next);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      window.api.setSettings(next).then(
        () => setError(undefined),
        (saveError: unknown) => setError(getErrorMessage(saveError)),
      );
    }, SAVE_DELAY);
  }

  async function showFileDialog(setting: FileSetting) {
    const path = await window.api.showFileDialog(setting);
    if (path) {
      update({ [setting]: path });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {error && <p className="whitespace-pre-line text-destructive">{error}</p>}
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Sync</CardTitle>
          <CardDescription>
            {isDaemonRunning
              ? "Stop the daemon to change these settings."
              : "Used by the daemon and the editor."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-3">
          <Label htmlFor={`${id}-server`}>Server</Label>
          <Input
            id={`${id}-server`}
            value={settings.serverUrl}
            disabled={isDaemonRunning}
            onChange={(event) => update({ serverUrl: event.target.value })}
          />
          <Label htmlFor={`${id}-socket`}>Mixxx socket</Label>
          <Input
            id={`${id}-socket`}
            value={settings.socketPath}
            disabled={isDaemonRunning}
            onChange={(event) => update({ socketPath: event.target.value })}
          />
          <Label htmlFor={`${id}-mapping`}>Mapping file</Label>
          <FileInput
            id={`${id}-mapping`}
            label="Mapping file"
            value={settings.mappingFile}
            isDisabled={isDaemonRunning}
            onChange={(mappingFile) => update({ mappingFile })}
            onShowDialog={() => void showFileDialog("mappingFile")}
          />
        </CardContent>
      </Card>
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Output</CardTitle>
          <CardDescription>
            Where the daemon and the editor play. Local renders on this computer and streams to the
            board over USB.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-3">
          <Label htmlFor={`${id}-output-mode`}>Output</Label>
          <Select
            value={settings.outputMode}
            onValueChange={(outputMode: OutputMode | null) => {
              if (outputMode) {
                update({ outputMode });
              }
            }}
          >
            <SelectTrigger id={`${id}-output-mode`} className="w-full">
              <SelectValue>{(outputMode: OutputMode) => outputModeLabels[outputMode]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {outputModes.map((outputMode) => (
                <SelectItem key={outputMode} value={outputMode}>
                  {outputModeLabels[outputMode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLocal ? (
            <>
              <Label htmlFor={`${id}-serial-port`}>Serial port</Label>
              <Select
                value={settings.serialPort ?? AUTO_DETECT}
                onValueChange={(port: string | null) => {
                  if (port) {
                    update({ serialPort: port === AUTO_DETECT ? null : port });
                  }
                }}
              >
                <SelectTrigger id={`${id}-serial-port`} className="w-full">
                  <SelectValue>{getSerialPortLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {serialPortOptions.map((port) => (
                    <SelectItem key={port} value={port}>
                      {getSerialPortLabel(port)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor={`${id}-recording-directory`}>Recordings</Label>
              <FileInput
                id={`${id}-recording-directory`}
                label="Recordings folder"
                value={settings.recordingDirectory}
                isDisabled={false}
                onChange={(recordingDirectory) => update({ recordingDirectory })}
                onShowDialog={() => void showFileDialog("recordingDirectory")}
              />
            </>
          ) : (
            <>
              <Label htmlFor={`${id}-output`}>Server output</Label>
              <Select
                value={settings.output}
                onValueChange={(output: Output | null) => {
                  if (output) {
                    update({ output });
                  }
                }}
              >
                <SelectTrigger id={`${id}-output`} className="w-full">
                  <SelectValue>{(output: Output) => outputLabels[output]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {outputs.map((output) => (
                    <SelectItem key={output} value={output}>
                      {outputLabels[output]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </CardContent>
      </Card>
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Network</CardTitle>
          <CardDescription>
            Started with the daemon. Leave a port empty to turn it off. There is no authentication,
            so only use these on a trusted network.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-3">
          <Label htmlFor={`${id}-forward-port`}>Socket forward</Label>
          <PortInput
            id={`${id}-forward-port`}
            value={settings.forwardPort}
            isDisabled={isDaemonRunning}
            onChange={(forwardPort) => update({ forwardPort })}
          />
          <Label htmlFor={`${id}-volume-port`}>Volume page</Label>
          <PortInput
            id={`${id}-volume-port`}
            value={settings.volumePort}
            isDisabled={isDaemonRunning}
            onChange={(volumePort) => update({ volumePort })}
          />
          <Label htmlFor={`${id}-bind-host`}>Bind address</Label>
          <Input
            id={`${id}-bind-host`}
            value={settings.bindHost}
            disabled={isDaemonRunning}
            onChange={(event) => update({ bindHost: event.target.value })}
          />
        </CardContent>
      </Card>
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Daemon</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-3">
          <Label htmlFor={`${id}-start`}>Start on launch</Label>
          <Switch
            id={`${id}-start`}
            checked={settings.startDaemonOnLaunch}
            onCheckedChange={(startDaemonOnLaunch) => update({ startDaemonOnLaunch })}
          />
        </CardContent>
      </Card>
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle>Library</CardTitle>
          <CardDescription>Read by the editor. Never written.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-3">
          <Label htmlFor={`${id}-database`}>Mixxx database</Label>
          <FileInput
            id={`${id}-database`}
            label="Mixxx database"
            value={settings.mixxxDatabasePath}
            isDisabled={false}
            onChange={(mixxxDatabasePath) => update({ mixxxDatabasePath })}
            onShowDialog={() => void showFileDialog("mixxxDatabasePath")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function Settings() {
  const settings = useSettings();
  const status = useDaemonStatus();

  if (!settings || !status) {
    return null;
  }

  return <SettingsForm initialSettings={settings} isDaemonRunning={status.isRunning} />;
}
