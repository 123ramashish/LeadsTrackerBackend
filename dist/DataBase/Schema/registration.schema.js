"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const companyTypes = [
    "family", "college", "university", "school",
    "institute", "company", "other"
];
const companySchema = new mongoose_1.default.Schema({
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
        match: [/^\+?[0-9\s-]{10,16}$/, 'Invalid phone number format']
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
const Company = mongoose_1.default.model('Company', companySchema);
exports.default = Company;
//# sourceMappingURL=registration.schema.js.map