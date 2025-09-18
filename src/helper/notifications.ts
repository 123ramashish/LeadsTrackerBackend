import * as webpush from "web-push";
import Subscription from "../DataBase/Schema/subscription.schema";

const PUBLIC_VAPID_KEY =
  "BFxjo28CiAwC2C7cplsi2Rp6czZi51Z69GNkA3xlpuyhi73wy24wmJc6bCprRd04eE59pQLFFJXdaPojjpTTSTE";
const PRIVATE_VAPID_KEY = "bLWThKCfbDw2H-nA6HAdG7Gq5cln3of7qoflSXFfWRs";

// Configure VAPID
webpush.setVapidDetails(
  "mailto:jaya.asopa@iameya.in",
  PUBLIC_VAPID_KEY,
  PRIVATE_VAPID_KEY
);

export const sendPushNotification = async (
  userIds: string | string[] | null,
  title: string,
  body: string
) => {
  let query: any = { status: "active" };

  if (Array.isArray(userIds)) {
    query.user = { $in: userIds }; // ✅ multiple users
  } else if (typeof userIds === "string") {
    query.user = userIds; // ✅ single user
  }

  const subscriptions = await Subscription.find(query).lean();
  const payload = JSON.stringify({ title, body });

  if (subscriptions.length === 0) {
    console.log("🚫 No subscriptions found for:", userIds);
    return;
  }

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
          },
        },
        payload
      );
      console.log(`✅ Notification sent to ${sub.user}: ${sub.endpoint}`);
    } catch (err: any) {
      console.error("❌ Notification error:", err?.statusCode, err?.message);

      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log("🗑️ Removing stale subscription:", sub._id);
        await Subscription.deleteOne({ _id: sub._id });
      }
    }
  }
};
