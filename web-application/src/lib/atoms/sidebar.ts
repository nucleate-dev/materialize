import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const sidebarOpenAtom = atomWithStorage("sidebar-open", true);

export const sidebarStateAtom = atom((get) =>
  get(sidebarOpenAtom) ? "expanded" : "collapsed",
);

export const redirectAfterLoginAtom = atomWithStorage<string | null>(
  "redirect_after_login",
  null,
);
