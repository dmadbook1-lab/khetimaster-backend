import mongoose from 'mongoose';

/*
|--------------------------------------------------------------------------
| AI GURU CHAT MESSAGE
|--------------------------------------------------------------------------
|
| A single user question or AI Guru reply. Assistant messages also keep the
| model, token usage, latency and tools the agent used so the admin panel
| can audit answers and track cost.
|
*/

const aiChatMessageSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AiChatSession',
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
    },

    // The user attached a photo (the image itself is not stored)
    hasImage: {
      type: Boolean,
      default: false,
    },

    // In-app shortcuts AI Guru suggested with this reply
    actions: {
      type: [
        {
          _id: false,
          screen: { type: String, required: true },
          label: { type: String, required: true },
          params: { type: mongoose.Schema.Types.Mixed, default: {} },
        },
      ],
      default: [],
    },

    farmField: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FarmField',
      default: null,
    },

    source: {
      type: String,
      default: 'aiguru',
      trim: true,
    },

    language: {
      type: String,
      default: 'en',
      trim: true,
    },

    model: {
      type: String,
      default: '',
    },

    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },

    latencyMs: {
      type: Number,
      default: 0,
    },

    toolCalls: {
      type: [String],
      default: [],
    },

    // The AI call failed and the text is a fallback message
    isError: {
      type: Boolean,
      default: false,
    },

    feedback: {
      rating: {
        type: String,
        enum: ['up', 'down', null],
        default: null,
      },
      comment: { type: String, default: '', trim: true, maxlength: 500 },
      createdAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

aiChatMessageSchema.index({ session: 1, createdAt: 1 });
aiChatMessageSchema.index({ user: 1, role: 1, createdAt: -1 });
aiChatMessageSchema.index({ 'feedback.rating': 1, createdAt: -1 });

const AiChatMessage = mongoose.model('AiChatMessage', aiChatMessageSchema);

export default AiChatMessage;
