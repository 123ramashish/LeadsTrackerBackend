import Subscription from "../DataBase/Schema/subscription.schema";

export default class SaveSubscription {
  static async SaveSubscription(req: Request) {
    try {
      const subscription = await req.json();

      if (
        !subscription?.endpoint ||
        !subscription?.keys?.p256dh ||
        !subscription?.keys?.auth
      ) {
        return Response.json(
          { message: "Invalid subscription object" },
          { status: 400 }
        );
      }

      // Attach userId/companyId if available in request
      const { userId, companyId } = subscription;

      await Subscription.findOneAndUpdate(
        { endpoint: subscription.endpoint },
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
          user: userId || null,
          company: companyId || null,
          status: "active",
        },
        { upsert: true, new: true }
      );

      return Response.json({ message: "Subscription saved successfully" });
    } catch (err: any) {
      return Response.json(
        { message: err?.message || "Error saving subscription" },
        { status: 500 }
      );
    }
  }
}
