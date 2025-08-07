import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    required: [true, "Name is required"],
    validate: {
      validator: function (v: string) {
        return v.trim().length > 0;
      },
      message: "Name should not be empty"
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, "Invalid email format"]
  },
  phone: {
    type: String,
    required: [true, "Phone Number is required"],
    unique: true,
    match: [/^\d{10,14}$/, "Phone number must be between 10 to 14 digits"]
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [5, "Password must be at least 5 characters long"]
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Registration'
  },
  userRole: {
    type: String,
    enum: ["staff", "teamLeader", "developer", "admin"],
    default: "staff",
    required: true
  },
  lastLogin: {
    type: String
  },
  otp: {
    type: String
  },
  otpExpires: {
    type: Date
  },
  isDelete: {
    type: Boolean,
    default: false
  },
  refreshToken: {
    type: String,
      default: () => new mongoose.Types.ObjectId().toString(), 
  }
}, {
  timestamps: true
});

// Optional: hash password before save (you can enable if needed)
// userSchema.pre('save', async function (next) {
//   if (!this.isModified('password')) return next();
//   this.password = await bcrypt.hash(this.password, 10);
//   next();
// });

const User = mongoose.model('User', userSchema);
export default User;
