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

    village: {
      type: String,
      default: '',
      trim: true,
    },

    profileCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model('User', userSchema);

export default User;
