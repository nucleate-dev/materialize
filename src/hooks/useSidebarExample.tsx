// Example of how to use the useSidebar hook in any component

"use client";

import { useSidebar } from './useSidebar';

export function ExampleComponent() {
  const { sidebarExpanded, collapseSidebar, expandSidebar } = useSidebar();

  return (
    <div>
      <p>Sidebar is {sidebarExpanded ? 'expanded' : 'collapsed'}</p>
      
      <button onClick={collapseSidebar}>
        Collapse Sidebar
      </button>
      
      <button onClick={expandSidebar}>
        Expand Sidebar
      </button>
    </div>
  );
}

// This is just an example file - delete this when you understand how to use the hook