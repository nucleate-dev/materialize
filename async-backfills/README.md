# Async Backfills

This directory contains scripts for performing database backfills and migrations.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Fill in the environment variables in `.env`:
```
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Scripts

### Update .gitignore Files

Updates the `.gitignore` file for all prototypes in the `prototype_files` table.

**Usage:**
```bash
npm run update-gitignore
```

**What it does:**
- Reads the `.gitignore` file from `starters/starter-app-stylesheets/`
- Fetches all prototypes from the database in batches (100 at a time)
- Upserts the `.gitignore` file for each prototype in the `prototype_files` table
- Processes efficiently by batching both reads and writes

**Features:**
- ✅ Batch processing for efficiency
- ✅ Progress reporting
- ✅ Error handling with detailed messages
- ✅ Environment validation
- ✅ Uses `upsert` to handle both inserts and updates

### List Storage Thumbnails

Lists and analyzes all files in the `prototype-thumbnails` Supabase storage bucket.

**Usage:**
```bash
npm run list-storage-thumbnails
```

**What it does:**
- Connects to the `prototype-thumbnails` storage bucket
- Lists all files in batches (1000 at a time)
- Generates comprehensive statistics including:
  - Total file count and size
  - File type breakdown with percentages
  - Largest and smallest files
  - Average file size
  - Sample file listing

**Features:**
- ✅ Batch fetching for large buckets
- ✅ Detailed statistics and analytics
- ✅ Human-readable file sizes
- ✅ File type distribution analysis
- ✅ Sample file preview

**Output example:**
```
📊 STORAGE BUCKET STATISTICS
======================================================================

📁 Overall Statistics:
   Total Files: 1,234
   Total Size: 45.67 MB
   Average File Size: 37.02 KB

📈 Largest File:
   Name: prototype-abc123.png
   Size: 2.5 MB

📝 File Types Breakdown:
   .png              856 files  (69.4%)  32.1 MB
   .jpg              378 files  (30.6%)  13.57 MB
```

## Adding New Scripts

When adding new backfill scripts:

1. Create a new `.js` file in the `backfills/` directory
2. Follow the same pattern as existing scripts:
   - Load environment variables
   - Validate configuration
   - Process data in batches
   - Provide progress feedback
   - Handle errors gracefully
3. Add a script entry in `package.json`
4. Document it in this README
