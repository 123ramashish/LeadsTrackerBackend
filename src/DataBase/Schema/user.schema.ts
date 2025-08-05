import  mongoose from 'mongoose'
import  bcrypt from 'bcrypt'
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, "Phone Number required"],
    unique: true,
    match: [/^\d{10,14}$/, "Invalid international phone format"]
  },
  password: {
    type: String
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
    unique: true
  }
}, {
  timestamps: true  
});

const User = mongoose.model('User', userSchema);

export default User;