# Control Plane Scripts

This directory contains utility scripts for the control-plane service.

## sync-types.js

### Purpose

Automatically synchronizes `types/PublicAPITypes.ts` from the control-plane to the web-application's type definitions. This ensures the frontend always has the latest API type definitions without manual copying.

### Files

- **Source**: `@server/control-plane/types/PublicAPITypes.ts`
- **Target**: `@web-application/src/lib/types/serverAPITypes.ts`

### Usage

#### Manual Sync

```bash
npm run sync-types
```

#### Automatic Sync

The sync happens automatically during the build process:

```bash
npm run build
```

The sync is integrated into the `prebuild` script, so it runs before:

- TypeScript compilation
- Any deployment process
- CI/CD builds

### Features

- ✅ **Automatic sync** on build
- ✅ **Safety checks** for source file existence
- ✅ **Directory creation** if target doesn't exist
- ✅ **Header comments** explaining auto-generation
- ✅ **Build statistics** (file size, line count)
- ✅ **Timestamp tracking** for sync verification
- ✅ **Error handling** with proper exit codes

### Output Example

```
🔄 Syncing API types from control-plane to web-application...
✅ Successfully synced types to: /path/to/serverAPITypes.ts
📊 File size: 3.75 KB
📝 Lines synced: 142
```

### Generated File Header

The synced file includes a header that:

- Clearly marks it as auto-generated
- References the source file location
- Provides instructions for updates
- Includes the last sync timestamp

### Integration with Build Process

```json
{
  "scripts": {
    "sync-types": "node scripts/sync-types.js",
    "prebuild": "npm run lint:check && npm run sync-types",
    "build": "tsc -p ."
  }
}
```

### Error Handling

The script will:

- Exit with code 1 if source file is missing
- Exit with code 1 if sync operation fails
- Create target directory if it doesn't exist
- Provide clear error messages for debugging

### Development Workflow

1. Modify API types in `types/PublicAPITypes.ts`
2. Run `npm run build` or `npm run sync-types`
3. Types are automatically available in web-application
4. No manual copying or git commits needed for the target file
