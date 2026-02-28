// src/seed.ts  —  run once: npx ts-node src/seed.ts
import 'dotenv/config';
import mongoose from 'mongoose';


const ago = (days: number, hours = 0) =>
  new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);

async function seed() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/followup-tracker';
  await mongoose.connect(uri);
  console.log('Connected — seeding…');

  // Clear existing data
  await Promise.all([Lead.deleteMany({}), Template.deleteMany({}), Message.deleteMany({})]);

  // ── Leads ──────────────────────────────────────────────────────────────────
  const leads = await Lead.insertMany([
    { name: 'Acme Corporation',  email: 'contact@acme.com',   phone: '+1 555 001 0001', company: 'Acme Corp' },
    { name: 'Globex Industries', email: 'info@globex.io',     phone: '+1 555 001 0002', company: 'Globex' },
    { name: 'Initech LLC',       email: 'hello@initech.com',  phone: '+1 555 001 0003', company: 'Initech' },
    { name: 'Umbrella Corp',     email: 'sales@umbrella.com', phone: '+1 555 001 0004', company: 'Umbrella' },
    { name: 'Stark Ventures',    email: 'tony@stark.io',      phone: '+1 555 001 0005', company: 'Stark' },
  ]);
  console.log(`✅ ${leads.length} leads inserted`);

  // ── Templates ──────────────────────────────────────────────────────────────
  const templates = await Template.insertMany([
    {
      name: 'Initial Follow-up', channel: 'whatsapp', usageCount: 34,
      body: 'Hi {{name}}! Just following up on our recent conversation. Do you have any questions I can help answer? 😊',
    },
    {
      name: 'Proposal Follow-up', channel: 'whatsapp', usageCount: 21,
      body: "Hey {{name}}, just wanted to check in on the proposal we sent over. Would love to hear your thoughts!",
    },
    {
      name: 'Meeting Request', channel: 'email', usageCount: 18,
      subject: 'Quick Catch-up – {{name}}',
      body: "Hi {{name}},\n\nHope you're doing well! Would you have 20 minutes this week for a quick call?\n\nBest,\n{{sender}}",
    },
    {
      name: 'Cold Outreach', channel: 'email', usageCount: 52,
      subject: 'Idea for {{company}}',
      body: "Hi {{name}},\n\nI came across {{company}} and thought our platform could be a great fit.\n\nBest,\n{{sender}}",
    },
    {
      name: 'No-Reply Nudge', channel: 'whatsapp', usageCount: 9,
      body: "Hi {{name}}, I know things get busy! Just a gentle nudge on my previous message. Happy to help whenever you're ready 🙏",
    },
  ]);
  console.log(`✅ ${templates.length} templates inserted`);

  // ── Messages ───────────────────────────────────────────────────────────────
  const [acme, globex, initech, umbrella, stark] = leads;
  const messages = await Message.insertMany([
    {
      leadId: acme._id, leadName: acme.name, leadEmail: acme.email, leadPhone: acme.phone,
      channel: 'whatsapp',
      body: 'Hi! Following up on our proposal for the Q3 integration project. Would love to connect this week!',
      waStatus: 'seen', sentAt: ago(8), deliveredAt: ago(8, -1), seenAt: ago(7, 2),
      replies: [], followUpStatus: 'auto_scheduled',
      followUpScheduledAt: new Date(Date.now() + 86_400_000), isBulk: false,
    },
    {
      leadId: globex._id, leadName: globex.name, leadEmail: globex.email, leadPhone: globex.phone,
      channel: 'whatsapp',
      body: 'Hey! Just wanted to check in — any thoughts on the pricing we discussed?',
      waStatus: 'replied', sentAt: ago(3), deliveredAt: ago(3, -1), seenAt: ago(2),
      repliedAt: ago(1),
      replies: [{ text: 'Yes! We loved it. Can we schedule a call this Thursday?', receivedAt: ago(1) }],
      followUpStatus: 'done', isBulk: false,
    },
    {
      leadId: initech._id, leadName: initech.name, leadEmail: initech.email, leadPhone: initech.phone,
      channel: 'whatsapp',
      body: 'Hi! Sending over our updated deck as promised. Let me know if you have any questions 🙌',
      waStatus: 'delivered', sentAt: ago(9), deliveredAt: ago(9, -2),
      replies: [], followUpStatus: 'auto_scheduled',
      followUpScheduledAt: new Date(Date.now() + 3_600_000 * 12), isBulk: false,
    },
    {
      leadId: umbrella._id, leadName: umbrella.name, leadEmail: umbrella.email, leadPhone: umbrella.phone,
      channel: 'email',
      subject: 'Your Custom Integration Proposal – Umbrella Corp',
      body: 'Dear team,\n\nThank you for your time last week. Please find attached our tailored proposal.\n\nWarm regards,\nJane',
      emailStatus: 'opened', sentAt: ago(7), openedAt: ago(7, -3),
      replies: [], followUpStatus: 'auto_scheduled',
      followUpScheduledAt: new Date(Date.now() + 7_200_000), isBulk: false,
    },
    {
      leadId: stark._id, leadName: stark.name, leadEmail: stark.email, leadPhone: stark.phone,
      channel: 'email',
      subject: 'Quick follow-up: Stark Ventures x Our Platform',
      body: "Hi Tony,\n\nJust circling back on the demo we ran last week. Happy to answer any questions.\n\nBest,\nJane",
      emailStatus: 'replied', sentAt: ago(5), openedAt: ago(4), repliedAt: ago(2),
      replies: [{ text: "Love the product! Let's move forward. Sending contract shortly.", receivedAt: ago(2) }],
      followUpStatus: 'done', isBulk: false,
    },
    {
      leadId: acme._id, leadName: acme.name, leadEmail: acme.email, leadPhone: acme.phone,
      channel: 'email',
      subject: '[Bulk] Q4 Offer: Limited-Time Upgrade',
      body: 'Hi {{name}},\n\nWe are excited to offer exclusive Q4 pricing to our valued leads.\n\nBest,\nSales Team',
      emailStatus: 'sent', sentAt: ago(1),
      replies: [], followUpStatus: 'pending', isBulk: true, bulkCount: 47,
    },
    {
      leadId: globex._id, leadName: globex.name, leadEmail: globex.email, leadPhone: globex.phone,
      channel: 'whatsapp',
      body: '[Bulk] 🎉 New feature alert! We just launched AI-powered lead scoring. Check it out!',
      waStatus: 'sent', sentAt: ago(0, 3),
      replies: [], followUpStatus: 'pending', isBulk: true, bulkCount: 120,
    },
  ]);
  console.log(`✅ ${messages.length} messages inserted`);

  await mongoose.disconnect();
  console.log('🎉 Seed complete');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});