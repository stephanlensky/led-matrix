import { useCallback, useEffect, useRef, useState } from "react";
import type { MappingFile, MappingState } from "../../shared/mapping.ts";
import { getErrorMessage } from "./errors.ts";

const SAVE_DELAY = 300;

export type MappingEditor = {
  mapping: MappingFile | undefined;
  error: string | undefined;
  update: (edit: (mapping: MappingFile) => MappingFile) => void;
};

export function useMapping(): MappingEditor {
  const [mapping, setMapping] = useState<MappingFile>();
  const [error, setError] = useState<string>();
  const mappingRef = useRef<MappingFile>(undefined);
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

  return { mapping, error, update };
}
