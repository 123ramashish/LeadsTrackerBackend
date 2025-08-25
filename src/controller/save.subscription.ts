import Subscription from "../DataBase/Schema/subscription.schema";

export default class SaveSubscription{
static async  SaveSubscription(req: Request) {
  const subscription = await req.json();

  await Subscription.create({ subscription });

  return Response.json({ message: 'Subscription saved' });
}
}