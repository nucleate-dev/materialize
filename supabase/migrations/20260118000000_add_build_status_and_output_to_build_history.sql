-- Add build_status enum and build_output columns to prototype_build_history table
-- This allows tracking of build success/failure and storing build logs

begin;

-- Create the prototype_build_status enum type
create type public.prototype_build_status as enum ('in_progress', 'success', 'failure');

-- Add build_status column with default 'in_progress'
alter table public.prototype_build_history
add column build_status public.prototype_build_status default 'in_progress';

-- Add build_output column to store build logs
alter table public.prototype_build_history
add column build_output text;

-- Set all existing rows to 'success' since they are completed builds
update public.prototype_build_history
set build_status = 'success'
where build_status = 'in_progress';

commit;
