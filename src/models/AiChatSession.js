import mongoose from 'mongoose';

/*
|--------------------------------------------------------------------------
| AI GURU CHAT SESSION
|--------------------------------------------------------------------------
|
| One conversation thread between a user and AI Guru. Messages live in
| AiChatMessage so a long conversation never hits the document size limit
| and the admin panel can page / search them.
|
| When a user "clears" or deletes a chat it is only hidden from the user
| (deletedByUser). The admin panel still sees the full history.
|
*/

const aiChatSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    title: {
      type: String,
      default: 'New chat',
      trim: true,
      maxlength: 120,
    },

    // Farm the conversation is about (null = general farming mode)
    farmField: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FarmField',
      default: null,
    },

    // Where the chat was started: aiguru, voice, farm, disease, mandi, ...
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

    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    lastMessagePreview: {
      type: String,
      default: '',
      trim: true,
    },

    // Running OpenAI token usage for cost tracking in the admin panel
    usage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },

    deletedByUser: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

aiChatSessionSchema.index({ user: 1, deletedByUser: 1, lastMessageAt: -1 });
aiChatSessionSchema.index({ lastMessageAt: -1 });

const AiChatSession = mongoose.model('AiChatSession', aiChatSessionSchema);

export default AiChatSession;
