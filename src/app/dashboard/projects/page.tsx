"use client";

import ProjectThumbnail from "../components/ProjectThumbnail";

export default function Projects() {
  // Sample project data
  const sampleProjects = [
    {
      id: 1,
      name: "E-commerce Mobile App",
      thumbnailUrl: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&h=600&fit=crop&crop=center",
      lastModified: "2 hours ago"
    },
    {
      id: 2,
      name: "Dashboard Redesign",
      thumbnailUrl: "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=800&h=600&fit=crop&crop=center",
      lastModified: "1 day ago"
    }
  ];

  const handleProjectClick = (projectId: number) => {
    console.log(`Opening project ${projectId}`);
    // TODO: Navigate to project canvas
  };

  return (
    <div className="mx-auto max-w-screen-2xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title-xl2 font-bold text-black dark:text-white mb-2">
              Projects
            </h1>
            <p className="text-body dark:text-bodydark">
              Your infinite canvases for rapid prototyping and design
            </p>
          </div>
          
          {/* New Project Button */}
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary/90 transition-colors duration-200">
            <svg
              className="fill-current"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 4V16M4 10H16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            New Project
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {sampleProjects.map((project) => (
          <ProjectThumbnail
            key={project.id}
            projectName={project.name}
            thumbnailUrl={project.thumbnailUrl}
            lastModified={project.lastModified}
            onClick={() => handleProjectClick(project.id)}
          />
        ))}
      </div>

      {/* Empty State (when no projects) */}
      {sampleProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-24 h-24 bg-gray-100 dark:bg-meta-4 rounded-full flex items-center justify-center mb-6">
            <svg
              className="w-12 h-12 text-body dark:text-bodydark2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-black dark:text-white mb-2">
            No projects yet
          </h3>
          <p className="text-body dark:text-bodydark mb-6 max-w-md">
            Create your first infinite canvas to start prototyping and designing at the speed of thought.
          </p>
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary/90 transition-colors duration-200">
            Create First Project
          </button>
        </div>
      )}
    </div>
  );
}