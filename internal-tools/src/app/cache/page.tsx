"use client"

import { useState, useEffect } from "react"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Database, Trash2, RefreshCw, Info, AlertCircle, CheckCircle } from "lucide-react"
import { getCacheStats, clearCache, calculatePercentage, type CacheStats } from "@/lib/cache-api"

export default function CacheManagementPage() {
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clearLoading, setClearLoading] = useState(false)
  const [clearSuccess, setClearSuccess] = useState<string | null>(null)

  const fetchStats = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getCacheStats()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cache stats')
    } finally {
      setLoading(false)
    }
  }

  const handleClearCache = async () => {
    try {
      setClearLoading(true)
      setClearSuccess(null)
      setError(null)

      const result = await clearCache()
      setClearSuccess(result.message)

      // Refresh stats after clearing
      await fetchStats()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear cache')
    } finally {
      setClearLoading(false)
    }
  }

  const handleRefreshStats = () => {
    setClearSuccess(null) // Clear any success message
    fetchStats()
  }

  useEffect(() => {
    fetchStats()
  }, [])

  // Loading skeleton
  const StatSkeleton = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  )
  return (
    <>
      <PageHeader
        title="Cache Management"
        breadcrumbs={[
          { title: "Cache Management" }
        ]}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshStats}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Stats
        </Button>
      </PageHeader>

      <div className="flex-1 space-y-6 p-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {clearSuccess && (
          <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/50 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{clearSuccess}</AlertDescription>
          </Alert>
        )}

        {/* Cache Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            <>
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Keys</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.stats.totalKeys.toLocaleString() || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All cache keys
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Builds</CardTitle>
                  <Badge variant="outline" className={
                    stats && stats.stats.activeBuilds > 0
                      ? "text-orange-600 border-orange-600"
                      : "text-gray-600 border-gray-600"
                  }>
                    {stats && stats.stats.activeBuilds > 0 ? "Running" : "Idle"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.stats.activeBuilds || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    active_build:* keys
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Prototype Builds</CardTitle>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.stats.prototypeBuilds || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    proto_builds:* keys
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Current Builds</CardTitle>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.stats.currentBuilds || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    proto_current_build:* keys
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Cache Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Cache Operations</CardTitle>
            <CardDescription>
              Manage your Redis cache with these administrative tools
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium">Clear All Cache</h4>
                <p className="text-sm text-muted-foreground">
                  Remove all keys from the Redis cache. This will clear active builds, prototype data, and all cached information.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearCache}
                disabled={clearLoading || loading}
              >
                <Trash2 className={`h-4 w-4 mr-2 ${clearLoading ? 'animate-pulse' : ''}`} />
                {clearLoading ? 'Clearing...' : 'Clear Cache'}
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="font-medium">Refresh Statistics</h4>
                <p className="text-sm text-muted-foreground">
                  Update the cache statistics and key counts shown above.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshStats}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh Stats
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Cache Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Key Distribution</CardTitle>
            <CardDescription>
              Breakdown of cache keys by type
              {stats && (
                <span className="ml-2 text-xs">
                  (Last updated: {new Date(stats.timestamp).toLocaleTimeString()})
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-3 h-3 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-5 w-12" />
                    </div>
                  </div>
                ))}
              </div>
            ) : stats ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span className="text-sm font-medium">active_build:*</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {stats.stats.keyBreakdown['active_build:*']} keys
                    </span>
                    <Badge variant="secondary">
                      {calculatePercentage(stats.stats.keyBreakdown['active_build:*'], stats.stats.totalKeys)}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium">proto_builds:*</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {stats.stats.keyBreakdown['proto_builds:*']} keys
                    </span>
                    <Badge variant="secondary">
                      {calculatePercentage(stats.stats.keyBreakdown['proto_builds:*'], stats.stats.totalKeys)}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium">proto_current_build:*</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {stats.stats.keyBreakdown['proto_current_build:*']} keys
                    </span>
                    <Badge variant="secondary">
                      {calculatePercentage(stats.stats.keyBreakdown['proto_current_build:*'], stats.stats.totalKeys)}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                    <span className="text-sm font-medium">Other keys</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {stats.stats.keyBreakdown.other} keys
                    </span>
                    <Badge variant="secondary">
                      {calculatePercentage(stats.stats.keyBreakdown.other, stats.stats.totalKeys)}
                    </Badge>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}