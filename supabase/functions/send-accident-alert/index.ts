import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AccidentData {
  userEmail?: string;
  contact1?: string; 
  latitude: number;
  longitude: number;
  dangerPercentage: number;
  emailType: 'user_confirmation' | 'emergency_alert';
  dashboardUrl?: string; 
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const groupChatId = Deno.env.get("TELEGRAM_CHAT_ID");
    const userChatId = Deno.env.get("TELEGRAM_USER_ID");

    if (!botToken || !groupChatId || !userChatId) {
      throw new Error("Missing Telegram secrets");
    }

    const data: AccidentData = await req.json();
    const { latitude, longitude, dangerPercentage, emailType } = data;

    const googleMapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
    
    let targetChatId = "";
    let messageText = "";
    // We removed the button variable to prevent errors

    console.log(`[LOG] Processing Alert Type: ${emailType}`);

    if (emailType === 'user_confirmation') {
      // --- SEND TO YOU (PRIVATE) ---
      targetChatId = userChatId;
      
      messageText = `
⚠️ **POTENTIAL ACCIDENT DETECTED** ⚠️

**Danger Level:** ${dangerPercentage}%
**Location:** [View on Map](${googleMapsLink})

You have 30 seconds to cancel this alert before the group is notified.
      `;
      // NO BUTTON HERE ANYMORE

    } else {
      // --- SEND TO GROUP (PUBLIC) ---
      targetChatId = groupChatId;

      messageText = `
🚨 **EMERGENCY ALERT** 🚨

A motorcycle accident has been confirmed.

**Danger Level:** ${dangerPercentage}%
**Coordinates:** \`${latitude.toFixed(6)}, ${longitude.toFixed(6)}\`
**Location:** [Click to Open Map](${googleMapsLink})

Please verify the rider's safety immediately.
      `;
    }

    // Send to Telegram (Standard Message)
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: messageText,
        parse_mode: "Markdown",
        // reply_markup removed
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error(`[TELEGRAM ERROR] ${result.description}`);
      throw new Error(`Telegram Error: ${result.description}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Function Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});