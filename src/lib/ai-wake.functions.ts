import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_PROMPT =
  "Eres un guía amable. Escribe 1-2 frases breves para despertar al usuario con calidez. En español.";

export const getAiWakeMessage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { text: "Buenos días. Empieza despacio.", sender: { username: "zen", display_name: "Mañanas Zen" } };

    // Pick favourite (most recently joined) subscribed channel
    const { data: sub } = await supabase
      .from("channel_subscriptions")
      .select("channel_id")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let prompt = DEFAULT_PROMPT;
    let channelName = "SurpriseWake";
    if (sub) {
      const { data: ch } = await supabase
        .from("channels")
        .select("name, tone_prompt")
        .eq("id", sub.channel_id)
        .maybeSingle();
      if (ch) {
        prompt = ch.tone_prompt;
        channelName = ch.name;
      }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", userId)
      .maybeSingle();
    const name = profile?.display_name || profile?.username || "amig@";

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: `Despierta a ${name}. Sé breve.` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const json = await res.json();
      const text: string = json?.choices?.[0]?.message?.content?.trim() || "Buenos días. Empieza despacio.";
      return {
        text,
        sender: { username: "ai", display_name: channelName },
        isAi: true,
      };
    } catch {
      return {
        text: "Buenos días. Respira y empieza con calma.",
        sender: { username: "ai", display_name: channelName },
        isAi: true,
      };
    }
  });
