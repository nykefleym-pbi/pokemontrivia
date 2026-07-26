-- Reword the 22 curated questions that wrote their own answer into the stem.
--
-- Found by scanning all 4000 for a correct option that appears verbatim as a
-- multi-word phrase in its own question while no distractor does — "What is the
-- term for entry hazards like Stealth Rock and Spikes…?" answered by "Entry
-- hazards". A deliberately looser scan (any 5+ character word shared with the
-- stem and absent from every distractor) flags 275 rows, but nearly all of those
-- are unavoidable: you cannot ask which type Dragon moves are strong against
-- without writing "Dragon". These 22 are the ones where the stem hands over the
-- answer outright.
--
-- Only the stem is reworded, so `correct_index` and the distractors are
-- untouched — except for the two Paldean Tauros rows, which were not merely
-- leaky but UNANSWERABLE: both marked "Paldean Tauros" (not a breed) as correct
-- while the actual breed — Blaze Breed for Fighting/Fire, Aqua Breed for
-- Fighting/Water — was missing from the options entirely. Those get the right
-- answer put in, still at index 0.
--
-- One factual correction rides along: the Fairy-type row claimed Fairy was
-- retired "starting with the Sun & Moon era". It was discontinued during the
-- Sword & Shield era. Since the stem had to be rewritten anyway, leaving a
-- known-wrong date in place would have been the worse choice.

update public.curated_questions set question = case id

  when 'bbe3a214-20eb-4903-aeb2-f6aa33ad9ea6' then
    'How is the recurring voice that opens and recaps Pokémon anime episodes credited?'
  when '7799c160-3145-4b08-8597-e9750d2c157d' then
    'What do Team GO Rocket Grunts and Leaders take over, temporarily disabling them?'
  when '62f0c6cc-0df1-45c0-b505-58a40da75e3a' then
    'What is the name of the mechanic where each Pokémon has a unique ability it can randomly trigger while sleeping nearby?'
  when 'bdd68b92-1243-4b49-8cb2-a14e8da9aba6' then
    'What is the term for the in-game value that determines how likely a Pokémon is to be male or female?'
  when '0fb6947c-f673-481d-bd15-ebb56b02ccf2' then
    'What is the name of the tournament bracket, introduced in Sword and Shield, that decides who gets to challenge the Champion?'
  when '362be44b-77f9-4c00-9723-1054b14772f0' then
    'What is the term for a move that deals no direct damage but instead alters stats, conditions, or the field?'
  when '4181d24c-f23b-4f96-8169-7ffdfef1a728' then
    'What is the term for the class of moves, such as Stealth Rock and Spikes, that damage Pokémon as they switch in?'
  when 'd82e1828-a640-4146-9200-00e7ccebdeb4' then
    'In Legends: Arceus, what must players complete to fill in a Pokédex page, rather than simply catching one of each Pokémon?'
  when 'ca60467e-ec8f-416b-9001-7dd219eb18dc' then
    'What reward is given for completing the National or Regional Pokédex?'
  when 'abafd4da-434f-4450-9527-ae3dd295685b' then
    'Which Main Skill shortens the gap between a Pokémon''s gathering trips, letting it bring items more often?'
  when '82ccd299-d9a1-4eab-9d61-b5bed4cf3400' then
    'What is the name of Lusamine''s artificial island facility, the base of the Aether Foundation?'
  when '5668e6fc-cf81-4b6c-91d7-d99c59f9c372' then
    'Which EX-era card rarity, introduced in the FireRed & LeafGreen era, marked rare Shiny Pokémon with a small symbol beside their name?'
  when '788ba42d-845f-42c4-b452-61e2b7fd0bbc' then
    'Which expansion introduced Dark-type Pokémon cards themed around the villainous organisation from Kanto?'
  when 'b827dbfb-5643-444e-b976-1c4574512f83' then
    'Which TCG card type, used as both an Energy and a Pokémon type, was discontinued during the Sword & Shield era?'
  when '7367fa8c-a2ed-486d-b337-a47538d7e286' then
    'Which feature in Legends: Arceus must be completed to fill in each Pokédex entry?'
  when '6e502d85-7707-4a80-bdf0-32c1d34f6d6e' then
    'Which Nintendo 3DS game about a talking Pikachu who solves mysteries later inspired a 2019 live-action/animated hybrid film of the same name?'
  when 'ca2a00be-28dc-4c7e-ba97-575508b6d9a0' then
    'Which Paldean Tauros breed is Fighting/Fire?'
  when 'd3d95422-103d-42bd-8e48-4882dc4f6e94' then
    'Which Paldean Tauros breed is Fighting/Water?'
  when '3df6467f-8a4b-4664-8fc0-6623a2196c30' then
    'Which status condition deals more damage on each successive turn, rather than a flat amount?'
  when '8a2d97ad-c297-4784-9abf-d3394f2c79d4' then
    'Which Sword & Shield-era set was branded around the mobile spin-off with real-world map gameplay, and featured Radiant Eevee?'
  when '50a10cdd-6543-4570-823f-aa2e65743ce8' then
    'Which pair of professors are the version-exclusive professor characters in Paldea''s Scarlet and Violet?'
  when 'abff6f76-2144-4c76-a27f-5babb3168b05' then
    'Which Gen IX item maxes out one of a Pokémon''s IVs through Hyper Training?'
  else question end
where id in (
  'bbe3a214-20eb-4903-aeb2-f6aa33ad9ea6','7799c160-3145-4b08-8597-e9750d2c157d',
  '62f0c6cc-0df1-45c0-b505-58a40da75e3a','bdd68b92-1243-4b49-8cb2-a14e8da9aba6',
  '0fb6947c-f673-481d-bd15-ebb56b02ccf2','362be44b-77f9-4c00-9723-1054b14772f0',
  '4181d24c-f23b-4f96-8169-7ffdfef1a728','d82e1828-a640-4146-9200-00e7ccebdeb4',
  'ca60467e-ec8f-416b-9001-7dd219eb18dc','abafd4da-434f-4450-9527-ae3dd295685b',
  '82ccd299-d9a1-4eab-9d61-b5bed4cf3400','5668e6fc-cf81-4b6c-91d7-d99c59f9c372',
  '788ba42d-845f-42c4-b452-61e2b7fd0bbc','b827dbfb-5643-444e-b976-1c4574512f83',
  '7367fa8c-a2ed-486d-b337-a47538d7e286','6e502d85-7707-4a80-bdf0-32c1d34f6d6e',
  'ca2a00be-28dc-4c7e-ba97-575508b6d9a0','d3d95422-103d-42bd-8e48-4882dc4f6e94',
  '3df6467f-8a4b-4664-8fc0-6623a2196c30','8a2d97ad-c297-4784-9abf-d3394f2c79d4',
  '50a10cdd-6543-4570-823f-aa2e65743ce8','abff6f76-2144-4c76-a27f-5babb3168b05'
);

-- The two unanswerable Tauros rows: put the real breed in at index 0.
update public.curated_questions
set options = jsonb_set(options, '{0}', '"Blaze Breed"')
where id = 'ca2a00be-28dc-4c7e-ba97-575508b6d9a0';

update public.curated_questions
set options = jsonb_set(options, '{0}', '"Aqua Breed"')
where id = 'd3d95422-103d-42bd-8e48-4882dc4f6e94';

-- Guards: nothing lost its choices, and no option is now duplicated within a row
-- (Blaze Breed / Aqua Breed already appeared as a distractor in the OTHER row,
-- not in the one being edited — worth asserting rather than assuming).
do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.curated_questions
  where jsonb_array_length(options) <> 4
     or (select count(distinct x.value) from jsonb_array_elements_text(options) x) <> 4;
  if v_bad > 0 then
    raise exception '% rows have missing or duplicated options', v_bad;
  end if;
end $$;
