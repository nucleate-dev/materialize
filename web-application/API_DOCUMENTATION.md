# Create Prototype API Documentation

## Overview
The Create Prototype API endpoint provides JWT authentication, paywalling (5 max prototypes for free users), and supports both new prototype creation and forking existing prototypes.

## Endpoint
```
POST /api/create-prototype
```

## Authentication
Requires a valid JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Request Body

### For New Prototype Creation
```json
{
  "name": "My New App",
  "description": "A React Native app built with Materialize",
  "project_id": "optional-project-id",
  "visibility": "PUBLIC" // or "SELF" (defaults based on subscription)
}
```

### For Forking an Existing Prototype
```json
{
  "name": "My Forked App",
  "description": "A fork of an existing prototype",
  "project_id": "optional-project-id",
  "prototype_id": "existing-prototype-id-to-fork",
  "visibility": "PUBLIC"
}
```

## Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "prototype_id": "new-prototype-uuid",
    "viewing_url": "https://cloudfront-url/prototypes/prototype-id/index.html"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "ERROR_TYPE",
  "message": "Human readable error message"
}
```

## Error Types
- `UNAUTHORIZED`: Invalid or missing JWT token
- `PROTOTYPE_LIMIT_REACHED`: Free users have reached their 5 prototype limit
- `DATABASE_ERROR`: Database operation failed
- `S3_ERROR`: S3 storage operation failed
- `INVALID_REQUEST`: Missing required fields

## Features

### JWT Authentication
- Validates JWT tokens using Supabase Auth
- Extracts user ID and subscription information
- Ensures only authenticated users can create prototypes

### Paywalling
- Free users: Maximum 5 prototypes
- Pro/Team users: Unlimited prototypes
- Automatic limit checking before prototype creation

### Prototype Creation
- Creates new prototype in database
- Generates unique prototype ID
- Sets default visibility based on subscription plan
- Copies default app files to database
- Copies default app files to S3 bucket

### Prototype Forking
- Copies all files from source prototype
- Creates new prototype with copied files
- Copies S3 bucket contents to new location
- Maintains file structure and content

### S3 Integration
- Automatically manages S3 bucket operations
- Copies files between bucket prefixes
- Generates CloudFront viewing URLs
- Handles cleanup on failures

## Environment Variables Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# JWT
JWT_SECRET=your_jwt_secret

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_PROTOTYPE_BUCKET=materialize-sites
```

## Example Usage

### Create New Prototype
```bash
curl -X POST /api/create-prototype \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First App",
    "description": "A simple React Native app"
  }'
```

### Fork Existing Prototype
```bash
curl -X POST /api/create-prototype \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Forked App",
    "description": "A fork of an existing app",
    "prototype_id": "existing-prototype-uuid"
  }'
```

## Database Schema

### Prototypes Table
- `id`: Unique identifier
- `name`: Prototype name
- `description`: Optional description
- `owner_id`: User who owns the prototype
- `project_id`: Optional project association
- `visibility`: PUBLIC or SELF
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

### Prototype Files Table
- `id`: Unique identifier
- `prototype_id`: Reference to prototype
- `name`: File name/path
- `contents`: File content
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

## S3 Bucket Structure

```
materialize-prototypes/
├── default-app/           # Default app files
│   ├── index.html
│   ├── App.js
│   └── ...
└── prototypes/
    ├── prototype-id-1/    # Individual prototype files
    │   ├── index.html
    │   ├── App.js
    │   └── ...
    └── prototype-id-2/
        ├── index.html
        ├── App.js
        └── ...
```

## Error Handling

The API includes comprehensive error handling:
- Authentication failures return 401
- Authorization failures return 403
- Validation errors return 400
- Server errors return 500
- Automatic cleanup on partial failures
- Detailed error messages for debugging

## Security Features

- JWT token validation
- User authentication required
- Subscription-based access control
- Automatic cleanup on failures
- No sensitive data exposure in errors 