# materialize

Repo for the AI design/UI code building software

## Prototype Development Workflo

The prototype system uses a flow where default app files are stored in S3 and synchronized with Supabase for development:

### 1. Creating a New Prototype

When creating a new prototype (non-fork), the system: ...

1. Reads default app files from S3 `default-app-raw-files/` directory
2. Inserts these files into Supabase `prototype_files` table
3. Copies compiled files from S3 `default-app/` to the prototype's S3 bucket for hosting.

### 2. Local Development

To pull prototype files locally for development:

```bash
# Pull a specific prototype to local directory
npm run pull-prototype [prototype-id] [output-directory]

# Example
npm run pull-prototype abc123 ./my-prototype
```

This will:

- Fetch all files for the prototype from Supabase .
- Create the files in the specified local directory
- Maintain the original file structure

### 3. File Synchronization

The flow ensures consistency between:

- **S3 `default-app-raw-files/`**: Source of truth for default app files
- **Supabase `prototype_files`**: Database storage for prototype file contents
- **Local dev environment**: Working copy pulled from Supabase.
