// Server-only helper: fan out a milestone push to the user's accepted friends.
// Uses the existing web-push pipeline. Never imported from client code.
import { levelName } from "./gamification.functions";

export type MilestoneKind = "level_up" | "achievement";

type NotifyOptions = {
  userId: string;
  kind: MilestoneKind;
  // For level_up: the new level index. For achievement: unused.
  level?: number;
  // For achievement: title + rarity.
  achievementTitle?: string;
  rarity?: string;
};

export async function notifyCircleMilestone(opts: NotifyOptions): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendWakePush } = await import("./web-push.server");

  // Look up the actor's display name.
  const { data: actor } = await supabaseAdmin
    .from("profiles")
    .select("display_name, username")
    .eq("id", opts.userId)
    .maybeSingle();
  const who = actor?.display_name || actor?.username || "Alguien";

  let title: string;
  let body: string;
  let tag: string;
  if (opts.kind === "level_up") {
    const name = levelName(opts.level ?? 0);
    title = "Nuevo nivel en tu círculo";
    body = `${who} es ahora ${name} ☀`;
    tag = `level-${opts.userId}-${opts.level}`;
  } else {
    const rarityLabel = opts.rarity === "legendary" ? "un logro legendario"
      : opts.rarity === "epic" ? "un logro épico"
      : "un logro";
    title = `${who} desbloqueó ${rarityLabel}`;
    body = opts.achievementTitle ?? "";
    tag = `ach-${opts.userId}-${opts.achievementTitle}`;
  }

  // Fetch accepted friends of this user.
  const { data: friendships } = await supabaseAdmin
    .from("friendships")
    .select("user_id, friend_id")
    .eq("status", "accepted")
    .or(`user_id.eq.${opts.userId},friend_id.eq.${opts.userId}`);
  const friendIds = new Set<string>();
  (friendships ?? []).forEach((f) => {
    if (f.user_id !== opts.userId) friendIds.add(f.user_id);
    if (f.friend_id !== opts.userId) friendIds.add(f.friend_id);
  });
  if (friendIds.size === 0) return 0;

  let total = 0;
  await Promise.all(
    Array.from(friendIds).map(async (fid) => {
      try {
        total += await sendWakePush({
          userId: fid,
          title,
          body,
          url: "/circle",
          tag,
        });
      } catch { /* keep going */ }
    })
  );
  return total;
}
