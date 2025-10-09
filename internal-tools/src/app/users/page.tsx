"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";
import { Check, Copy, Loader2, ShieldCheck, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";

interface CreateTestUserPayload {
  email: string;
  firstName?: string;
  lastName?: string;
  password?: string;
}

interface CreatedTestUser {
  id: string;
  email: string;
  password: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  createdAt: string;
}

const initialFormState: CreateTestUserPayload = {
  email: "",
  firstName: "",
  lastName: "",
  password: "",
};

export default function UsersPage() {
  const [formState, setFormState] = useState<CreateTestUserPayload>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreatedTestUser | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleInputChange = (field: keyof CreateTestUserPayload) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setFormState((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/users/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formState.email.trim(),
          firstName: formState.firstName?.trim() || undefined,
          lastName: formState.lastName?.trim() || undefined,
          password: formState.password ? formState.password : undefined,
        }),
      });

      const payload = (await response.json()) as
        | { data: CreatedTestUser }
        | { error: { message?: string } };

      if (!response.ok) {
        const message = "error" in payload ? payload.error?.message : undefined;
        throw new Error(message || "Unable to create test user");
      }

      if (!("data" in payload)) {
        throw new Error("Unexpected response from the server.");
      }

      setSuccess(payload.data);
      setFormState((prev) => ({ ...initialFormState, email: prev.email }));
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "An unexpected error occurred.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async (field: string, value: string) => {
    try {
      if (!navigator?.clipboard) {
        throw new Error("Clipboard API is unavailable");
      }
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (copyError) {
      const message =
        copyError instanceof Error ? copyError.message : "Unable to copy to clipboard";
      setError(message);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader title="Users" breadcrumbs={[{ title: "Users" }]} />

      <div className="flex-1 space-y-6 p-6">
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <UserPlus className="h-5 w-5 text-purple-600" />
                Create test user
              </CardTitle>
              <CardDescription>
                Generate a Supabase-authenticated user flagged for testing.
              </CardDescription>
            </div>
            <Badge variant="outline" className="mt-2 w-fit sm:mt-0">
              Requires service role access
            </Badge>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    placeholder="Optional"
                    value={formState.firstName}
                    onChange={handleInputChange("firstName")}
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    placeholder="Optional"
                    value={formState.lastName}
                    onChange={handleInputChange("lastName")}
                    autoComplete="family-name"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="real_email+test123@gmail.com"
                    value={formState.email}
                    onChange={handleInputChange("email")}
                    autoComplete="email"
                  />
                  <p className="text-xs text-muted-foreground">
                    Hint: use Gmail aliases like <code className="rounded bg-muted px-1 py-0.5">real_email+test123@gmail.com</code>.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="text"
                    placeholder="Optional — leave blank to auto-generate"
                    value={formState.password ?? ""}
                    onChange={handleInputChange("password")}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-end gap-3">
                <Button type="submit" disabled={isSubmitting || !formState.email.trim()}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating user…
                    </>
                  ) : (
                    "Create test user"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {success && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Test user created
              </CardTitle>
              <CardDescription>
                Credentials are generated once—store them securely for signing in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">User ID</span>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 font-mono text-xs">
                      <span className="truncate" title={success.id}>
                        {success.id}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleCopy("id", success.id)}
                      >
                        {copiedField === "id" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">Password</span>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 font-mono text-xs">
                      <span className="truncate" title={success.password}>
                        {success.password}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleCopy("password", success.password)}
                      >
                        {copiedField === "password" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">Email</span>
                    <p className="rounded-md border bg-background p-2 font-mono text-xs">
                      {success.email}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">Name</span>
                    <p className="rounded-md border bg-background p-2 text-sm">
                      {success.displayName || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  • Users are created in Supabase Auth with <code className="rounded bg-muted px-1 py-0.5">is_test_user: true</code> metadata.
                </p>
                <p>• Leave the password blank to automatically generate a strong credential.</p>
                <p>• Update the password after first login if the account will be shared.</p>
                <p>
                  • Remove test accounts when they are no longer needed to keep the environment tidy.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage guidelines</CardTitle>
            <CardDescription>
              Recommended practices for managing Supabase test accounts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              • Use unique Gmail aliases (<code className="rounded bg-muted px-1 py-0.5">real_email+alias@gmail.com</code>) to avoid collisions.
            </p>
            <p>
              • Test users are automatically synced with the <code className="rounded bg-muted px-1 py-0.5">public.users</code> table.
            </p>
            <p>
              • The service role key is required—do not share this UI outside the internal tools environment.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
