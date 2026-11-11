// Minimal stand-in for next/dynamic used by the single-file build.
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

export default function dynamic<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>, opts?: { loading?: () => ReactNode; ssr?: boolean }) {
  const L = lazy(loader);
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={opts?.loading ? opts.loading() : null}>
        <L {...props} />
      </Suspense>
    );
  };
}
