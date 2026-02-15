import mongoose from 'mongoose';

const companyTypes = [
  "family", "college", "university", "school", 
  "institute", "company", "other"
] as const;

const companySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: companyTypes,
    required: [true, 'Company type is required'],
    lowercase: true
  },
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  contactEmail: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
  },
  contactPhone: {
    type: String,
    required: [true, 'Contact phone is required'],
    match: [/^\d{10,14}$/, 'Phone must be 10-14 digits']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Optional fields for future lead tracking
  industry: String,
  website: String,
  address: String
}, {
  timestamps: true
});

// Compound index for uniqueness
companySchema.index({ name: 1, contactPhone: 1 }, { unique: true });

const Company = mongoose.model('Company', companySchema);
export default Company;