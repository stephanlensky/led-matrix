import { useCallback, useEffect, useRef, useState } from "react";
import type { MappingFile, MappingState } from "../../shared/mapping.ts";
import { getErrorMessage } from "./errors.ts";

const SAVE_DELAY = 300;
const HISTORY_LIMIT = 100;

export type MappingEditor = {
  mapping: MappingFile | undefined;
  error: string | undefined;
  update: (edit: (mapping: MappingFile) => MappingFile) => void;
  undo: () => boolean;
  redo: () => boolean;
};

type History = { undo: MappingFile[]; redo: MappingFile[] };

export function useMapping(): MappingEditor {
  const [mapping, setMapping] = useState<MappingFile>();
  const [error, setError] = useState<string>();
  const mappingRef = useRef<MappingFile>(undefined);
  const historyRef = useRef<History>({ undo: [], redo: [] });
  const saveRef = useRef<() => void>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setCurrentMapping = useCallback((next: MappingFile) => {
    mappingRef.current = next;
    setMapping(next);
  }, []);

  useEffect(() => {
    function setState(state: MappingState) {
      clearTimeout(timeoutRef.current);
      saveRef.current = undefined;
      historyRef.current = { undo: [], redo: [] };
      if ("error" in state) {
        setError(state.error);
        return;
      }
      setCurrentMapping(state.mapping);
      setError(undefined);
    }
    const unsubscribe = window.api.onMapping(setState);
    void window.api.getMapping().then(setState);
    return () => {
      unsubscribe();
      clearTimeout(timeoutRef.current);
      saveRef.current?.();
    };
  }, [setCurrentMapping]);

  const setSavedMapping = useCallback(
    (next: MappingFile) => {
      setCurrentMapping(next);
      setError(undefined);
      const save = () => {
        saveRef.current = undefined;
        window.api.setMapping(next).then(
          () => setError(undefined),
          (saveError: unknown) => setError(getErrorMessage(saveError)),
        );
      };
      saveRef.current = save;
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(save, SAVE_DELAY);
    },
    [setCurrentMapping],
  );

  const update = useCallback(
    (edit: (mapping: MappingFile) => MappingFile) => {
      const current = mappingRef.current;
      if (!current) {
        return;
      }
      let next: MappingFile;
      try {
        next = edit(current);
      } catch (editError) {
        setError(getErrorMessage(editError));
        return;
      }
      const history = historyRef.current;
      history.undo = [...history.undo, current].slice(-HISTORY_LIMIT);
      history.redo = [];
      setSavedMapping(next);
    },
    [setSavedMapping],
  );

  const undo = useCallback(() => {
    const current = mappingRef.current;
    const history = historyRef.current;
    const previous = history.undo.at(-1);
    if (!current || !previous) {
      return false;
    }
    history.undo = history.undo.slice(0, -1);
    history.redo = [...history.redo, current];
    setSavedMapping(previous);
    return true;
  }, [setSavedMapping]);

  const redo = useCallback(() => {
    const current = mappingRef.current;
    const history = historyRef.current;
    const next = history.redo.at(-1);
    if (!current || !next) {
      return false;
    }
    history.redo = history.redo.slice(0, -1);
    history.undo = [...history.undo, current];
    setSavedMapping(next);
    return true;
  }, [setSavedMapping]);

  return { mapping, error, update, undo, redo };
}
