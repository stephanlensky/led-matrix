const latestRequests = new WeakMap<HTMLImageElement, number>();
let nextRequest = 0;

export async function setImageCanvas(
  image: HTMLImageElement,
  canvas: OffscreenCanvas,
): Promise<boolean> {
  const request = nextRequest++;
  latestRequests.set(image, request);
  const blob = await canvas.convertToBlob();
  if (latestRequests.get(image) !== request) {
    return false;
  }
  const previousSource = image.src;
  image.src = URL.createObjectURL(blob);
  if (previousSource.startsWith("blob:")) {
    URL.revokeObjectURL(previousSource);
  }
  return true;
}

export function clearImageCanvas(image: HTMLImageElement) {
  latestRequests.delete(image);
  if (image.src.startsWith("blob:")) {
    URL.revokeObjectURL(image.src);
  }
  image.removeAttribute("src");
}
