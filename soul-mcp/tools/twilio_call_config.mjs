import { z } from 'zod';

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';

function twilioAuth(account_sid, auth_token) {
  if (!account_sid || !auth_token)
    throw new Error('twilio_account_sid und twilio_auth_token müssen beim Tool-Aufruf mitgegeben werden');
  return `Basic ${Buffer.from(`${account_sid}:${auth_token}`).toString('base64')}`;
}

async function twilioPost(account_sid, auth_token, path, body) {
  const res = await fetch(`${TWILIO_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: twilioAuth(account_sid, auth_token),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  return data;
}

async function twilioGet(account_sid, auth_token, path) {
  const res = await fetch(`${TWILIO_BASE}${path}`, {
    headers: { Authorization: twilioAuth(account_sid, auth_token) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  return data;
}

const TWILIO_CREDS = {
  twilio_account_sid: z.string().describe('Twilio Account SID (console.twilio.com → Account Info)'),
  twilio_auth_token:  z.string().describe('Twilio Auth Token (console.twilio.com → Account Info)'),
};

export function register(server, _token) {

  server.tool(
    'twilio_call_config',
    'Konfiguriert eine Twilio-Rufnummer für eingehende Anrufe oder SMS. Setzt Voice-Webhook, SMS-Webhook oder beide. Ohne voice_url/sms_url: zeigt aktuellen Status der Nummer.',
    {
      ...TWILIO_CREDS,
      phone_sid:       z.string().describe('Twilio Phone Number SID (PN...) — findest du im Twilio Console unter Phone Numbers'),
      voice_url:       z.string().url().optional().describe('Webhook-URL für eingehende Anrufe'),
      voice_method:    z.enum(['GET', 'POST']).default('POST'),
      sms_url:         z.string().url().optional().describe('Webhook-URL für eingehende SMS'),
      sms_method:      z.enum(['GET', 'POST']).default('POST'),
      status_callback: z.string().url().optional().describe('Status-Callback-URL (optional)'),
    },
    async ({ twilio_account_sid, twilio_auth_token, phone_sid, voice_url, voice_method, sms_url, sms_method, status_callback }) => {
      try {
        const updates = {};
        if (voice_url)       { updates.VoiceUrl    = voice_url;   updates.VoiceMethod = voice_method; }
        if (sms_url)         { updates.SmsUrl      = sms_url;     updates.SmsMethod   = sms_method; }
        if (status_callback) { updates.StatusCallback = status_callback; }

        const path = `/Accounts/${twilio_account_sid}/IncomingPhoneNumbers/${phone_sid}.json`;

        if (!Object.keys(updates).length) {
          const current = await twilioGet(twilio_account_sid, twilio_auth_token, path);
          return { content: [{ type: 'text', text: JSON.stringify({
            phone_number: current.phone_number, phone_sid: current.sid,
            voice_url: current.voice_url || '(nicht gesetzt)',
            sms_url:   current.sms_url   || '(nicht gesetzt)',
            friendly_name: current.friendly_name,
          }, null, 2) }] };
        }

        const result = await twilioPost(twilio_account_sid, twilio_auth_token, path, updates);
        return { content: [{ type: 'text', text: JSON.stringify({
          ok: true,
          phone_number:  result.phone_number,
          phone_sid:     result.sid,
          voice_url:     result.voice_url,
          sms_url:       result.sms_url,
          friendly_name: result.friendly_name,
          message: `Twilio-Nummer ${result.phone_number} konfiguriert.`,
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );

}
