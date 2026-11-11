/**
 * Keep the app shell still on touch devices: Safari ignores user-scalable=no, so block its
 * pinch gesture events, multi-finger moves outside the map, and stray page scrolling.
 * The map canvas handles its own gestures (touch-action: none) and is left alone.
 */
export function lockViewport(): () => void {
  if (typeof document === "undefined") return () => {};
  const isMap = (t: EventTarget | null) => t instanceof Element && !!t.closest("[data-map-surface]");
  const block = (e: Event) => e.preventDefault();
  const onTouchMove = (e: TouchEvent) => {
    if (isMap(e.target)) return;
    if (e.touches.length > 1) {
      e.preventDefault();
      return;
    }
    // single-finger moves are only allowed inside scrollable panels
    const scroller = e.target instanceof Element ? e.target.closest(".scroll-y") : null;
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) e.preventDefault();
  };
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey && !isMap(e.target)) e.preventDefault(); // trackpad pinch-zoom on desktop Safari/Chrome
  };
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });
  document.addEventListener("gestureend", block, { passive: false });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("dblclick", block, { passive: false });
  return () => {
    document.removeEventListener("gesturestart", block);
    document.removeEventListener("gesturechange", block);
    document.removeEventListener("gestureend", block);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("wheel", onWheel);
    document.removeEventListener("dblclick", block);
  };
}
