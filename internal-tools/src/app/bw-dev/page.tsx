"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Container, Loader2 } from "lucide-react";
import { useState } from "react";

export default function DevServerPage() {
  const [fargateTaskName, setFargateTaskName] = useState("");
  const [fargateLoading, setFargateLoading] = useState(false);

  const handleAcquireFargate = async () => {
    setFargateLoading(true);
  };

  return (
    <TooltipProvider>
      <PageHeader
        title="Dev Server Management"
        breadcrumbs={[{ title: "Dev Server Management" }]}
      />
      <div className="flex-1 space-y-6 p-6">
        {/* Fargate Dev Task Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Container className="h-5 w-5 text-orange-600" />
              <CardTitle>Dev Fargate Build Worker</CardTitle>
            </div>
            <CardDescription>
              Acquire a development Fargate task for build worker testing. The
              task will run until manually stopped.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fargate-task-name">Task Name</Label>
              <Input
                id="fargate-task-name"
                placeholder="e.g., dev-build-worker-testing"
                value={fargateTaskName}
                onChange={(e) => setFargateTaskName(e.target.value)}
                disabled={fargateLoading}
              />
              <p className="text-sm text-muted-foreground">
                This will be used as part of the task name for identification
              </p>
            </div>

            <Button
              onClick={handleAcquireFargate}
              disabled={fargateLoading || !fargateTaskName.trim()}
              className="w-full sm:w-auto"
            >
              {fargateLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Acquiring Fargate...
                </>
              ) : (
                <>
                  <Container className="h-4 w-4 mr-2" />
                  Acquire Dev Fargate Task
                </>
              )}
            </Button>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Task Definition: Build worker container</p>
              <p>• Auto-termination: Manual stop required</p>
              <p>• Purpose: Build worker development</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
