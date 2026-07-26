-- The Training bot's item must heal the BOT, not the player.
--
-- `use_bot_pvp_live_item` exists so the bot can use an item on its own turn.
-- It never did. It was a copy of `use_pvp_live_item` with `v_i_am_host` pinned
-- to true, so every line operated on the HOST's side:
--
--     v_self_hp := v_match.host_hp;                     -- "self" = the player
--     update ... set host_hp = v_self_hp,
--                    host_items_used = host_items_used + 1;
--     insert into pvp_live_effects (source_id, ...) values (v_uid, ...);
--
-- The host's client drives the bot, so `auth.uid()` is the player either way and
-- nothing rejected it. The result: when the bot decided to heal, the PLAYER
-- gained 60 HP out of nowhere, the PLAYER's 3-item allowance was spent, and the
-- effect was logged under the PLAYER's id — which also meant the opponent-item
-- toast was suppressed, since the client skips effects it sourced itself.
--
-- Owner reported this three times as "my HP went up and I used no item". Each
-- time the effect log showed a Super Potion attributed to them, and each time it
-- was read as their own. The tell was timing: the potions land ~1s after the
-- BOT's answer resolves, which is the bot's item decision point, not a human
-- opening the bag. (Berries in those same matches WERE the player's — those go
-- through `use_pvp_live_item` and target the opponent.)
--
-- Two further consequences of the same line-up, fixed here too:
--   * `guest_items_used` never incremented, so the bot's own 3-item cap never
--     applied — the client gates on it (`botShouldUseItem`) and it was frozen
--     at 0 all match.
--   * The cap that DID apply was the host's, so the bot competed with the
--     player for their three items.
--
-- Below is the same function with self/opponent as the bot sees them: self =
-- guest, opponent = host. That flips the two opponent-partner special cases as
-- well, since the bot's opponent is the player:
--   * 481 (Uxie's item lock) is checked against the HOST's partner;
--   * 802 (Marshadow's item copy) mirrors onto the HOST when the PLAYER holds
--     it — previously it mirrored onto the guest, which under the old
--     host-as-self framing was self-consistent and under this one is not.

create or replace function public.use_bot_pvp_live_item(
  _match_id uuid,
  _question_index integer,
  _item_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pvp_live_matches;
  v_effect public.pvp_item_effects;
  -- "self" is the BOT (the guest); "opp" is the player (the host).
  v_self_stages jsonb;
  v_self_statuses jsonb;
  v_self_hp int;
  v_opp_stages jsonb;
  v_opp_statuses jsonb;
  v_opp_dex int;
  v_opp_entry jsonb;
  v_marsh_used int;
  v_m_self_stages jsonb;
  v_m_self_statuses jsonb;
  v_m_self_hp int;
  v_m_opp_stages jsonb;
  v_m_opp_statuses jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select * into v_match from public.pvp_live_matches where id = _match_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- Still host-only and bot-match-only: the host's client is what drives the
  -- bot. Only the SIDE the effect lands on changes.
  if v_uid <> v_match.host_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not coalesce(v_match.is_bot_match, false) then
    return jsonb_build_object('ok', false, 'error', 'not_bot_match');
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  select * into v_effect from public.pvp_item_effects where item_id = _item_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_item');
  end if;

  -- The bot's opponent is the HOST.
  v_opp_dex := case
    when v_match.host_partner_id = 151 then v_match.host_transform_id
    else v_match.host_partner_id
  end;

  if v_opp_dex = 481 then
    v_opp_entry := coalesce(v_match.host_sig_runtime->'481', '{}'::jsonb);
    if coalesce((v_opp_entry->>'firedThisBattle')::boolean, false)
       and not coalesce((v_opp_entry->>'disabled')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'item_locked');
    end if;
  end if;

  -- The bot spends the BOT's allowance.
  if v_match.guest_items_used >= 3 then
    return jsonb_build_object('ok', false, 'error', 'item_cap');
  end if;

  v_self_stages := v_match.guest_stages;
  v_self_statuses := v_match.guest_statuses;
  v_self_hp := v_match.guest_hp;
  v_opp_stages := v_match.host_stages;
  v_opp_statuses := v_match.host_statuses;

  if v_effect.kind = 'heal' then
    if (v_effect.payload->>'full')::boolean is true then
      v_self_hp := 120;
    else
      v_self_hp := least(120, v_self_hp + coalesce((v_effect.payload->>'amount')::int, 0));
    end if;
  elsif v_effect.kind = 'stat_stage' then
    if v_effect.target = 'self' then
      v_self_stages := public._pvp_bump_stage(v_self_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
    else
      v_opp_stages := public._pvp_bump_stage(v_opp_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
    end if;
  elsif v_effect.kind = 'status' then
    if v_effect.target = 'self' then
      v_self_statuses := public._pvp_apply_status(v_self_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
    else
      v_opp_statuses := public._pvp_apply_status(v_opp_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
    end if;
  elsif v_effect.kind = 'cure' then
    v_self_statuses := public._pvp_cure_status(v_self_statuses, v_effect.payload->>'status');
  end if;

  update public.pvp_live_matches set
    guest_hp = v_self_hp,
    guest_stages = v_self_stages,
    guest_statuses = v_self_statuses,
    host_stages = v_opp_stages,
    host_statuses = v_opp_statuses,
    guest_items_used = guest_items_used + 1
  where id = _match_id;

  -- Sourced to the GUEST so the player's client recognises it as the
  -- opponent's and actually announces it.
  insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, kind, payload)
  values (_match_id, _question_index, v_match.guest_id, v_effect.target, _item_id, v_effect.kind, v_effect.payload);

  select * into v_match from public.pvp_live_matches where id = _match_id;

  -- Marshadow copies the item its OPPONENT used — here that is the player.
  if v_opp_dex = 802 then
    v_opp_entry := coalesce(v_match.host_sig_runtime->'802', '{}'::jsonb);
    v_marsh_used := v_match.host_items_used;
    if not coalesce((v_opp_entry->>'disabled')::boolean, false) and v_marsh_used < 3 then
      v_m_self_stages := v_match.host_stages;
      v_m_self_statuses := v_match.host_statuses;
      v_m_self_hp := v_match.host_hp;
      v_m_opp_stages := v_match.guest_stages;
      v_m_opp_statuses := v_match.guest_statuses;

      if v_effect.kind = 'heal' then
        if (v_effect.payload->>'full')::boolean is true then
          v_m_self_hp := 120;
        else
          v_m_self_hp := least(120, v_m_self_hp + coalesce((v_effect.payload->>'amount')::int, 0));
        end if;
      elsif v_effect.kind = 'stat_stage' then
        if v_effect.target = 'self' then
          v_m_self_stages := public._pvp_bump_stage(v_m_self_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
        else
          v_m_opp_stages := public._pvp_bump_stage(v_m_opp_stages, v_effect.payload->>'stat', (v_effect.payload->>'delta')::int);
        end if;
      elsif v_effect.kind = 'status' then
        if v_effect.target = 'self' then
          v_m_self_statuses := public._pvp_apply_status(v_m_self_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
        else
          v_m_opp_statuses := public._pvp_apply_status(v_m_opp_statuses, v_effect.payload->>'status', coalesce((v_effect.payload->>'questions')::int, 3));
        end if;
      elsif v_effect.kind = 'cure' then
        v_m_self_statuses := public._pvp_cure_status(v_m_self_statuses, v_effect.payload->>'status');
      end if;

      update public.pvp_live_matches set
        host_hp = v_m_self_hp,
        host_stages = v_m_self_stages,
        host_statuses = v_m_self_statuses,
        guest_stages = v_m_opp_stages,
        guest_statuses = v_m_opp_statuses,
        host_items_used = host_items_used + 1
      where id = _match_id;

      insert into public.pvp_live_effects (match_id, question_index, source_id, target, item_id, kind, payload)
      values (_match_id, _question_index, v_match.host_id, v_effect.target, _item_id, v_effect.kind, v_effect.payload);

      select * into v_match from public.pvp_live_matches where id = _match_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'rev', v_match.rev,
    'hostHp', v_match.host_hp,
    'guestHp', v_match.guest_hp,
    'hostStages', v_match.host_stages,
    'guestStages', v_match.guest_stages,
    'hostStatuses', v_match.host_statuses,
    'guestStatuses', v_match.guest_statuses
  );
end;
$$;
