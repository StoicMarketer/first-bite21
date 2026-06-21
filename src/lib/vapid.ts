// Public VAPID key (safe to ship in client bundle).
// The matching private key lives in the VAPID_PRIVATE_KEY server secret.
export const VAPID_PUBLIC_KEY =
  "BHEEf-j6pgt6IfsuW4c_9vP5YktUn6p3-CmYcBv1TyPox5Wn1jf5IqshoimCBwcquH888mEO72jjLOiIW4FN3gU";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}
