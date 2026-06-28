## What's wrong

**1. Friend code shows `------`**
Console reveals the real cause:

```
[social] syncProfile failed: permission denied for function gen_friend_code
```

In the previous security pass I revoked `EXECUTE` on `gen_friend_code()` from `public`/`anon`/`authenticated`. The `profiles` BEFORE-INSERT trigger calls that function while running as the inserting user, so every new profile insert now fails — no row is created, no friend code is returned, and the store stays `null`.

**2. Two X buttons on the Trainer Card**
shadcn's `DialogContent` already renders a built-in close button (`src/components/ui/dialog.tsx` line 47). The trainer card in `src/routes/profile.tsx` (lines 356–361) adds a second custom one in the same top-right position, so the user sees two stacked Xs.

## Fix

### Migration — inline the code generator into the trigger

Drop the brittle separate-function approach. Move the random-code loop directly into `profiles_before_write()` and remove `gen_friend_code()` entirely. The trigger is `SECURITY DEFINER`, so it bypasses RLS to check uniqueness, and no user ever needs `EXECUTE` on a helper function.

```sql
create or replace function public.profiles_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text; i int;
begin
  if tg_op = 'INSERT' and (new.friend_code is null or new.friend_code = '') then
    loop
      code := '';
      for i in 1..6 loop
        code := code || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
      end loop;
      exit when not exists (select 1 from public.profiles where friend_code = code);
    end loop;
    new.friend_code := code;
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop function if exists public.gen_friend_code();
```

### Code — remove the duplicate close button

In `src/routes/profile.tsx`, delete the custom `<button>` wrapping `<X />` at lines 356–361 inside the trainer card `<DialogContent>`. The built-in close button stays.

## Technical notes

- After the migration the user must reload once so `syncProfile()` runs again with a working trigger; the friend code will then appear and be persisted to the local store.
- The dialog's built-in close is keyboard- and screen-reader-friendly (`sr-only` "Close" label), so removing the custom one is a net accessibility win.
- No client API changes; `social.ts` already calls `syncProfile` on dialog open, which will now succeed.
