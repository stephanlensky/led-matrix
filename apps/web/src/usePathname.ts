import { useSyncExternalStore } from "react";

const CHANGE_EVENT = "pathnamechange";

type NavigateOptions = {
  replace?: boolean;
};

function subscribe(onChange: () => void): () => void {
  addEventListener("popstate", onChange);
  addEventListener(CHANGE_EVENT, onChange);
  return () => {
    removeEventListener("popstate", onChange);
    removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getPathname(): string {
  return location.pathname;
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getPathname);
}

export function navigate(pathname: string, { replace = false }: NavigateOptions = {}) {
  if (pathname === location.pathname) {
    return;
  }
  if (replace) {
    history.replaceState(null, "", pathname);
  } else {
    history.pushState(null, "", pathname);
  }
  dispatchEvent(new Event(CHANGE_EVENT));
}
