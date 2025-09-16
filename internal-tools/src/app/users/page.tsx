"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Users,
  Search,
  UserPlus,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  Edit,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  subscriptionStatus: "subscribed" | "unsubscribed";
  role: "subscribed" | "employee" | "test";
}

export default function UsersPage() {
  const [searchUserId, setSearchUserId] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Mock user data for demonstration
  const mockUsers: Record<string, User> = {
    "user-123": {
      id: "user-123",
      name: "John Doe",
      email: "john.doe@example.com",
      phoneNumber: "+1-555-0123",
      subscriptionStatus: "subscribed",
      role: "subscribed",
    },
    "user-456": {
      id: "user-456",
      name: "Jane Smith",
      email: "jane.smith@company.com",
      phoneNumber: "+1-555-0456",
      subscriptionStatus: "unsubscribed",
      role: "employee",
    },
    "user-789": {
      id: "user-789",
      name: "Test User",
      email: "test@example.com",
      phoneNumber: "+1-555-0789",
      subscriptionStatus: "unsubscribed",
      role: "test",
    },
  };

  const handleSearchUser = async () => {
    if (!searchUserId.trim()) {
      setError("Please enter a user ID");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const user = mockUsers[searchUserId.trim()];
      if (user) {
        setCurrentUser(user);
        setSuccess(`User ${user.name} loaded successfully`);
      } else {
        setError("User not found");
        setCurrentUser(null);
      }
    } catch (err) {
      setError("Failed to load user data");
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTestUser = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const newUserId = `test-user-${Date.now()}`;
      const newUser: User = {
        id: newUserId,
        name: "Test User",
        email: `test-${Date.now()}@example.com`,
        phoneNumber: "+1-555-TEST",
        subscriptionStatus: "unsubscribed",
        role: "test",
      };

      mockUsers[newUserId] = newUser;
      setCurrentUser(newUser);
      setSuccess(`Test user created successfully! User ID: ${newUserId}`);
      setShowCreateDialog(false);
    } catch (err) {
      setError("Failed to create test user");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (newRole: "subscribed" | "employee" | "test") => {
    if (!currentUser) return;

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800));

      const updatedUser = { ...currentUser, role: newRole };
      setCurrentUser(updatedUser);
      mockUsers[currentUser.id] = updatedUser;
      setSuccess(`User role updated to ${newRole}`);
    } catch (err) {
      setError("Failed to update user role");
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "employee":
        return "default";
      case "subscribed":
        return "secondary";
      case "test":
        return "outline";
      default:
        return "outline";
    }
  };

  const getSubscriptionBadgeVariant = (status: string) => {
    return status === "subscribed" ? "default" : "secondary";
  };

  return (
    <div>
      <PageHeader
        title="Users"
        breadcrumbs={[{ title: "Users" }]}
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/50 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Create Test User Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-green-600" />
                <CardTitle>Create Test User</CardTitle>
              </div>
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create Test User
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Test User</DialogTitle>
                    <DialogDescription>
                      This will create a new test user with default settings. The user will have a randomly generated ID and email.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex gap-2 mt-4">
                    <Button
                      onClick={handleCreateTestUser}
                      disabled={loading}
                      className="flex-1"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Create Test User
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowCreateDialog(false)}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <CardDescription>
              Quickly create a test user for development and testing purposes.
            </CardDescription>
          </CardHeader>
        </Card>

        <Separator />

        {/* User Search Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-600" />
              <CardTitle>Search User</CardTitle>
            </div>
            <CardDescription>
              Enter a user ID to load and manage user data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-id">User ID</Label>
              <div className="flex gap-2">
                <Input
                  id="user-id"
                  placeholder="e.g., user-123, user-456, user-789"
                  value={searchUserId}
                  onChange={(e) => setSearchUserId(e.target.value)}
                  disabled={loading}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearchUser();
                    }
                  }}
                />
                <Button
                  onClick={handleSearchUser}
                  disabled={loading || !searchUserId.trim()}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Try: user-123, user-456, or user-789 for demo data
              </p>
            </div>
          </CardContent>
        </Card>

        {/* User Data Display */}
        {currentUser && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600" />
                  <CardTitle>User Details</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Badge variant={getRoleBadgeVariant(currentUser.role)}>
                    {currentUser.role}
                  </Badge>
                  <Badge variant={getSubscriptionBadgeVariant(currentUser.subscriptionStatus)}>
                    {currentUser.subscriptionStatus}
                  </Badge>
                </div>
              </div>
              <CardDescription>
                Viewing data for user: {currentUser.id}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* User Metadata Table */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">User Metadata</h3>
                <div className="border rounded-lg">
                  <div className="grid grid-cols-2 gap-0 text-sm">
                    <div className="p-3 font-medium bg-muted border-b border-r">Name</div>
                    <div className="p-3 border-b">{currentUser.name}</div>

                    <div className="p-3 font-medium bg-muted border-b border-r">Email</div>
                    <div className="p-3 border-b">{currentUser.email}</div>

                    <div className="p-3 font-medium bg-muted border-b border-r">Phone Number</div>
                    <div className="p-3 border-b">{currentUser.phoneNumber}</div>

                    <div className="p-3 font-medium bg-muted border-b border-r">Subscription Status</div>
                    <div className="p-3 border-b">
                      <Badge variant={getSubscriptionBadgeVariant(currentUser.subscriptionStatus)}>
                        {currentUser.subscriptionStatus}
                      </Badge>
                    </div>

                    <div className="p-3 font-medium bg-muted border-r">User ID</div>
                    <div className="p-3 font-mono text-xs">{currentUser.id}</div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Role Management */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Role Management</h3>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">Current Role:</span>
                  <Badge variant={getRoleBadgeVariant(currentUser.role)}>
                    {currentUser.role}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={loading}>
                        <Edit className="h-4 w-4 mr-2" />
                        Change Role
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={() => handleRoleChange("subscribed")}
                        disabled={currentUser.role === "subscribed"}
                      >
                        Subscribed
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleRoleChange("employee")}
                        disabled={currentUser.role === "employee"}
                      >
                        Employee
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleRoleChange("test")}
                        disabled={currentUser.role === "test"}
                      >
                        Test
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-xs text-muted-foreground">
                  • Subscribed: Regular paying user
                  • Employee: Internal company user
                  • Test: Development/testing user
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Usage Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• User data is currently using mock data for demonstration</p>
            <p>• Search functionality simulates API calls with loading states</p>
            <p>• Role changes are applied immediately and persist during the session</p>
            <p>• Test users can be created with randomly generated IDs and emails</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}