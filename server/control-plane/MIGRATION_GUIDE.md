# API Migration Guide

This document tracks the migration of APIs from Vercel serverless functions to the Fastify control-plane server.

## Completed Migrations

### 1. `/payments/manage-billing` (POST)

**Original:** `@web-application/src/app/api/payments/manage-billing/route.ts`  
**Migrated to:** `@server/control-plane/services/StripeManagementService.ts`

#### Changes Made:
- ✅ **Service Creation**: Created `StripeManagementService.ts` with proper route registration
- ✅ **Type Definitions**: Added types to `PublicAPITypes.ts`:
  - `ManageBillingRequestBody`
  - `ManageBillingSuccessResponse` 
  - `ManageBillingResponse`
- ✅ **Environment Variables**: Added to `.env`:
  - `STRIPE_SECRET_KEY`
  - `JWT_SECRET`
  - `POSTHOG_KEY`
  - `POSTHOG_HOST`
  - `SITE_BASE_URL`
- ✅ **Dependencies**: Added to `package.json`:
  - `stripe` (v17.4.0)
  - `jsonwebtoken` (v9.0.2)
  - `@types/jsonwebtoken` (v9.0.7)
- ✅ **Server Integration**: Registered service in `server.ts`

#### API Details:
- **Endpoint**: `POST /payments/manage-billing`
- **Authentication**: Bearer JWT token in Authorization header
- **Request Body**: Empty (user ID extracted from JWT)
- **Response**: `{ redirect_url: string }` or error

#### Example Usage:
```bash
curl -X POST http://localhost:3000/payments/manage-billing \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Response Format:
```typescript
// Success (200)
{
  "redirect_url": "https://billing.stripe.com/session/abc123..."
}

// Error (400/401/500)
{
  "error": "Error Type",
  "message": "Error description"
}
```

#### Error Handling:
- **401**: Missing or invalid JWT token
- **400**: Missing user ID or user data fetch errors
- **500**: Stripe API errors or internal server errors

#### Logging:
- Simplified console logging (PostHog integration commented for future use)
- All error events logged with user context

#### Client-Side Migration:
- ✅ **Updated `SubscriptionManagementUtils.ts`**: Now uses control-plane endpoint
- ✅ **Type Safety**: Uses synced types from `serverAPITypes.ts`
- ✅ **Error Handling**: Improved error handling with proper HTTP status codes
- ✅ **Environment Variable**: Uses `NEXT_PUBLIC_SERVER_ENDPOINT` from .env

**Before:**
```typescript
const response = await fetch("/api/payments/manage-billing", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${session.session.access_token}`,
  },
});
```

**After:**
```typescript
const response = await fetch(`${serverEndpoint}/payments/manage-billing`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${session.session.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({} as ManageBillingRequestBody),
});
```

---

## Environment Variables Setup

Make sure to update your `.env` file with the following variables:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here

# JWT Configuration  
JWT_SECRET=your_jwt_secret_here

# PostHog Analytics (optional)
POSTHOG_KEY=your_posthog_key_here
POSTHOG_HOST=https://app.posthog.com

# Site Configuration
SITE_BASE_URL=http://localhost:3000
```

## Next Migrations

The following APIs are candidates for migration:

- [ ] `/payments/checkout`
- [ ] `/payments/handle-subscription`
- [ ] `/files/save-and-build`
- [ ] `/files/start-dev-server`
- [ ] `/files/update-files`
- [ ] `/prototype/create`
- [ ] `/prototype/fetch-view`
- [ ] `/chat`

## Migration Process

1. **Analyze Existing Route**: Read the Vercel route implementation
2. **Create Service**: Create new service in `services/` directory
3. **Define Types**: Add request/response types to `PublicAPITypes.ts`
4. **Update Environment**: Add required environment variables to `.env`
5. **Install Dependencies**: Add any new npm packages needed
6. **Register Service**: Add service registration to `server.ts`
7. **Test Build**: Ensure everything compiles and passes linting
8. **Update Documentation**: Document the migration in this guide