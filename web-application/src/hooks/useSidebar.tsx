"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

interface SidebarContextType {
  sidebarOpen: boolean;
  sidebarExpanded: boolean;
  setSidebarOpen: (open: boolean) => void;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleSidebar: () => void;
  collapseSidebar: () => void;
  expandSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    const storedExpanded = localStorage.getItem("sidebar-expanded");
    if (storedExpanded !== null) {
      setSidebarExpanded(storedExpanded === "true");
    }
  }, []);

  // Save sidebar expanded state to localStorage
  useEffect(() => {
    localStorage.setItem("sidebar-expanded", sidebarExpanded.toString());
    if (sidebarExpanded) {
      document.querySelector("body")?.classList.add("sidebar-expanded");
    } else {
      document.querySelector("body")?.classList.remove("sidebar-expanded");
    }
  }, [sidebarExpanded]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const collapseSidebar = () => {
    setSidebarExpanded(false);
  };

  const expandSidebar = () => {
    setSidebarExpanded(true);
  };

  const value = {
    sidebarOpen,
    sidebarExpanded,
    setSidebarOpen,
    setSidebarExpanded,
    toggleSidebar,
    collapseSidebar,
    expandSidebar,
  };

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
