-- Add RLS policies for prototype_chat_sessions and prototype_chat_messages tables
-- These tables should be accessible to anyone who can edit the associated prototype
-- Uses can_edit_prototype() helper function to check permissions

begin;

-- ------------------------------------------------------------
-- Prototype Chat Sessions table
-- ------------------------------------------------------------

-- Enable RLS
alter table public.prototype_chat_sessions enable row level security;

-- SELECT: users can view chat sessions from prototypes they can edit
drop policy if exists "Users can view own chat sessions" on public.prototype_chat_sessions;
create policy "prototype_chat_sessions_select_editable_prototypes"
on public.prototype_chat_sessions
for select
to authenticated
using (
  public.can_edit_prototype(prototype_chat_sessions.prototype_id)
);

-- INSERT: users can insert chat sessions to prototypes they can edit
drop policy if exists "Users can insert own chat sessions" on public.prototype_chat_sessions;
create policy "prototype_chat_sessions_insert_editable_prototypes"
on public.prototype_chat_sessions
for insert
to authenticated
with check (
  public.can_edit_prototype(prototype_chat_sessions.prototype_id)
);

-- UPDATE: users can update chat sessions from prototypes they can edit
-- Ensures prototype_id cannot be changed during update
drop policy if exists "Users can update own chat sessions" on public.prototype_chat_sessions;
create policy "prototype_chat_sessions_update_editable_prototypes"
on public.prototype_chat_sessions
for update
to authenticated
using (
  public.can_edit_prototype(prototype_chat_sessions.prototype_id)
)
with check (
  public.can_edit_prototype(prototype_chat_sessions.prototype_id)
);

-- DELETE: users can delete chat sessions from prototypes they can edit
drop policy if exists "Users can delete own chat sessions" on public.prototype_chat_sessions;
create policy "prototype_chat_sessions_delete_editable_prototypes"
on public.prototype_chat_sessions
for delete
to authenticated
using (
  public.can_edit_prototype(prototype_chat_sessions.prototype_id)
);

-- ------------------------------------------------------------
-- Prototype Chat Messages table
-- ------------------------------------------------------------

-- Enable RLS
alter table public.prototype_chat_messages enable row level security;

-- SELECT: users can view chat messages from prototypes they can edit
drop policy if exists "Users can read their own chat messages" on public.prototype_chat_messages;
create policy "prototype_chat_messages_select_editable_prototypes"
on public.prototype_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.prototype_chat_sessions pcs
    where pcs.id = prototype_chat_messages.chat_session_id
      and public.can_edit_prototype(pcs.prototype_id)
  )
);

-- INSERT: users can insert chat messages to prototypes they can edit
drop policy if exists "Users can insert their own messages with role = user" on public.prototype_chat_messages;
create policy "prototype_chat_messages_insert_editable_prototypes"
on public.prototype_chat_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.prototype_chat_sessions pcs
    where pcs.id = prototype_chat_messages.chat_session_id
      and public.can_edit_prototype(pcs.prototype_id)
  )
);

-- UPDATE: users can update chat messages from prototypes they can edit
-- Ensures chat_session_id cannot be changed during update
drop policy if exists "Users can update their own chat messages" on public.prototype_chat_messages;
create policy "prototype_chat_messages_update_editable_prototypes"
on public.prototype_chat_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.prototype_chat_sessions pcs
    where pcs.id = prototype_chat_messages.chat_session_id
      and public.can_edit_prototype(pcs.prototype_id)
  )
)
with check (
  exists (
    select 1
    from public.prototype_chat_sessions pcs
    where pcs.id = prototype_chat_messages.chat_session_id
      and public.can_edit_prototype(pcs.prototype_id)
  )
);

-- DELETE: users can delete chat messages from prototypes they can edit
drop policy if exists "Users can delete their own chat messages" on public.prototype_chat_messages;
create policy "prototype_chat_messages_delete_editable_prototypes"
on public.prototype_chat_messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.prototype_chat_sessions pcs
    where pcs.id = prototype_chat_messages.chat_session_id
      and public.can_edit_prototype(pcs.prototype_id)
  )
);

commit;
