import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      default: '',
      trim: true,
    },

    fullName: {
      type: String,
      default: '',
      trim: true,
    },

    state: {
      type: String,
      default: '',
      trim: true,
    },

    district: {
      type: String,
      default: '',
      trim: true,
    },

    taluka: {
      type: String,
      default: '',
      trim: true,
    },

    village: {
      type: String,
      default: '',
      trim: true,
    },

    // Community profile
    avatar: {
      type: String,
      default: '',
      trim: true,
    },

    bio: {
      type: String,
      default: '',
      trim: true,
      maxlength: 150,
    },

    profileCompleted: {
      type: Boolean,
      default: false,
    },

    // 'admin' unlocks the admin panel APIs (e.g. AI Guru chat history)
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model('User', userSchema);

export default User;