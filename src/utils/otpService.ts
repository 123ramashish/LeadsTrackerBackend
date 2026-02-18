import nodemailer, { Transporter } from 'nodemailer';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// ─── Types ────────────────────────────────────────────────────────────────────
export type OTPPurpose = 'Password Reset' | 'Email Verification' | 'Login';

export interface OTPResult {
  otp: string;        // plain OTP → send to user
  hashedOTP: string;  // bcrypt hash → store in DB (NEVER the plain one)
  expiry: Date;
}

export interface OTPRateState {
  count: number;
  firstRequestAt: number;
  lastRequestAt: number;
}

// ─── SMS Config ───────────────────────────────────────────────────────────────
const SMS_CONFIG = {
  apiKey:     process.env.FAST2SMS_API_KEY,
  apiUrl:     'https://www.fast2sms.com/dev/bulkV2',
  senderId:   process.env.FAST2SMS_SENDER_ID  || 'TXTIND',
  templateId: process.env.FAST2SMS_TEMPLATE_ID || '',
  useDLT:     process.env.USE_DLT_TEMPLATES   === 'true',
};

// ─── Rate Limiter (swap Map for Redis in production) ──────────────────────────
const rateLimitStore = new Map<string, OTPRateState>();
const MAX_REQUESTS_PER_HOUR = 5;
const RATE_WINDOW_MS        = 60 * 60 * 1000; // 1 hour

export class OTPRateLimitError extends Error {
  public retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Too many OTP requests. Try again in ${Math.ceil(retryAfterMs / 60000)} minute(s).`);
    this.name = 'OTPRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export const checkOTPRateLimit = (identifier: string): void => {
  const now   = Date.now();
  const key   = `otp:${identifier}`;
  const state = rateLimitStore.get(key);

  if (!state || now - state.firstRequestAt > RATE_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, firstRequestAt: now, lastRequestAt: now });
    return;
  }

  if (state.count >= MAX_REQUESTS_PER_HOUR) {
    const retryAfterMs = RATE_WINDOW_MS - (now - state.firstRequestAt);
    throw new OTPRateLimitError(Math.max(0, retryAfterMs));
  }

  state.count     += 1;
  state.lastRequestAt = now;
  rateLimitStore.set(key, state);
};

// ─── Validation Helpers ───────────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10,15}$/;

const validateEmail = (email: string): void => {
  if (!EMAIL_REGEX.test(email)) {
    throw new Error(`Invalid email format: ${email}`);
  }
};

const validatePhone = (phone: string): void => {
  if (!PHONE_REGEX.test(phone)) {
    throw new Error(`Invalid phone number: ${phone}. Must be 10-15 digits.`);
  }
};

// ─── OTP Generation ───────────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure 6-digit OTP.
 * Uses crypto.randomInt (CSPRNG) — NOT Math.random().
 */
export const generateOTP = (): string =>
  crypto.randomInt(100000, 999999).toString();

/**
 * Returns an expiry Date N minutes from now.
 */
export const getOTPExpiry = (minutesFromNow = 10): Date =>
  new Date(Date.now() + minutesFromNow * 60 * 1000);

/**
 * Generates a plain OTP, bcrypt-hashes it, and returns both + expiry.
 *
 * Usage in controller:
 *   const { otp, hashedOTP, expiry } = await generateAndHashOTP();
 *   user.resetToken       = hashedOTP;  // ← store hash in DB
 *   user.resetTokenExpiry = expiry;
 *   await user.save();
 *   await sendOTPEmail(user.email, otp, 'Password Reset');  // ← send plain
 */
export const generateAndHashOTP = async (minutesFromNow = 10): Promise<OTPResult> => {
  const otp       = generateOTP();
  const hashedOTP = await bcrypt.hash(otp, 10);
  const expiry    = getOTPExpiry(minutesFromNow);
  return { otp, hashedOTP, expiry };
};

/**
 * Compares a user-supplied plain OTP against a stored bcrypt hash.
 */
export const verifyOTP = async (plainOTP: string, hashedOTP: string): Promise<boolean> => {
  try {
    return await bcrypt.compare(plainOTP, hashedOTP);
  } catch {
    return false;
  }
};

// ─── Development Helper ───────────────────────────────────────────────────────
/**
 * Logs OTP to console in development. NEVER used in production.
 */
export const logOTPForDev = (
  type: 'email' | 'sms',
  identifier: string,
  otp: string,
  purpose: OTPPurpose
): void => {
  if (process.env.NODE_ENV !== 'development') return;

  console.log(`
╔════════════════════════════════════════════════════════════╗
║   🚨  DEVELOPMENT OTP  —  DO NOT USE IN PRODUCTION  🚨    ║
║   Type   : ${type.padEnd(51)}║
║   Purpose: ${purpose.padEnd(51)}║
║   To     : ${identifier.padEnd(51)}║
║   OTP    : ${otp.padEnd(51)}║
║   Valid  : 10 minutes                                      ║
╚════════════════════════════════════════════════════════════╝`);
};

// ─── Nodemailer transport (lazy singleton) ────────────────────────────────────
let transporter: Transporter | null = null;

/**
 * Builds a nodemailer transporter based on MAIL_PROVIDER env var.
 * Returns null (and warns) if required credentials are missing.
 */
const getTransporter = (): Transporter => {
  if (transporter) return transporter;

  const provider = process.env.MAIL_PROVIDER || 'smtp'; // 'smtp' | 'gmail' | 'ses'

  if (provider === 'gmail') {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('Gmail email service not configured. Check GMAIL_USER and GMAIL_APP_PASSWORD.');
    }
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD, // App password, NOT your Gmail password
      },
      tls: { rejectUnauthorized: false }, // some hosting envs need this
    });

  } else if (provider === 'ses') {
    if (!process.env.SES_SMTP_USER || !process.env.SES_SMTP_PASS) {
      throw new Error('AWS SES not configured. Check SES_SMTP_USER and SES_SMTP_PASS.');
    }
    transporter = nodemailer.createTransport({
      host:   process.env.SES_SMTP_HOST || 'email-smtp.ap-south-1.amazonaws.com',
      port:   465,
      secure: true,
      auth: {
        user: process.env.SES_SMTP_USER,
        pass: process.env.SES_SMTP_PASS,
      },
    });

  } else {
    // Generic SMTP — Mailtrap (dev) / Postfix / SendGrid SMTP
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error('SMTP email service not configured. Check SMTP_USER and SMTP_PASS.');
    }
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.mailtrap.io',
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
    });
  }

  return transporter;
};

// ─── HTML Email Template ──────────────────────────────────────────────────────
const buildEmailHTML = (otp: string, purpose: OTPPurpose, userName?: string): string => {
  const content: Record<OTPPurpose, { heading: string; body: string }> = {
    'Password Reset': {
      heading: '🔐 Reset Your Password',
      body:    'You requested a password reset. Use the OTP below to proceed. If you did not request this, ignore this email — your account is safe.',
    },
    'Email Verification': {
      heading: '✅ Verify Your Email',
      body:    'Welcome aboard! Please verify your email address using the OTP below to activate your account.',
    },
    'Login': {
      heading: '🔑 Your Login OTP',
      body:    'Use the OTP below to complete your login. Never share it with anyone, including our support team.',
    },
  };

  const { heading, body } = content[purpose];
  const appName = process.env.APP_NAME || 'LeadTracker';
  const brand   = '#4F46E5';
  const year    = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0"
           style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

      <!-- Brand header -->
      <tr>
        <td style="background:${brand};padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">${appName}</p>
        </td>
      </tr>

      <!-- Content -->
      <tr>
        <td style="padding:36px 32px 28px;">
          <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">${heading}</h1>
          ${userName
            ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7280;">Hi ${userName},</p>`
            : ''}
          <p style="margin:0 0 28px;font-size:14px;color:#374151;line-height:1.6;">${body}</p>

          <!-- OTP box -->
          <div style="background:#f9fafb;border:2px dashed ${brand};border-radius:10px;
                      padding:24px;text-align:center;margin-bottom:24px;">
            <p style="margin:0 0 6px;font-size:11px;color:#6b7280;
                      letter-spacing:2px;text-transform:uppercase;">One-Time Password</p>
            <p style="margin:0;font-size:44px;font-weight:800;letter-spacing:14px;color:${brand};">
              ${otp}
            </p>
          </div>

          <!-- Expiry warning -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#fef3c7;border-left:4px solid #f59e0b;
                          border-radius:4px;padding:12px 16px;">
                <p style="margin:0;font-size:13px;color:#92400e;">
                  ⏱️ Expires in <strong>10 minutes</strong>.
                  🔒 Do not share this OTP with anyone.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
            If you didn't request this OTP, you can safely ignore this email.<br/>
            &copy; ${year} ${appName}. All rights reserved.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
};

// ─── Send OTP Email ───────────────────────────────────────────────────────────
export const sendOTPEmail = async (
  email:    string,
  otp:      string,
  purpose:  OTPPurpose,
  userName?: string
): Promise<void> => {
  validateEmail(email);

  const subjects: Record<OTPPurpose, string> = {
    'Password Reset':     '🔐 Your Password Reset OTP',
    'Email Verification': '✅ Verify Your Email Address',
    'Login':              '🔑 Your Login OTP',
  };

  const appName = process.env.APP_NAME || 'LeadTracker';
  const html    = buildEmailHTML(otp, purpose, userName);

  try {
    const info = await getTransporter().sendMail({
      from:    `"${appName}" <${process.env.MAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER}>`,
      to:      email,
      subject: subjects[purpose],
      text:    `Your ${purpose} OTP is: ${otp}\nExpires in 10 minutes. Do not share it.`,
      html,
    });

    logOTPForDev('email', email, otp, purpose);
    console.log(`[OTP EMAIL] ✓ To:${email} | Purpose:${purpose} | MsgId:${info.messageId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Mask any credentials that may leak into error messages
    const sanitized = msg.replace(/(authorization|password|pass)[^,;]*/gi, '$1: ***');
    console.error(`[OTP EMAIL] ✗ To:${email} |`, sanitized);
    throw new Error(`Failed to send OTP email: ${sanitized}`);
  }
};

// ─── SMS Providers ────────────────────────────────────────────────────────────
const buildSMSText = (otp: string, purpose: OTPPurpose): string => {
  const app = process.env.APP_NAME || 'LeadTracker';
  return `[${app}] Your ${purpose} OTP: ${otp}. Valid for 10 mins. Do NOT share it.`;
};

/** Twilio */
const sendViaTwilio = async (phone: string, message: string): Promise<void> => {
  const sid   = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from  = process.env.TWILIO_PHONE_NUMBER!;

  if (!sid || !token || !from) {
    throw new Error('Twilio not configured. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.');
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method:  'POST',
        signal:  controller.signal,
        headers: {
          Authorization:  `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, From: from, Body: message }).toString(),
      }
    );

    if (!res.ok) {
      const err = await res.json() as { message?: string };
      throw new Error(`Twilio error (${res.status}): ${err.message ?? res.statusText}`);
    }

    const data = await res.json() as { sid: string };
    console.log(`[OTP SMS/Twilio] ✓ To:${phone} | SID:${data.sid}`);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Twilio SMS gateway timeout. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

/** MSG91 — OTP API v5 with DLT template (India) */
const sendViaMSG91 = async (phone: string, otp: string): Promise<void> => {
  if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) {
    throw new Error('MSG91 not configured. Check MSG91_AUTH_KEY and MSG91_TEMPLATE_ID.');
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch('https://control.msg91.com/api/v5/otp', {
      method:  'POST',
      signal:  controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        template_id: process.env.MSG91_TEMPLATE_ID,
        mobile:      phone.replace(/^\+/, ''),
        authkey:     process.env.MSG91_AUTH_KEY,
        otp,
      }),
    });

    if (!res.ok) {
      const err = await res.json() as { message?: string };
      throw new Error(`MSG91 error (${res.status}): ${err.message ?? res.statusText}`);
    }

    const data = await res.json() as { type: string; message: string };
    console.log(`[OTP SMS/MSG91] ✓ To:${phone} | ${data.message}`);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('MSG91 SMS gateway timeout. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

/** Fast2SMS — supports both OTP route and DLT template route (India) */
const sendViaFast2SMS = async (phone: string, otp: string, purpose: OTPPurpose): Promise<void> => {
  if (!SMS_CONFIG.apiKey) {
    throw new Error('Fast2SMS not configured. Check FAST2SMS_API_KEY.');
  }

  // DLT compliance: use template if USE_DLT_TEMPLATES=true and template ID is set
  const payload = SMS_CONFIG.useDLT && SMS_CONFIG.templateId
    ? {
        sender_id:       SMS_CONFIG.senderId,
        message:         SMS_CONFIG.templateId,
        variables_values: otp,
        route:           SMS_CONFIG.useDLT ? 'dlt' : 'otp',
        numbers:         phone.replace(/^\+91/, ''),
      }
    : {
        sender_id: SMS_CONFIG.senderId,
        message:   buildSMSText(otp, purpose),
        route:     'otp',
        numbers:   phone.replace(/^\+91/, ''),
      };

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(SMS_CONFIG.apiUrl, {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        authorization:  SMS_CONFIG.apiKey.trim(), // trim accidental whitespace
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Fast2SMS error (${res.status}): ${res.statusText}`);

    const data = await res.json() as { return: boolean; message: string[] };
    if (!data.return) {
      throw new Error(`Fast2SMS rejected: ${data.message?.join(', ')}`);
    }

    console.log(`[OTP SMS/Fast2SMS] ✓ To:${phone}`);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Fast2SMS gateway timeout. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

// ─── Send OTP SMS (auto-selects provider via SMS_PROVIDER env var) ─────────────
export const sendOTPSMS = async (
  phone:   string,
  otp:     string,
  purpose: OTPPurpose
): Promise<void> => {
  validatePhone(phone);

  const provider = process.env.SMS_PROVIDER || 'twilio'; // 'twilio' | 'msg91' | 'fast2sms'

  try {
    if (provider === 'msg91') {
      await sendViaMSG91(phone, otp);
    } else if (provider === 'fast2sms') {
      await sendViaFast2SMS(phone, otp, purpose);
    } else {
      await sendViaTwilio(phone, buildSMSText(otp, purpose));
    }

    logOTPForDev('sms', phone, otp, purpose);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[OTP SMS/${provider}] ✗ To:${phone} |`, msg);
    throw new Error(`Failed to send OTP SMS: ${msg}`);
  }
};

// ─── Default export (named exports above are preferred) ───────────────────────
export default {
  generateOTP,
  getOTPExpiry,
  generateAndHashOTP,
  verifyOTP,
  checkOTPRateLimit,
  sendOTPEmail,
  sendOTPSMS,
  logOTPForDev,
};