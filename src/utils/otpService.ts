// src/utils/otpService.ts
import nodemailer from 'nodemailer';
import axios from 'axios';
import { config } from 'dotenv';
config();

// ======================
// EMAIL SERVICE SETUP
// ======================
const createEmailTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ Email credentials missing. Email OTP disabled.');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false // For some hosting environments
    }
  });
};

// ======================
// SMS SERVICE CONFIG
// ======================
const SMS_CONFIG = {
  apiKey: process.env.FAST2SMS_API_KEY,
  apiUrl: 'https://www.fast2sms.com/dev/bulkV2', // Fixed trailing spaces!
  senderId: process.env.FAST2SMS_SENDER_ID || 'TXTIND',
  route: 'dlt',
  templateId: process.env.FAST2SMS_TEMPLATE_ID || '181436' // Default template ID
};

// ======================
// CORE OTP FUNCTIONS
// ======================

/**
 * Sends OTP via Email
 * @throws Error if email fails to send (caller should handle)
 */
export const sendOTPEmail = async (
  email: string, 
  otp: string, 
  purpose: string = 'Authentication'
): Promise<void> => {
  const transporter = createEmailTransporter();
  
  if (!transporter) {
    throw new Error('Email service not configured. Check EMAIL_USER and EMAIL_PASS environment variables.');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error(`Invalid email format: ${email}`);
  }

  const subject = `OTP for ${purpose} - LeadTracker`;
  const text = `
Your OTP for ${purpose} is: ${otp}

This OTP is valid for 10 minutes.
Do not share this OTP with anyone.

If you didn't request this, please ignore this email.

— LeadTracker Team
  `.trim();

  try {
    await transporter.sendMail({
      from: `"LeadTracker" <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      text,
      // Optional HTML version
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #2c3e50;">LeadTracker OTP Verification</h2>
          <p>Hello,</p>
          <p>Your OTP for <strong>${purpose}</strong> is:</p>
          <div style="background-color: #f8f9fa; border-left: 4px solid #3498db; padding: 15px; margin: 20px 0; font-size: 24px; letter-spacing: 3px; font-weight: bold; color: #2c3e50;">
            ${otp}
          </div>
          <p style="color: #7f8c8d; font-size: 14px;">
            ⏱️ Valid for 10 minutes<br>
            🔒 Never share this OTP with anyone
          </p>
          <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;">
          <p style="color: #95a5a6; font-size: 12px;">
            If you didn't request this OTP, please ignore this email.<br>
            &copy; ${new Date().getFullYear()} LeadTracker. All rights reserved.
          </p>
        </div>
      `
    });

    console.log(`✅ OTP email sent to ${email} for ${purpose}`);
  } catch (error: any) {
    console.error('📧 Email OTP send failed:', error.message);
    // Mask sensitive info in error
    throw new Error(`Failed to send OTP email: ${error.message.replace(/(authorization|pass)[^,]*/gi, '$1: ***')}`);
  }
};

/**
 * Sends OTP via SMS (Fast2SMS)
 * @throws Error if SMS fails to send (caller should handle)
 */
export const sendOTPSMS = async (
  phone: string, 
  otp: string, 
  purpose: string = 'Authentication'
): Promise<void> => {
  // Validate phone format (10-14 digits)
  if (!/^\d{10,14}$/.test(phone)) {
    throw new Error(`Invalid phone number format: ${phone}. Must be 10-14 digits.`);
  }

  // Validate SMS configuration
  if (!SMS_CONFIG.apiKey) {
    console.warn('⚠️ SMS API key missing. SMS OTP disabled.');
    throw new Error('SMS service not configured. Check FAST2SMS_API_KEY environment variable.');
  }

  // Format message with purpose
  const message = `LeadTracker: Your OTP for ${purpose} is ${otp}. Valid for 10 mins. Do not share.`;
  
  // For DLT compliance in India - use template variables if configured
  const payload = process.env.USE_DLT_TEMPLATES === 'true' 
    ? {
        sender_id: SMS_CONFIG.senderId,
        message: SMS_CONFIG.templateId,
        variables_values: otp,
        route: SMS_CONFIG.route,
        numbers: phone
      }
    : {
        sender_id: SMS_CONFIG.senderId,
        message,
        route: 'otp', // Fast2SMS OTP route
        numbers: phone
      };

  try {
    const response = await axios.post(SMS_CONFIG.apiUrl, payload, {
      headers: {
        authorization: SMS_CONFIG.apiKey.trim(), // Critical: remove accidental spaces
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    // Fast2SMS specific success check
    if (response.data?.return === false || response.status !== 200) {
      const errorMsg = response.data?.message || 'Unknown SMS gateway error';
      console.error('📱 SMS OTP send failed:', errorMsg);
      throw new Error(`SMS gateway error: ${errorMsg}`);
    }

    console.log(`✅ OTP SMS sent to ${phone} for ${purpose}`);
  } catch (error: any) {
    console.error('📱 SMS OTP send failed:', error.message);
    
    // Handle specific axios errors
    if (error.code === 'ECONN_TIMEOUT' || error.code === 'ETIMEDOUT') {
      throw new Error('SMS gateway timeout. Please try again.');
    }
    
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const data = error.response.data;
      throw new Error(`SMS service error (${status}): ${JSON.stringify(data)}`);
    }
    
    throw new Error(`Failed to send OTP SMS: ${error.message}`);
  }
};

// ======================
// DEVELOPMENT HELPER
// ======================
/**
 * For development only: Logs OTP to console
 * NEVER use in production!
 */
export const logOTPForDev = (type: 'email' | 'sms', identifier: string, otp: string, purpose: string) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚨 DEVELOPMENT OTP - DO NOT USE IN PRODUCTION 🚨         ║
║  Type: ${type.padEnd(5)} | Purpose: ${purpose}                     ║
║  To: ${identifier.padEnd(30)}                ║
║  OTP: ${otp} (Valid 10 mins)                              ║
╚════════════════════════════════════════════════════════════╝
    `);
  }
};

// ======================
// EXPORTS
// ======================
export default {
  sendOTPEmail,
  sendOTPSMS,
  logOTPForDev
};