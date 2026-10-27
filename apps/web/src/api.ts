import { createApiClient } from "@led-matrix/ui/lib/api";
import { createBrowserClips } from "@led-matrix/ui/lib/clips";

export const api = createApiClient("");

export const browserClips = createBrowserClips(api);
