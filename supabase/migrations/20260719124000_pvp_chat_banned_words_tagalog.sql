-- Extend chat_banned_words with common Tagalog/Filipino profanity, matching
-- the same severity tier as the English placeholder seed from PR-2
-- (20260719121000_pvp_chat_rpcs.sql: fuck/shit/bitch/asshole/bastard/dick) —
-- explicit swear words only, not mild insults ("bobo", "tanga") and not
-- ambiguous common words that would false-positive on ordinary use ("hayop"
-- literally means "animal", "ulol" is too mild/context-dependent).
--
-- Stored as the single-token forms Filipino chat/text actually uses (e.g.
-- "putangina" concatenated, not "putang ina" with a space) so the existing
-- send_pvp_chat_message profanity check — which tokenizes the message on
-- whitespace and checks whole-word membership — catches them without any
-- RPC changes. Still a placeholder, same as the English seed: needs real
-- product review before this ships broadly, per docs/handoffs/global-chat.
insert into public.chat_banned_words (word) values
  ('putangina'),
  ('puta'),
  ('gago'),
  ('gaga'),
  ('tarantado'),
  ('punyeta'),
  ('kupal'),
  ('pakyu')
on conflict (word) do nothing;
