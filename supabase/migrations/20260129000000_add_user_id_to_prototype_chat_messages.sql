-- Add user_id column to prototype_chat_messages table
-- This allows tracking which user sent each message in collaborative scenarios

begin;

-- Add user_id column with foreign key to users table
-- Nullable to support existing messages and system/assistant messages
alter table public.prototype_chat_messages
add column if not exists user_id uuid references public.users(id) on delete set null;

-- Create index for efficient user-based queries
create index if not exists idx_prototype_chat_messages_user_id
on public.prototype_chat_messages(user_id);

-- Backfill existing user messages with the user_id from the chat session
-- This sets user_id for historical messages based on who created the session
update public.prototype_chat_messages pcm
set user_id = pcs.user_id
from public.prototype_chat_sessions pcs
where pcm.chat_session_id = pcs.id
  and pcm.role = 'user'
  and pcm.user_id is null;

commit;
