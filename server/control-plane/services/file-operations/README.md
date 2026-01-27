# File Operations Service

Provides file CRUD operations for prototypes via the control-plane API. These endpoints allow external tools (MCP server, API clients) to read and write prototype files without needing direct sandbox access.

## API Endpoints

All endpoints require authentication via `Authorization: Bearer <token>` header.
Accepts both JWT tokens and API keys (`nuc_...`).

### List Files

```
POST /files/list
Content-Type: application/json

{
  "prototype_id": "uuid"
}

Response:
{
  "data": {
    "files": [
      {
        "name": "src/App.tsx",
        "type": "text",
        "updated_at": "2024-01-15T00:00:00Z"
      },
      {
        "name": "assets/logo.png",
        "type": "binary",
        "updated_at": "2024-01-14T00:00:00Z"
      }
    ]
  },
  "error": null
}
```

### Read File

```
POST /files/read
Content-Type: application/json

{
  "prototype_id": "uuid",
  "file_path": "src/App.tsx"
}

Response (text file):
{
  "data": {
    "file_path": "src/App.tsx",
    "content": "import React from 'react'...",
    "type": "text"
  },
  "error": null
}

Response (binary file):
{
  "data": {
    "file_path": "assets/logo.png",
    "content": "iVBORw0KGgo...",  // base64 encoded
    "type": "binary"
  },
  "error": null
}
```

### Write File

```
POST /files/write
Content-Type: application/json

{
  "prototype_id": "uuid",
  "file_path": "src/App.tsx",
  "content": "import React from 'react'..."
}

// For binary files, content should be base64 encoded:
{
  "prototype_id": "uuid",
  "file_path": "assets/logo.png",
  "content": "iVBORw0KGgo..."
}

Response:
{
  "data": {
    "success": true,
    "file_path": "src/App.tsx",
    "message": "File written successfully"
  },
  "error": null
}
```

### Delete File

```
POST /files/delete
Content-Type: application/json

{
  "prototype_id": "uuid",
  "file_path": "src/App.tsx"
}

Response:
{
  "data": {
    "success": true,
    "file_path": "src/App.tsx",
    "message": "File deleted successfully"
  },
  "error": null
}
```

### Read Multiple Files

```
POST /files/read-multiple
Content-Type: application/json

{
  "prototype_id": "uuid",
  "file_paths": ["src/App.tsx", "src/index.tsx", "package.json"]
}

Response:
{
  "data": {
    "files": [
      {
        "file_path": "src/App.tsx",
        "content": "import React...",
        "type": "text"
      },
      {
        "file_path": "src/index.tsx",
        "content": null,
        "type": "text",
        "error": "File not found"
      },
      {
        "file_path": "package.json",
        "content": "{\"name\":...",
        "type": "text"
      }
    ]
  },
  "error": null
}
```

## File Storage

- **Text files**: Stored in `prototype_files` table (content in `contents` column)
- **Binary files**: Stored in `prototype_assets` table (metadata) + `prototype-assets` storage bucket (content)

## Binary File Detection

Files are classified as binary based on extension:

```
Images: .png, .jpg, .jpeg, .gif, .ico, .svg, .webp, .bmp, .tiff
Fonts: .woff, .woff2, .ttf, .otf, .eot
Video: .mp4, .webm, .mov, .avi, .mkv
Audio: .mp3, .wav, .ogg, .m4a, .flac
Other: .pdf, .zip, .tar, .gz, .7z, .rar, .exe, .dll, .so, .dylib, .bin, .dat, .db, .sqlite
```

## Authorization

- **Read operations**: Require viewing access to prototype
- **Write/Delete operations**: Require edit access to prototype

Access is checked via `checkUserHasPrototypeViewingAccess()` and `checkUserHasPrototypeEditAccess()` in `prototypeAuth.ts`.
