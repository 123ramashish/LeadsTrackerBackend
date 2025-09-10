import * as webpush from 'web-push';
import Subscription from '../DataBase/Schema/subscription.schema';

const PUBLIC_VAPID_KEY = 'BFxjo28CiAwC2C7cplsi2Rp6czZi51Z69GNkA3xlpuyhi73wy24wmJc6bCprRd04eE59pQLFFJXdaPojjpTTSTE';
const PRIVATE_VAPID_KEY = 'bLWThKCfbDw2H-nA6HAdG7Gq5cln3of7qoflSXFfWRs';

webpush.setVapidDetails(
  'mailto:jaya.asopa@iameya.in', // or your email
  PUBLIC_VAPID_KEY,
  PRIVATE_VAPID_KEY
);


export const sendPushNotification = async (title: string, body: string) => {
  
  const subscriptions = await Subscription.find({}).lean();
//   console.log(`🔍 Found ${subscriptions.length} subs in DB`);
// console.log(subscriptions);

  const payload = JSON.stringify({ title, body });

  if (subscriptions.length === 0) {
    // console.log('🚫 No subscriptions found');
  }

  subscriptions.forEach(sub => {
    // console.log('📤 Sending notification to:', sub.subscription.endpoint);
    webpush.sendNotification(sub.subscription, payload)

      .then(() => {
        // console.log('✅ Notification sent successfully');
      })
      .catch(async (err:any) => {
        console.error('❌ Notification error:', err);
        if (err.statusCode === 410 || err.statusCode === 404) {
          // console.log('🗑️ Removing stale subscription:', sub._id);
          await Subscription.deleteOne({ _id: sub._id });
        }
      });
  });
};
