"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const userSchema = new mongoose_1.default.Schema({
    name: {
        type: String,
        trim: true,
        required: [true, "Name is required"],
        validate: {
            validator: function (v) {
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
        type: mongoose_1.default.Schema.Types.ObjectId,
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
        default: () => new mongoose_1.default.Types.ObjectId().toString(),
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
const User = mongoose_1.default.model('User', userSchema);
exports.default = User;
//# sourceMappingURL=user.schema.js.map