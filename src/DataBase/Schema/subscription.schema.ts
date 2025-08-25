import { Schema, model, models, Document } from 'mongoose';

export interface ISubscription extends Document {
  subscription: Record<string, unknown>; 
  createdAt?: Date;
  updatedAt?: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    subscription: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

const Subscription =
  models.Subscription || model<ISubscription>('Subscription', subscriptionSchema);

export default Subscription;
