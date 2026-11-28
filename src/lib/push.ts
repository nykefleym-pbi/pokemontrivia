import { supabase } from "@/integrations/supabase/client";
import { ensureSession } from "@/lib/social";

// Safe to hardcode — VAPID public keys are meant to be exposed to the client
// (only the private key, held server-side as an Edge Function secret, is
// sensitive).
const VAPID_PUBLIC_KEY =
  "BN2JzvCyF2FLLYgnLzDpzEeqwFJD8reo8LMI8n1R9usOhDio2TZuLdZKcvCWG87cH79bWAuhagEZPAhmCXXHTXk";

const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- matches the loose-typing pattern used elsewhere in social.ts / mega/runs.ts

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** True when the subscription was made with the current VAPID public key. */
function sameKey(sub: PushSubscription): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // shortcut: browsers that hide the key are trusted as-is
  const a = new Uint8Array(k);
  const b = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Re-subscribe, silently, a device that already granted permission but holds a
 * subscription from the old key (the 2026-11-28 key rotation). No prompt: only
 * runs when permission is already "granted".
 */
export async function healPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await withTimeout(navigator.serviceWorker.ready, 8000, "Service worker registration");
    const sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub)) await enablePushNotifications();
  } catch (e) {
    console.warn("[push] healPushSubscription threw:", e);
  }
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Current subscribe state, without prompting for permission. */
export async function getPushSubscriptionState(): Promise<{
  permission: NotificationPermission;
  subscribed: boolean;
}> {
  if (!pushSupported()) return { permission: "denied", subscribed: false };
  const permission = Notification.permission;
  if (permission !== "granted") return { permission, subscribed: false };
  try {
    const reg = await withTimeout(
      navigator.serviceWorker.ready,
      8000,
      "Service worker registration",
    );
    const sub = await reg.pushManager.getSubscription();
    return { permission, subscribed: !!sub };
  } catch (e) {
    console.warn("[push] getPushSubscriptionState threw:", e);
    return { permission, subscribed: false };
  }
}

/** Request permission (if needed), subscribe, and upsert the subscription row. */
export async function enablePushNotifications(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: "Push isn't supported on this device/browser." };

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted")
    return { ok: false, error: "Notification permission was not granted." };

  const uid = await ensureSession();
  if (!uid) return { ok: false, error: "No session yet — try again in a moment." };

  try {
    const reg = await withTimeout(
      navigator.serviceWorker.ready,
      8000,
      "Service worker registration",
    );
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with an older key can never receive (the server signs
    // with the new one): drop it and subscribe again.
    if (sub && !sameKey(sub)) {
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    const { error } = await db.from("push_subscriptions").upsert(
      {
        user_id: uid,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
      { onConflict: "user_id,endpoint" },
    );
    if (error) {
      console.warn("[push] subscription upsert failed:", error.message);
      return { ok: false, error: "Couldn't save subscription, try again." };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[push] enablePushNotifications threw:", e);
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Couldn't subscribe to push: ${detail}` };
  }
}

/** Unsubscribe locally and remove the stored row. */
export async function disablePushNotifications(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    const uid = await ensureSession();
    if (!uid) return;
    await db.from("push_subscriptions").delete().eq("user_id", uid).eq("endpoint", endpoint);
  } catch (e) {
    console.warn("[push] disablePushNotifications threw:", e);
  }
}
