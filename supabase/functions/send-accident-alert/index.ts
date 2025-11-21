import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AccidentData {
  userEmail: string;
  contact1: string;
  contact2: string;
  latitude: number;
  longitude: number;
  dangerPercentage: number;
  accidentId: string;
  emailType: 'user_confirmation' | 'emergency_alert';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const data: AccidentData = await req.json();
    const { userEmail, contact1, contact2, latitude, longitude, dangerPercentage, emailType, accidentId } = data;

    const googleMapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

    if (emailType === 'user_confirmation') {
      const userEmailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff3cd; border: 2px solid #ffc107; border-radius: 10px;">
          <h1 style="color: #856404; margin-bottom: 20px;">⚠️ Accident Detected - Action Required</h1>
          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            Our system has detected a potential accident with your motorcycle helmet.
          </p>
          <div style="background-color: #fff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>Danger Level:</strong> <span style="color: #d9534f; font-size: 24px; font-weight: bold;">${dangerPercentage}%</span></p>
            <p style="margin: 10px 0;"><strong>Location:</strong> <a href="${googleMapsLink}" style="color: #0275d8;">View on Google Maps</a></p>
            <p style="margin: 10px 0;"><strong>Coordinates:</strong> ${latitude.toFixed(6)}, ${longitude.toFixed(6)}</p>
          </div>
          <div style="background-color: #f8d7da; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #721c24; font-weight: bold; margin: 0;">
              🚨 If this is a FALSE ALARM, you have 30 seconds to cancel the emergency alert!
            </p>
          </div>
          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            If you do not respond, emergency contacts will be notified automatically.
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 10px;">
            Accident ID: ${accidentId}
          </p>
        </div>
      `;

      console.log('Sending user confirmation email to:', userEmail);
      console.log('Email content prepared for danger level:', dangerPercentage);
    } else if (emailType === 'emergency_alert') {
      const emergencyEmailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8d7da; border: 2px solid #d9534f; border-radius: 10px;">
          <h1 style="color: #721c24; margin-bottom: 20px;">🚨 EMERGENCY ALERT - Motorcycle Accident Detected</h1>
          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            This is an automated emergency notification. A motorcycle accident has been detected.
          </p>
          <div style="background-color: #fff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>Rider Email:</strong> ${userEmail}</p>
            <p style="margin: 10px 0;"><strong>Danger Level:</strong> <span style="color: #d9534f; font-size: 24px; font-weight: bold;">${dangerPercentage}%</span></p>
            <p style="margin: 10px 0;"><strong>Last Known Location:</strong></p>
            <p style="margin: 10px 0; padding-left: 20px;">
              <a href="${googleMapsLink}" style="color: #0275d8; font-size: 16px; font-weight: bold;">📍 Open in Google Maps</a>
            </p>
            <p style="margin: 10px 0; padding-left: 20px; color: #666;">Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}</p>
          </div>
          <div style="background-color: #d9534f; color: white; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 18px; font-weight: bold;">
              ⚠️ IMMEDIATE ACTION MAY BE REQUIRED
            </p>
          </div>
          <p style="font-size: 14px; color: #666;">
            Please check on the rider immediately. If you cannot reach them, consider contacting emergency services.
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            Time: ${new Date().toLocaleString()}<br/>
            Accident ID: ${accidentId}
          </p>
        </div>
      `;

      console.log('Sending emergency alerts to:', contact1, contact2);
      console.log('Emergency email prepared with danger level:', dangerPercentage);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email notification logged (email service not configured)',
        emailType,
        recipients: emailType === 'user_confirmation' ? [userEmail] : [contact1, contact2]
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});