"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Database,
  Trash2,
  RefreshCw,
  Info,
  AlertCircle,
  CheckCircle,
  Search,
  Clock,
  Server,
  Link,
  Activity,
} from "lucide-react";
import {
  getCacheStats,
  clearCache,
  getPrototypeBuildData,
  calculatePercentage,
  type CacheStats,
  type PrototypeBuildData,
} from "@/lib/cache-api";

export default function CacheManagementPage() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearLoading, setClearLoading] = useState(false);
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);

  // Prototype lookup state
  const [prototypeId, setPrototypeId] = useState("");
  const [prototypeBuildData, setPrototypeBuildData] = useState<PrototypeBuildData | null>(null);
  const [prototypeLoading, setPrototypeLoading] = useState(false);
  const [prototypeError, setPrototypeError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCacheStats();
      setStats(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch cache stats"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    try {
      setClearLoading(true);
      setClearSuccess(null);
      setError(null);

      const result = await clearCache();
      setClearSuccess(result.message);

      // Refresh stats after clearing
      await fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear cache");
    } finally {
      setClearLoading(false);
    }
  };

  const handleRefreshStats = () => {
    setClearSuccess(null); // Clear any success message
    fetchStats();
  };

  const handlePrototypeLookup = async () => {
    if (!prototypeId.trim()) {
      setPrototypeError("Please enter a prototype ID");
      return;
    }

    try {
      setPrototypeLoading(true);
      setPrototypeError(null);
      setPrototypeBuildData(null);

      const data = await getPrototypeBuildData(prototypeId.trim());
      setPrototypeBuildData(data);
    } catch (err) {
      setPrototypeError(
        err instanceof Error ? err.message : "Failed to fetch prototype data"
      );
    } finally {
      setPrototypeLoading(false);
    }
  };

  const handlePrototypeInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePrototypeLookup();
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "stable":
        return "default";
      case "updating":
      case "building":
        return "secondary";
      case "creating":
        return "outline";
      case "cleaning":
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

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
  );
  return (
    <>
      <PageHeader
        title="Cache Management"
        breadcrumbs={[{ title: "Cache Management" }]}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshStats}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
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
                  <CardTitle className="text-sm font-medium">
                    Total Keys
                  </CardTitle>
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
                  <CardTitle className="text-sm font-medium">
                    Active Builds
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={
                      stats && stats.stats.activeBuilds > 0
                        ? "text-orange-600 border-orange-600"
                        : "text-gray-600 border-gray-600"
                    }
                  >
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
                  <CardTitle className="text-sm font-medium">
                    Prototype Builds
                  </CardTitle>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.stats.prototypeBuilds || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    proto:*:builds keys
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Current Builds
                  </CardTitle>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.stats.currentBuilds || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    proto:*:current keys
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
                  Remove all keys from the Redis cache. This will clear active
                  builds, prototype data, and all cached information.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearCache}
                disabled={clearLoading || loading}
              >
                <Trash2
                  className={`h-4 w-4 mr-2 ${
                    clearLoading ? "animate-pulse" : ""
                  }`}
                />
                {clearLoading ? "Clearing..." : "Clear Cache"}
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
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
                />
                Refresh Stats
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Prototype Build Lookup */}
        <Card>
          <CardHeader>
            <CardTitle>Prototype Build Lookup</CardTitle>
            <CardDescription>
              Look up current active build data for a specific prototype ID
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="prototypeId">Prototype ID</Label>
                <Input
                  id="prototypeId"
                  placeholder="Enter prototype ID (e.g., 12345678-1234-1234-1234-123456789abc)"
                  value={prototypeId}
                  onChange={(e) => setPrototypeId(e.target.value)}
                  onKeyPress={handlePrototypeInputKeyPress}
                  disabled={prototypeLoading}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handlePrototypeLookup}
                  disabled={prototypeLoading || !prototypeId.trim()}
                >
                  <Search className={`h-4 w-4 mr-2 ${prototypeLoading ? "animate-pulse" : ""}`} />
                  {prototypeLoading ? "Looking up..." : "Lookup"}
                </Button>
              </div>
            </div>

            {/* Prototype Error */}
            {prototypeError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{prototypeError}</AlertDescription>
              </Alert>
            )}

            {/* Prototype Build Data */}
            {prototypeBuildData && (
              <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Build Data for {prototypeBuildData.prototypeId}</h4>
                  <Badge variant="outline">
                    {prototypeBuildData.currentBuildId ? "Has Active Build" : "No Active Build"}
                  </Badge>
                </div>

                {/* Show message if provided */}
                {prototypeBuildData.message && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>{prototypeBuildData.message}</AlertDescription>
                  </Alert>
                )}

                {prototypeBuildData.activeBuild ? (
                  <>
                    {/* Current Active Build */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          <span className="font-medium">Current Build Status</span>
                        </div>
                        <Badge variant={getStatusBadgeVariant(prototypeBuildData.activeBuild.status)}>
                          {prototypeBuildData.activeBuild.status}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span className="font-medium">Last Touched</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatTimestamp(prototypeBuildData.activeBuild.last_touched)}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4" />
                          <span className="font-medium">Fargate Private IP</span>
                        </div>
                        <span className="text-sm font-mono bg-background p-1 rounded border">
                          {prototypeBuildData.activeBuild.fargate_private_ip || "N/A"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Link className="h-4 w-4" />
                          <span className="font-medium">Build URL</span>
                        </div>
                        <span className="text-sm font-mono bg-background p-1 rounded border break-all">
                          {prototypeBuildData.activeBuild.url || "N/A"}
                        </span>
                      </div>
                    </div>

                    {/* Task ARN */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        <span className="font-medium">Fargate Task ARN</span>
                      </div>
                      <div className="text-xs font-mono bg-background p-2 rounded border break-all">
                        {prototypeBuildData.activeBuild.fargate_task_arn || "N/A"}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    No active build found for this prototype
                  </div>
                )}

                {/* Build History */}
                {prototypeBuildData.allBuilds.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h5 className="font-medium">Build History ({prototypeBuildData.allBuilds.length} total)</h5>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {prototypeBuildData.allBuilds.slice(0, 10).map((build, idx) => (
                          <div
                            key={idx}
                            className={`flex justify-between items-center text-xs p-2 rounded border ${
                              build.buildId === prototypeBuildData.currentBuildId
                                ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
                                : "bg-background"
                            }`}
                          >
                            <span className="font-mono">{build.buildId}</span>
                            <span className="text-muted-foreground">
                              {formatTimestamp(build.timestamp)}
                            </span>
                            {build.buildId === prototypeBuildData.currentBuildId && (
                              <Badge variant="outline" className="text-xs">Current</Badge>
                            )}
                          </div>
                        ))}
                        {prototypeBuildData.allBuilds.length > 10 && (
                          <div className="text-xs text-muted-foreground italic text-center">
                            ... and {prototypeBuildData.allBuilds.length - 10} more builds
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sample Cache Keys */}
        <Card>
          <CardHeader>
            <CardTitle>Sample Cache Keys</CardTitle>
            <CardDescription>
              View actual cache keys for each category (showing first 5 keys per
              type)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <div className="space-y-1">
                      {[...Array(2)].map((_, j) => (
                        <Skeleton key={j} className="h-4 w-full" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : stats && stats.stats.sampleKeys ? (
              <div className="space-y-6">
                {/* Active Build Keys */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <h4 className="font-medium text-sm">
                      Active Build Keys ({stats.stats.activeBuilds} total)
                    </h4>
                  </div>
                  {stats.stats.sampleKeys.activeBuild.length > 0 ? (
                    <div className="ml-5 space-y-1">
                      {stats.stats.sampleKeys.activeBuild.map((key, idx) => (
                        <div
                          key={idx}
                          className="text-xs font-mono bg-muted p-2 rounded border"
                        >
                          {key}
                        </div>
                      ))}
                      {stats.stats.activeBuilds > 5 && (
                        <div className="text-xs text-muted-foreground italic">
                          ... and {stats.stats.activeBuilds - 5} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="ml-5 text-xs text-muted-foreground italic">
                      No active build keys
                    </div>
                  )}
                </div>

                {/* Prototype Build Keys */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <h4 className="font-medium text-sm">
                      Prototype Build Keys ({stats.stats.prototypeBuilds} total)
                    </h4>
                  </div>
                  {stats.stats.sampleKeys.prototypeBuild.length > 0 ? (
                    <div className="ml-5 space-y-1">
                      {stats.stats.sampleKeys.prototypeBuild.map((key, idx) => (
                        <div
                          key={idx}
                          className="text-xs font-mono bg-muted p-2 rounded border"
                        >
                          {key}
                        </div>
                      ))}
                      {stats.stats.prototypeBuilds > 5 && (
                        <div className="text-xs text-muted-foreground italic">
                          ... and {stats.stats.prototypeBuilds - 5} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="ml-5 text-xs text-muted-foreground italic">
                      No prototype build keys
                    </div>
                  )}
                </div>

                {/* Current Build Keys */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <h4 className="font-medium text-sm">
                      Current Build Keys ({stats.stats.currentBuilds} total)
                    </h4>
                  </div>
                  {stats.stats.sampleKeys.currentBuild.length > 0 ? (
                    <div className="ml-5 space-y-1">
                      {stats.stats.sampleKeys.currentBuild.map((key, idx) => (
                        <div
                          key={idx}
                          className="text-xs font-mono bg-muted p-2 rounded border"
                        >
                          {key}
                        </div>
                      ))}
                      {stats.stats.currentBuilds > 5 && (
                        <div className="text-xs text-muted-foreground italic">
                          ... and {stats.stats.currentBuilds - 5} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="ml-5 text-xs text-muted-foreground italic">
                      No current build keys
                    </div>
                  )}
                </div>

                {/* Other Keys */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                    <h4 className="font-medium text-sm">
                      Other Keys ({stats.stats.keyBreakdown.other} total)
                    </h4>
                  </div>
                  {stats.stats.sampleKeys.other.length > 0 ? (
                    <div className="ml-5 space-y-1">
                      {stats.stats.sampleKeys.other.map((key, idx) => (
                        <div
                          key={idx}
                          className="text-xs font-mono bg-muted p-2 rounded border"
                        >
                          {key}
                        </div>
                      ))}
                      {stats.stats.keyBreakdown.other > 5 && (
                        <div className="text-xs text-muted-foreground italic">
                          ... and {stats.stats.keyBreakdown.other - 5} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="ml-5 text-xs text-muted-foreground italic">
                      No other keys
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No sample keys available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
