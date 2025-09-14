import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const sidebarOpenAtom = atomWithStorage("sidebar-open", true);

export const sidebarStateAtom = atom((get) =>
  get(sidebarOpenAtom) ? "expanded" : "collapsed",
);
