"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const userSchema = new mongoose_1.default.Schema({
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
        unique: true
    }
}, {
    timestamps: true
});
const User = mongoose_1.default.model('User', userSchema);
exports.default = User;
