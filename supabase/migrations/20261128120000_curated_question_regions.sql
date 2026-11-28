-- Region tags for the curated bank (Paul, 2026-11-28): route battles draw questions from
-- the route's region first. A question is tagged with every region whose Pokémon, towns or
-- gym leaders it (or its options) names; it can carry several, or none ("any region").
-- New and edited questions are tagged by a trigger, so the bank never needs hand tagging.

create table if not exists public.curated_region_terms (
  region text primary key,
  pattern text not null
);
alter table public.curated_region_terms enable row level security;
-- read only through the security-definer functions below; nobody reads or writes it directly

delete from public.curated_region_terms;
insert into public.curated_region_terms (region, pattern) values
  ('Kanto', '\m(Kanto|Pallet|Viridian|Pewter|Cerulean|Vermilion|Lavender|Celadon|Fuchsia|Saffron|Cinnabar|Indigo[ .''’-]*Plateau|Brock|Misty|Lt[ .''’-]*Surge|Erika|Koga|Sabrina|Blaine|Giovanni|Bulbasaur|Ivysaur|Venusaur|Charmander|Charmeleon|Charizard|Squirtle|Wartortle|Blastoise|Caterpie|Metapod|Butterfree|Weedle|Kakuna|Beedrill|Pidgey|Pidgeotto|Pidgeot|Rattata|Raticate|Spearow|Fearow|Ekans|Arbok|Pikachu|Raichu|Sandshrew|Sandslash|Nidoran|Nidorina|Nidoqueen|Nidorino|Nidoking|Clefairy|Clefable|Vulpix|Ninetales|Jigglypuff|Wigglytuff|Zubat|Golbat|Oddish|Gloom|Vileplume|Paras|Parasect|Venonat|Venomoth|Diglett|Dugtrio|Meowth|Persian|Psyduck|Golduck|Mankey|Primeape|Growlithe|Arcanine|Poliwag|Poliwhirl|Poliwrath|Abra|Kadabra|Alakazam|Machop|Machoke|Machamp|Bellsprout|Weepinbell|Victreebel|Tentacool|Tentacruel|Geodude|Graveler|Golem|Ponyta|Rapidash|Slowpoke|Slowbro|Magnemite|Magneton|Farfetch.?d|Doduo|Dodrio|Seel|Dewgong|Grimer|Muk|Shellder|Cloyster|Gastly|Haunter|Gengar|Onix|Drowzee|Hypno|Krabby|Kingler|Voltorb|Electrode|Exeggcute|Exeggutor|Cubone|Marowak|Hitmonlee|Hitmonchan|Lickitung|Koffing|Weezing|Rhyhorn|Rhydon|Chansey|Tangela|Kangaskhan|Horsea|Seadra|Goldeen|Seaking|Staryu|Starmie|Mr[ .''’-]*Mime|Scyther|Jynx|Electabuzz|Magmar|Pinsir|Tauros|Magikarp|Gyarados|Lapras|Ditto|Eevee|Vaporeon|Jolteon|Flareon|Porygon|Omanyte|Omastar|Kabuto|Kabutops|Aerodactyl|Snorlax|Articuno|Zapdos|Moltres|Dratini|Dragonair|Dragonite|Mewtwo|Mew)\M'),
  ('Johto', '\m(Johto|New[ .''’-]*Bark|Cherrygrove|Azalea|Goldenrod|Ecruteak|Olivine|Cianwood|Mahogany|Blackthorn|Falkner|Bugsy|Whitney|Morty|Chuck|Jasmine|Pryce|Clair|Chikorita|Bayleef|Meganium|Cyndaquil|Quilava|Typhlosion|Totodile|Croconaw|Feraligatr|Sentret|Furret|Hoothoot|Noctowl|Ledyba|Ledian|Spinarak|Ariados|Crobat|Chinchou|Lanturn|Pichu|Cleffa|Igglybuff|Togepi|Togetic|Natu|Xatu|Mareep|Flaaffy|Ampharos|Bellossom|Marill|Azumarill|Sudowoodo|Politoed|Hoppip|Skiploom|Jumpluff|Aipom|Sunkern|Sunflora|Yanma|Wooper|Quagsire|Espeon|Umbreon|Murkrow|Slowking|Misdreavus|Unown|Wobbuffet|Girafarig|Pineco|Forretress|Dunsparce|Gligar|Steelix|Snubbull|Granbull|Qwilfish|Scizor|Shuckle|Heracross|Sneasel|Teddiursa|Ursaring|Slugma|Magcargo|Swinub|Piloswine|Corsola|Remoraid|Octillery|Delibird|Mantine|Skarmory|Houndour|Houndoom|Kingdra|Phanpy|Donphan|Porygon2|Stantler|Smeargle|Tyrogue|Hitmontop|Smoochum|Elekid|Magby|Miltank|Blissey|Raikou|Entei|Suicune|Larvitar|Pupitar|Tyranitar|Lugia|Ho[ .''’-]*Oh|Celebi)\M'),
  ('Hoenn', '\m(Hoenn|Littleroot|Oldale|Petalburg|Rustboro|Dewford|Slateport|Mauville|Verdanturf|Fallarbor|Lavaridge|Fortree|Lilycove|Mossdeep|Sootopolis|Pacifidlog|Ever[ .''’-]*Grande|Roxanne|Brawly|Wattson|Flannery|Winona|Tate[ .''’-]*and[ .''’-]*Liza|Wallace|Treecko|Grovyle|Sceptile|Torchic|Combusken|Blaziken|Mudkip|Marshtomp|Swampert|Poochyena|Mightyena|Zigzagoon|Linoone|Wurmple|Silcoon|Beautifly|Cascoon|Dustox|Lotad|Lombre|Ludicolo|Seedot|Nuzleaf|Shiftry|Taillow|Swellow|Wingull|Pelipper|Ralts|Kirlia|Gardevoir|Surskit|Masquerain|Shroomish|Breloom|Slakoth|Vigoroth|Slaking|Nincada|Ninjask|Shedinja|Whismur|Loudred|Exploud|Makuhita|Hariyama|Azurill|Nosepass|Skitty|Delcatty|Sableye|Mawile|Aron|Lairon|Aggron|Meditite|Medicham|Electrike|Manectric|Plusle|Minun|Volbeat|Illumise|Roselia|Gulpin|Swalot|Carvanha|Sharpedo|Wailmer|Wailord|Numel|Camerupt|Torkoal|Spoink|Grumpig|Spinda|Trapinch|Vibrava|Flygon|Cacnea|Cacturne|Swablu|Altaria|Zangoose|Seviper|Lunatone|Solrock|Barboach|Whiscash|Corphish|Crawdaunt|Baltoy|Claydol|Lileep|Cradily|Anorith|Armaldo|Feebas|Milotic|Castform|Kecleon|Shuppet|Banette|Duskull|Dusclops|Tropius|Chimecho|Absol|Wynaut|Snorunt|Glalie|Spheal|Sealeo|Walrein|Clamperl|Huntail|Gorebyss|Relicanth|Luvdisc|Bagon|Shelgon|Salamence|Beldum|Metang|Metagross|Regirock|Regice|Registeel|Latias|Latios|Kyogre|Groudon|Rayquaza|Jirachi|Deoxys)\M'),
  ('Sinnoh', '\m(Sinnoh|Twinleaf|Sandgem|Jubilife|Oreburgh|Floaroma|Eterna|Hearthome|Solaceon|Veilstone|Pastoria|Celestic|Canalave|Snowpoint|Sunyshore|Mt[ .''’-]*Coronet|Roark|Gardenia|Maylene|Crasher[ .''’-]*Wake|Fantina|Byron|Candice|Volkner|Turtwig|Grotle|Torterra|Chimchar|Monferno|Infernape|Piplup|Prinplup|Empoleon|Starly|Staravia|Staraptor|Bidoof|Bibarel|Kricketot|Kricketune|Shinx|Luxio|Luxray|Budew|Roserade|Cranidos|Rampardos|Shieldon|Bastiodon|Burmy|Wormadam|Mothim|Combee|Vespiquen|Pachirisu|Buizel|Floatzel|Cherubi|Cherrim|Shellos|Gastrodon|Ambipom|Drifloon|Drifblim|Buneary|Lopunny|Mismagius|Honchkrow|Glameow|Purugly|Chingling|Stunky|Skuntank|Bronzor|Bronzong|Bonsly|Mime[ .''’-]*Jr|Happiny|Chatot|Spiritomb|Gible|Gabite|Garchomp|Munchlax|Riolu|Lucario|Hippopotas|Hippowdon|Skorupi|Drapion|Croagunk|Toxicroak|Carnivine|Finneon|Lumineon|Mantyke|Snover|Abomasnow|Weavile|Magnezone|Lickilicky|Rhyperior|Tangrowth|Electivire|Magmortar|Togekiss|Yanmega|Leafeon|Glaceon|Gliscor|Mamoswine|Porygon[ .''’-]*Z|Gallade|Probopass|Dusknoir|Froslass|Rotom|Uxie|Mesprit|Azelf|Dialga|Palkia|Heatran|Regigigas|Giratina|Cresselia|Phione|Manaphy|Darkrai|Shaymin|Arceus)\M'),
  ('Unova', '\m(Unova|Nuvema|Accumula|Striaton|Nacrene|Castelia|Nimbasa|Driftveil|Mistralton|Icirrus|Opelucid|Virbank|Humilau|Cilan|Lenora|Burgh|Elesa|Skyla|Brycen|Drayden|Roxie|Marlon|Victini|Snivy|Servine|Serperior|Tepig|Pignite|Emboar|Oshawott|Dewott|Samurott|Patrat|Watchog|Lillipup|Herdier|Stoutland|Purrloin|Liepard|Pansage|Simisage|Pansear|Simisear|Panpour|Simipour|Munna|Musharna|Pidove|Tranquill|Unfezant|Blitzle|Zebstrika|Roggenrola|Boldore|Gigalith|Woobat|Swoobat|Drilbur|Excadrill|Audino|Timburr|Gurdurr|Conkeldurr|Tympole|Palpitoad|Seismitoad|Throh|Sawk|Sewaddle|Swadloon|Leavanny|Venipede|Whirlipede|Scolipede|Cottonee|Whimsicott|Petilil|Lilligant|Basculin|Sandile|Krokorok|Krookodile|Darumaka|Darmanitan|Maractus|Dwebble|Crustle|Scraggy|Scrafty|Sigilyph|Yamask|Cofagrigus|Tirtouga|Carracosta|Archen|Archeops|Trubbish|Garbodor|Zorua|Zoroark|Minccino|Cinccino|Gothita|Gothorita|Gothitelle|Solosis|Duosion|Reuniclus|Ducklett|Swanna|Vanillite|Vanillish|Vanilluxe|Deerling|Sawsbuck|Emolga|Karrablast|Escavalier|Foongus|Amoonguss|Frillish|Jellicent|Alomomola|Joltik|Galvantula|Ferroseed|Ferrothorn|Klink|Klang|Klinklang|Tynamo|Eelektrik|Eelektross|Elgyem|Beheeyem|Litwick|Lampent|Chandelure|Axew|Fraxure|Haxorus|Cubchoo|Beartic|Cryogonal|Shelmet|Accelgor|Stunfisk|Mienfoo|Mienshao|Druddigon|Golett|Golurk|Pawniard|Bisharp|Bouffalant|Rufflet|Braviary|Vullaby|Mandibuzz|Heatmor|Durant|Deino|Zweilous|Hydreigon|Larvesta|Volcarona|Cobalion|Terrakion|Virizion|Tornadus|Thundurus|Reshiram|Zekrom|Landorus|Kyurem|Keldeo|Meloetta|Genesect)\M');

alter table public.curated_questions add column if not exists regions text[] not null default '{}';
create index if not exists curated_questions_regions_idx on public.curated_questions using gin (regions);

create or replace function public.curated_question_regions(p_question text, p_options jsonb)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(t.region order by t.region), '{}'::text[])
  from public.curated_region_terms t
  where (coalesce(p_question, '') || ' ' || coalesce((select string_agg(o, ' ') from jsonb_array_elements_text(coalesce(p_options, '[]'::jsonb)) o), '')) ~* t.pattern;
$function$;

create or replace function public.curated_questions_tag_regions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.regions := public.curated_question_regions(new.question, new.options);
  return new;
end;
$function$;

drop trigger if exists curated_questions_tag_regions on public.curated_questions;
create trigger curated_questions_tag_regions
  before insert or update of question, options on public.curated_questions
  for each row execute function public.curated_questions_tag_regions();

update public.curated_questions set regions = public.curated_question_regions(question, options);

-- The route battle's draw: unseen questions of the region first, then unseen ones from anywhere
-- (the top-up), and only then repeats, region first. Same shape as the band overload, plus p_regions.
create or replace function public.pick_battle_curated(
  p_difficulties text[],
  p_count integer,
  p_exclude uuid[],
  p_regions text[]
)
returns table (
  id uuid,
  question text,
  options jsonb,
  correct_index integer,
  explanation text,
  category text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with pool as (
    select c.id, c.question, c.options, c.correct_index, c.explanation, c.category,
           (c.id = any(coalesce(p_exclude, '{}'::uuid[]))) as seen,
           (c.regions && coalesce(p_regions, '{}'::text[])) as here
    from public.curated_questions c
    where c.verified
      and c.difficulty = any(coalesce(p_difficulties, '{}'::text[]))
  )
  select id, question, options, correct_index, explanation, category
  from pool
  order by seen asc, here desc, random()
  limit p_count;
$function$;

grant execute on function public.pick_battle_curated(text[], integer, uuid[], text[]) to anon, authenticated, service_role;
