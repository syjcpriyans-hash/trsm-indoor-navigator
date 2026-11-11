/** The web build uses real routes; the single-file artifact build routes on #hash. */
export const SINGLE_FILE = process.env.NEXT_PUBLIC_SINGLE_FILE === "1";
export const links = SINGLE_FILE
  ? { home: "#", anchors: "#anchors", inspect: "#inspect", homeFromSub: "#" }
  : { home: "./", anchors: "./anchors/", inspect: "./inspect/", homeFromSub: "../" };
