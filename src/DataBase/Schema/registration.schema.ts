import  mongoose from 'mongoose'

const userTypes = [
  "user",
  "family",
  "college",
  "university",
  "school",
  "institute",
  "company",
  "other"
];

const registrationSchema = new mongoose.Schema({
  userType: {
    type: String,
    required: [true, 'User type is required'],
    enum: {
      values: userTypes,
      message: `Invalid user type. Valid types are: ${userTypes.join(', ')}`
    }
  },
  name: {
    type: String,
    required: [true, 'Name is required']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    validate: {
      validator: function(v:any) {
        return /^\d{10,14}$/.test(v);
            },
            message: (props: { value: string }) => `${props.value} is not a valid phone number! Must be 10-14 digits`
          }
        },
        email: {
          type: String,
          validate: {
            validator: function(v: string) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: (props: { value: string }) => `${props.value} is not a valid email address!`
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  }
}, {
  timestamps: true,    
});

const Registration = mongoose.model('Registration', registrationSchema);

export default Registration;