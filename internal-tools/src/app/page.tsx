import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function Home() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        breadcrumbs={[
          { title: "Dashboard" }
        ]}
      />

      <div className="flex-1 space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                System Status
              </CardTitle>
              <Badge variant="outline" className="text-green-600 border-green-600">
                Online
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">All Systems</div>
              <p className="text-xs text-muted-foreground">
                Control plane operational
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Cache Status
              </CardTitle>
              <Badge variant="outline" className="text-blue-600 border-blue-600">
                Connected
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Redis</div>
              <p className="text-xs text-muted-foreground">
                ElastiCache available
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Services
              </CardTitle>
              <Badge variant="outline">
                2 Running
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Services</div>
              <p className="text-xs text-muted-foreground">
                Dispatcher & Cleanup
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome to Internal Tools</CardTitle>
            <CardDescription>
              Monitor and manage your Materialize infrastructure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Use the sidebar to navigate to different management tools. Start with Cache Management to view and control your Redis cache.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
