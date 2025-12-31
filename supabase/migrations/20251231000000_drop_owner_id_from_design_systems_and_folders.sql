begin;

-- Drop owner_id column from design_systems table
ALTER TABLE design_systems
DROP COLUMN IF EXISTS owner_id;

-- Drop owner_id column from folders table
ALTER TABLE folders
DROP COLUMN IF EXISTS owner_id;

-- Enable RLS on design_systems table
ALTER TABLE design_systems ENABLE ROW LEVEL SECURITY;

-- Enable RLS on folders table
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- RLS policies for design_systems table

-- Team members can view design systems
CREATE POLICY "Team members can view design systems"
ON design_systems
FOR SELECT
TO authenticated
USING (public.is_team_member(team_id));

-- Team members with edit privileges can insert design systems
CREATE POLICY "Team members with edit privileges can insert design systems"
ON design_systems
FOR INSERT
TO authenticated
WITH CHECK (public.is_team_member_with_edit_privileges(team_id));

-- Team members with edit privileges can update design systems
CREATE POLICY "Team members with edit privileges can update design systems"
ON design_systems
FOR UPDATE
TO authenticated
USING (public.is_team_member_with_edit_privileges(team_id))
WITH CHECK (public.is_team_member_with_edit_privileges(team_id));

-- Team members with edit privileges can delete design systems
CREATE POLICY "Team members with edit privileges can delete design systems"
ON design_systems
FOR DELETE
TO authenticated
USING (public.is_team_member_with_edit_privileges(team_id));

-- RLS policies for folders table

-- Team members can view folders
CREATE POLICY "Team members can view folders"
ON folders
FOR SELECT
TO authenticated
USING (public.is_team_member(team_id));

-- Team members with edit privileges can insert folders
CREATE POLICY "Team members with edit privileges can insert folders"
ON folders
FOR INSERT
TO authenticated
WITH CHECK (public.is_team_member_with_edit_privileges(team_id));

-- Team members with edit privileges can update folders
CREATE POLICY "Team members with edit privileges can update folders"
ON folders
FOR UPDATE
TO authenticated
USING (public.is_team_member_with_edit_privileges(team_id))
WITH CHECK (public.is_team_member_with_edit_privileges(team_id));

-- Team members with edit privileges can delete folders
CREATE POLICY "Team members with edit privileges can delete folders"
ON folders
FOR DELETE
TO authenticated
USING (public.is_team_member_with_edit_privileges(team_id));

commit;
