export function PeopleTab() {
  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
            People
          </h1>
          <p className="text-gray-600 dark:text-[#8A8F98] text-lg">
            Manage team members and their permissions.
          </p>
        </div>

        {/* People management content will go here */}
      </div>
    </div>
  );
}
