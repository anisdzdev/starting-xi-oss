-- GIF messages (Discord-style): we store only a REFERENCE to the GIF hosted on
-- Tenor's CDN — the url + its dimensions — never the image bytes. A message is
-- now valid with either text OR a gif_url.

alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages alter column body drop not null;

alter table public.chat_messages
  add column gif_url text,
  add column gif_width integer,
  add column gif_height integer;

alter table public.chat_messages
  add constraint chat_messages_content_check check (
    (body is not null and char_length(body) between 1 and 2000)
    or (gif_url is not null and char_length(gif_url) <= 1000)
  );
